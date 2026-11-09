# Mindwhisper

## What it is

Mindwhisper is a desktop dictation app for macOS and Windows. Press a global shortcut in any app, speak Portuguese (Brazil) or English, and cleaned-up text is pasted into the field you were typing in.

The flow: **shortcut → speak → shortcut again → the audio is transcribed and tidied up → the text is pasted into the focused app.** A small floating overlay shows the state (recording, working, inserted, error). The main window is only for onboarding, settings, history and the personal dictionary; dictation never needs it.

## How it works

```
React (main window)  ──events/store──┐
React (overlay window: DictationController)
        │ ports                      │
        ├─ AudioPort ───────invoke──► Rust: audio (cpal thread, WAV)
        ├─ InsertionPort ───invoke──► Rust: insertion (arboard + enigo)
        ├─ TranscriptionService ─HTTP─► server /v1/transcribe ─► SttProvider
        └─ CleanupService ───────HTTP─► server /v1/cleanup    ─► LlmProvider
Rust: shortcuts (global shortcut → event dictation://hotkey), windows (overlay/main/tray), autostart
```

The dictation state machine (`idle → recording → processing → inserting → completed`, plus `error`) lives in a TypeScript `DictationController` hosted in the **overlay window**. That window is created at startup and only hidden when idle, so its JavaScript keeps running when the main window is closed and there is exactly one source of truth for the session. The main window sends commands and mirrors snapshots through events.

Audio capture and text insertion are native (Rust) on purpose. Capturing in Rust (`cpal`, on its own thread) works with the main window hidden, avoids webview microphone-permission quirks and does not depend on React being rendered. Insertion needs the system clipboard and simulated Cmd/Ctrl+V keystrokes, which a webview cannot do. Transcription and cleanup go through a small backend so that no provider key ever ships in the app.

## Prerequisites

- Node.js 22.9 or newer (built and tested with Node 24) and pnpm (`packageManager` is pnpm 10.16.1). The server scripts need Node 22.9+ for `--env-file-if-exists`.
- Rust stable 1.80 or newer (built with 1.93)
- Tauri 2 system dependencies: on macOS the Xcode Command Line Tools; on Windows WebView2 and the MSVC build tools
- A microphone

## Setup

```bash
pnpm install
cd server && pnpm install && cd ..
cp server/.env.example server/.env
```

Then edit `server/.env`. It lists every variable with a blank value (the same names as the root `.env.example`); a blank value counts as unset and the default applies. The only line you must fill in is `APP_TOKENS`:

- `APP_TOKENS`: a comma-separated list with at least one access token, for example `APP_TOKENS=dev-token`. Each user pastes one of the tokens into Settings → Backend. The server refuses to start without one.
- Leave everything else blank to run with `STT_PROVIDER=mock` and `LLM_PROVIDER=mock` (the defaults): a fixed transcript and a simple cleanup, no external account needed. Use this first.
- For real providers see [docs/PROVIDERS.md](docs/PROVIDERS.md).

`pnpm server:dev` and `pnpm start` inside `server/` load `server/.env` automatically (`tsx --env-file-if-exists=.env`). A missing `.env` is not an error, but then `APP_TOKENS` must come from the shell environment (`APP_TOKENS=dev-token pnpm server:dev`). Variables already set in the shell take precedence over the file.

## Run in development

Terminal 1, the server (port 8787 by default):

```bash
pnpm server:dev
```

Terminal 2, the app:

```bash
pnpm tauri dev
```

The first run walks through onboarding. On the "Try it" step enter the server URL (`http://127.0.0.1:8787`) and one of the tokens from `APP_TOKENS`; you can also change both later in Settings → Backend. Mock mode still needs a token, because the server checks it on every request. Check the server with `curl -s localhost:8787/health`, which returns `{"ok":true}` without a token.

## Using real providers

Set `STT_PROVIDER`, `LLM_PROVIDER` and their keys in `server/.env` as described in [docs/PROVIDERS.md](docs/PROVIDERS.md), which also contains the protocol for choosing a speech provider for Portuguese (Brazil) and English. The real adapters have only been tested against mocked HTTP.

## Tests

| Command | What it covers |
|---|---|
| `pnpm check` | TypeScript type check and the Vitest suite: state machine, controller, services, storage, stores, UI components, overlay host |
| `pnpm test:e2e` | Playwright against the Vite dev server with the Tauri runtime mocked (commands, events across the two windows, plugin-store) and a mocked backend: onboarding, settings persistence and delete-all, history, and the dictation flow including cancel, retry, history off and the hotkey event. Run `pnpm exec playwright install chromium` once first. |
| `cd server && pnpm test` | Backend routes, auth, validation, rate limit, and the provider adapters with mocked `fetch` |
| `cd src-tauri && cargo test` | WAV encoding and resampling, level metering, insertion logic with fake clipboard and keyboard, shortcut parsing and mode mapping |

Native audio capture, real pasting into other apps, global shortcuts, the tray and overlay focus behaviour are **not** covered by automated tests. They are covered by the checklist in [docs/MANUAL-TEST.md](docs/MANUAL-TEST.md).

## Build

```bash
pnpm tauri build
```

The result is unsigned. Code signing, notarization and auto-update are out of scope for the MVP (see Known limitations).

## Permissions

- **macOS**
  - Microphone: prompted the first time you allow it in onboarding.
  - Accessibility: needed to paste into other apps. Enable it in System Settings → Privacy & Security → Accessibility. Onboarding and the error message offer a button that opens that pane.
  - In `pnpm tauri dev` the permissions belong to the terminal or IDE that launched the app, not to Mindwhisper.
- **Windows**
  - Microphone: the Settings → Privacy → Microphone toggle must allow desktop apps.
  - Apps running as administrator may ignore simulated paste; the text is left on the clipboard.

## Privacy

- While you dictate, the audio is sent to your Mindwhisper server, which forwards it to the configured speech-to-text provider. The recognized text is then sent to your server and on to the configured AI provider for cleanup (skipped when cleanup is off or set to "Preserve my words"). Nothing is sent when you are not dictating.
- Audio is never written to disk. It exists in memory during a session and, after a failure, only until you retry or dismiss.
- History is stored only on your computer, can be turned off in Settings, and has a retention period. The personal dictionary is also local.
- "Delete all my data" (Settings → Privacy and data) removes your settings, history and dictionary and returns the app to onboarding. It does not delete anything held by your server or a provider; see each provider's retention policy.
- Neither the app nor the server logs audio or text. Provider API keys exist only in the server environment.

## Project structure

```
package.json, vite.config.ts, vitest.config.ts, playwright.config.ts, tsconfig.json
index.html, overlay.html            two Vite entries: main window and overlay
src/
  app/                              main window shell (App, Sidebar, routes)
  components/                       UI kit and FloatingOverlay
  features/                         dictation, history, dictionary, settings, onboarding pages
  overlay/                          overlay window entry and host (controller wiring)
  services/                         backend client, transcription, text processing, audio and insertion adapters,
                                    storage, Tauri command wrappers, DictationController and event bridge
  stores/                           Zustand stores (settings, history, dictionary, dictation)
  styles/, types/, test/            design tokens and theme, domain and IPC types, test setup
src-tauri/                          Tauri 2 shell (Rust)
  src/audio, insertion, shortcuts, windows, permissions.rs, tray.rs, error.rs
  capabilities/, tauri.conf.json, Info.plist
server/                             Hono backend
  src/routes, middleware, providers, config.ts, app.ts, index.ts
e2e/                                Playwright specs and the mocked Tauri runtime (fixtures.ts)
docs/                               PROVIDERS.md, PLATFORM-LIMITATIONS.md, MANUAL-TEST.md, design spec and plan under team8/
```

## Known limitations

The main ones: macOS needs Accessibility to paste, paste is blocked by some apps, the overlay's no-focus behaviour is unverified on real systems, transcription is batch only, the backend token is stored in the settings file and not the keychain, the real provider adapters are untested against live APIs, and Linux, signing and auto-update are not covered. A global shortcut conflict at startup is only logged, not shown in the interface. The full list with reasons is in [docs/PLATFORM-LIMITATIONS.md](docs/PLATFORM-LIMITATIONS.md).

## Verification status

Run on 2026-10-20 on one macOS machine, against the final code:

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | OK, lockfile up to date |
| `pnpm check` (typecheck + Vitest) | OK, 17 test files, 192 tests passed |
| `pnpm build` | OK, both HTML entries built |
| `pnpm test:e2e` | OK, 13 Playwright tests passed (Chromium, mocked Tauri runtime) |
| `cd server && pnpm install --frozen-lockfile && pnpm test && pnpm typecheck` | OK, 5 test files, 38 tests passed, typecheck clean (re-run after the server .env fix) |
| `cd src-tauri && cargo test && cargo check` | OK, 37 passed, 1 ignored (the hardware capture test), 0 failed |
| `pnpm tauri build --debug --no-bundle` | OK, the full app compiled (`src-tauri/target/debug/mindwhisper`); it was not launched |

The MVP is complete when a user can do the twelve things below. "Mocks" means the flow was exercised in the real app UI and controller with the Tauri runtime and the backend mocked, so it proves the wiring and the logic, not the native layer or a provider. The Playwright specs are in `e2e/`, the Vitest tests sit next to the code in `src/` and `server/src/`. Manual items refer to checklist rows in [docs/MANUAL-TEST.md](docs/MANUAL-TEST.md); no manual run has been recorded yet, so none of them counts as verified.

| # | Criterion | Verified automatically | Covered only by docs/MANUAL-TEST.md | Not verified |
|---|---|---|---|---|
| 1 | Install and launch the desktop application | `pnpm tauri build --debug --no-bundle` compiles the full app (Rust and frontend). | "Install and launch" | That the built app starts, shows its windows and tray, and that a release bundle installs. The app was never launched, and nothing was built or run on Windows. |
| 2 | Complete microphone and shortcut setup | Onboarding flow and a blocked microphone with Retry, with mocks (`e2e/onboarding.spec.ts`); shortcut parsing, mode mapping and conflict classification in Rust (`cargo test`). | Onboarding rows: microphone prompt, microphone denied, shortcut registers and conflict message | The real system microphone prompt and real shortcut registration or conflicts. |
| 3 | Focus a text field in another application | Nothing: this is a property of the operating system and the target app. | "Dictate into" rows (browser, Notes or Word, VS Code, Slack, terminal) | All of it. |
| 4 | Activate dictation using a global shortcut | The `dictation://hotkey` event starts and stops a dictation, with mocks (`e2e/dictation.spec.ts`); the overlay host's handling of hotkey actions and the Rust key-repeat filter and mode mapping (Vitest, `cargo test`). | Shortcut rows: registers, conflict, hold-to-talk, and "start dictation with the shortcut while another app is focused" | The operating system actually delivering the global shortcut; hold-to-talk on real key-release events. |
| 5 | Speak in Portuguese or English | The language setting persists across a reload (`e2e/settings.spec.ts`), and choosing Português (Brasil) in Settings reaches the transcribe and cleanup requests as `pt-BR`, with mocks (`e2e/dictation.spec.ts`); `TranscriptionService` Vitest also checks the pass-through. | "Language" row: Portuguese (Brasil) and English dictations | Speech recognition in either language: no real audio was ever transcribed. |
| 6 | Receive an accurate transcript with appropriate punctuation | Only that a transcript from the backend is cleaned and inserted, with mocks. The mock cleanup adds punctuation, which says nothing about a real model. | "Accuracy and punctuation" row, with the protocol in [docs/PROVIDERS.md](docs/PROVIDERS.md) | Accuracy and punctuation quality. No provider has been called or benchmarked. |
| 7 | Apply optional AI cleanup | Cleanup on, off and "Preserve my words" (no cleanup request, local trim and dictionary only); style, filler and punctuation options reach the request; a cleanup failure falls back to the raw transcript (Vitest `DictationController` and `CleanupService`); the backend cleanup route with a mock provider and the Anthropic adapter with mocked HTTP (`server` tests). | "AI cleanup" row: each style and the off switch with a real provider | The quality of real cleanup output; the Anthropic adapter against the live API; the default `LLM_MODEL` on a real account. |
| 8 | Insert the resulting text into the target application | Exactly one `insert_text` per session with the final text, with mocks (`e2e/dictation.spec.ts`); duplicate-insertion guard and insertion failure with retry (Vitest); insertion order and clipboard-restore logic with a fake clipboard and keyboard (`cargo test`). | "Dictate into" rows, clipboard before and after, image on the clipboard, Accessibility missing | A real paste in a real application, real clipboard restoration, the Accessibility and administrator-window cases, non-QWERTY layouts. |
| 9 | Cancel dictation or recover from an error | Cancel while recording inserts nothing and releases the microphone; a transcription failure shows Retry and a retry inserts once without re-recording, with mocks (`e2e/dictation.spec.ts`); cancel in each state, microphone and insertion failures, retry and dismiss (Vitest). | "Esc cancels", "unplug the microphone", "backend offline", "5-minute recording", "Accessibility missing" rows | Real Escape handling across apps, a real device loss, real network failures. |
| 10 | Use the application without exposing API credentials | Provider keys are read only by the server (`server/src/config.ts`) and the server rejects missing or wrong tokens (`server/src/app.test.ts`). A one-off search of `src/`, `src-tauri/` and the built `dist/` found no provider key names or provider URLs; that was a manual grep, not a test. | "No provider key in the app" row: inspect the app's network traffic and settings file | A test that fails if a key reaches the client. The access token the user pastes is stored in the settings file in plain text (see limitations). |
| 11 | Control whether transcription history is retained | With history off nothing is stored and the History page says so, with mocks (`e2e/dictation.spec.ts`, `e2e/history.spec.ts`); retention, pruning and deletion (Vitest `storage`); search, delete, clear all (`e2e/history.spec.ts`); "Delete all my data" (`e2e/settings.spec.ts`). | "History" rows, including turning history off and "Delete all my data" | The same behaviour against the real on-disk store file. |
| 12 | Complete the core workflow without needing to navigate back to the main window | Most `e2e/dictation.spec.ts` tests start a dictation from the main window's Start button and then use the overlay's Stop, Cancel and Retry buttons. Exactly one spec ("the shortcut event drives the same flow") runs the whole flow, start and stop, from the hotkey event alone without clicking anything in the main window, with mocks. The controller lives in the overlay host and does not depend on the main window. | "Close the main window" and "complete a dictation without opening the main window" rows | Behaviour with the main window really closed or hidden, and the overlay appearing and staying out of the way on each OS. |

Also not verified: Linux, code signing, notarization and auto-update (out of scope), and everything related to Windows.
