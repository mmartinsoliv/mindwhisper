# Platform limitations

What the MVP does not do or cannot guarantee, and why. Items marked "unverified" are not covered by any automated test and have not been run on hardware yet; `docs/MANUAL-TEST.md` is the checklist for them.

## Permissions

- **macOS needs the Accessibility permission to paste.** Inserting text works by simulating Cmd+V in the focused app, and macOS only allows that for trusted apps. Without it the text stays on the clipboard and the overlay says so.
- **In development the permission belongs to the launching process.** With `pnpm tauri dev`, macOS attaches Microphone and Accessibility to the terminal or IDE that started the app, not to Mindwhisper. Grant them to that program, or test with a built app.
- **The macOS microphone usage string may be missing in `tauri dev`.** `src-tauri/Info.plist` is only merged into bundled builds, so a development run may not show the usual prompt text. Unverified.

## Insertion

- **Paste simulation is blocked or ignored in some places:** apps running as administrator on Windows (a normal process cannot send input to an elevated one), secure-input fields such as password boxes, and some remote-desktop, virtual-machine and terminal apps. The text is left on the clipboard when this happens.
- **Only text on the clipboard is preserved.** Images, files and other non-text clipboard contents cannot be saved and restored, so they are replaced by the dictated text; the app reports it (`clipboardRestored: false`).
- **The Cmd+V keystroke is layout-dependent** on non-QWERTY keyboards. Unverified.
- **Reinsert from History hides the main window** (and waits briefly) so that focus returns to the previous app before pasting. If that app cannot take the paste, the main window is shown again with an error.

## Shortcuts

- **Escape is registered globally only while a dictation is active.** During that time other apps do not receive Escape. It is released when the dictation ends or is cancelled.
- **A shortcut that is already taken by the system or another app** cannot be registered. A conflict found when you change the shortcut in Settings is shown there. A conflict found at app startup is only written to the log and not shown in the interface.
- **The currently registered shortcut stays live while you capture a new one** in Settings or onboarding; pressing it during capture still starts a dictation. The new one replaces it only once it is accepted.
- **Hold to talk depends on key-release events** and has had little testing. Toggle mode (press to start, press to stop) is the default and the tested path.

## Overlay

- **The overlay must not take keyboard focus, and this is unverified on real systems.** It is created unfocusable and shown without activating the app, but macOS can activate an app when a window is shown and Windows can behave differently per configuration (spec section 10, risk 1). Fallbacks if it steals focus: a non-activating panel (`tauri-nspanel`) on macOS and the `WS_EX_NOACTIVATE` window style on Windows.
- **Position** is bottom-centre of the screen with the cursor; multi-monitor and mixed-DPI layouts are unverified.

## Audio and transcription

- **One recording is capped at 300 seconds.** At the cap the microphone is released and the recording is processed as if you had stopped.
- **Batch transcription only.** The whole recording is sent when you stop; there is no live text while you speak. Streaming is a later sub-project (the client interface already has an optional `transcribeStream`).
- **Cancelling during the start-up phase** (`audio_cancel` while the microphone is still opening) can leave the device open for a few hundred milliseconds, until the controller's late cancel releases it.
- **Audio is resampled to 16 kHz mono with linear interpolation and no low-pass filter.** This is adequate for speech but can add mild aliasing.
- **Devices are matched by name**, falling back to the system default when the saved microphone is gone.
- **Native microphone capture and paste have not been run on hardware** in this project. The Rust side is covered by unit tests with fakes only.

## Data and security

- **The backend access token is stored in the settings JSON** inside the app data folder, not in the operating system keychain. Moving it to the keychain is a later hardening step.
- **The backend URL and token are saved on every keystroke** while you type them in Settings → Backend (or in the onboarding "Try it" step), so a half-typed value is persisted and used by the next dictation.
- **The webview content security policy is disabled** (`"csp": null` in `src-tauri/tauri.conf.json`).
- **The server rate limit is a fixed one-minute window per token and lives in memory**, so it resets on restart and is not shared between instances.

## Providers and languages

- **Provider adapters are mostly untested against live APIs.** OpenAI transcription and Anthropic cleanup were written from public documentation and tested with mocked HTTP only. The Gemini adapters had one live smoke test with two short synthetic recordings. The default `LLM_MODEL` has not been confirmed on a live account. No provider has been benchmarked for accuracy or latency (see `docs/PROVIDERS.md`).
- **The cleanup prompt can reformat dates and numbers** to the locale's convention, which may conflict with "never change the meaning" for the minimal style on short inputs.
- **Languages are limited to Automatic, English and Português (Brasil).**

## Distribution and platforms

- **Linux is untested.** Platform code is guarded with `cfg(target_os)` where practical and may compile, but nothing was run there.
- **No code signing, notarization or auto-update.** `pnpm tauri build` produces unsigned bundles; macOS Gatekeeper and Windows SmartScreen will warn on first launch.
- **End-to-end tests run against the web build with the Tauri runtime mocked.** They cover the interface and the orchestration, not the native layer; see `docs/MANUAL-TEST.md`.
