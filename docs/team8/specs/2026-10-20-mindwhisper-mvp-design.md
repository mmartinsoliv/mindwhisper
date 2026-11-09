# Mindwhisper MVP — Design Spec

Sub-project 1 of 4. Scope: a working end-to-end dictation app (acceptance criteria 1–12 of the brief), including *basic* history, dictionary and settings. Streaming, advanced reliability, accounts/billing/sync and signing/updater are later sub-projects.

## 1. Product

Mindwhisper: a Tauri 2 desktop app. Press a global shortcut in any app, speak (Portuguese-BR or English), release/press again, and cleaned-up text is pasted into the focused field. A small floating overlay shows state. The main window is only for onboarding, settings, history and dictionary — the core workflow never needs it.

Original brand: name **Mindwhisper**, accent violet `#7C5CFF` (dark: `#9B83FF`), neutral warm-gray surfaces, Inter font, 12px radius on controls, 20px on cards, 999px on the overlay pill.

## 2. Decisions and trade-offs

| Decision | Choice | Why / trade-off |
|---|---|---|
| Audio capture | Rust (`cpal`) on a dedicated thread, WAV 16 kHz mono 16-bit, returned to JS as raw bytes | Works with the main window hidden; avoids WKWebView mic-permission quirks; capture independent of React. Cost: resampling code in Rust. |
| Dictation orchestration | TypeScript `DictationController` hosted in the **overlay window** (always created at startup, hidden when idle) | JS keeps running with the main window closed; single source of truth; testable with injected ports. |
| STT | Batch (whole utterance, on stop) via backend `/v1/transcribe`; provider behind interface. Default adapter OpenAI transcription API; `mock` adapter for dev/tests. | Batch is reliable and simple; streaming is Sub-project 3 (interface already has optional `transcribeStream`). Accuracy for PT-BR/EN must be **measured on real audio**, not assumed. |
| Cleanup LLM | Backend `/v1/cleanup`, adapter Anthropic Messages API (model from env), `mock` adapter | Keys only on server. If cleanup fails, the raw transcript is inserted and the user is told. |
| Provider comparison (informational) | OpenAI transcribe models: batch, `prompt` param accepts vocabulary hints, PT+EN supported. Deepgram Nova: streaming, keyterm boosting, PT supported. Both to be benchmarked in Sub-project 3. | Neither claim is verified here; no credentials in this environment. |
| Insertion | Save clipboard text → write text → simulate Cmd/Ctrl+V (`enigo`) → wait → restore clipboard (`arboard`) | Most compatible. Limits: non-text clipboard contents cannot be preserved (reported); macOS needs Accessibility permission; some apps block synthetic input. If paste fails, text stays on clipboard and the user is told. |
| Storage | `tauri-plugin-store` JSON files (`settings.json`, `history.json`, `dictionary.json`) behind a `KeyValueStore` interface | No DB dependency for MVP; history capped at 500 entries. |
| Backend | Hono on Node (TypeScript), zod validation, bearer-token auth (`APP_TOKENS`), in-memory rate limit, no body logging | Smallest viable; no Postgres until accounts exist. |
| Frontend | React 19, TS, Vite (two HTML entries: `index.html` main, `overlay.html`), Zustand, Tailwind v4, Vitest; no router library (tab state) | Smallest dependency set. |
| E2E | Playwright against the Vite dev server with Tauri IPC mocked (`@tauri-apps/api/mocks`) | Real Tauri-driver E2E is out of scope; native paths get a manual checklist. |
| Git | Folder is not a git repo; no commits are made | — |

## 3. Architecture

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

## 4. Contracts

### 4.1 Tauri commands (Rust)

Errors are `{ "code": string, "message": string }`. Codes: `already_recording`, `not_recording`, `no_input_device`, `permission_denied`, `device_error`, `insert_failed`, `shortcut_invalid`, `shortcut_taken`, `internal`.

| Command | Args | Returns |
|---|---|---|
| `audio_list_devices` | – | `{ id: string, name: string, isDefault: boolean }[]` |
| `audio_probe` | `deviceId?: string` | `void` — opens the input ~300 ms to trigger/verify mic permission |
| `audio_start` | `deviceId?: string` | `void` |
| `audio_stop` | – | raw bytes (`ArrayBuffer`) of a complete WAV file, 16 kHz mono PCM16 |
| `audio_cancel` | – | `void` (discards buffer, releases device) |
| `insert_text` | `text: string, restoreClipboard: boolean` | `{ clipboardRestored: boolean }` |
| `check_permissions` | – | `{ platform: 'macos'\|'windows'\|'linux', accessibility: 'granted'\|'denied'\|'unsupported' }` |
| `open_system_settings` | `pane: 'accessibility'\|'microphone'` | `void` |
| `shortcut_register` | `accelerator: string, mode: 'toggle'\|'hold'` | `void` (replaces any previous registration) |
| `shortcut_unregister` | – | `void` |
| `shortcut_set_cancel_enabled` | `enabled: boolean` | `void` (registers/unregisters global `Escape`) |
| `overlay_show` / `overlay_hide` | – | `void` — shown without taking keyboard focus |
| `overlay_resize` | `width: number, height: number` | `void` |
| `main_show` | – | `void` |

Events (Rust → JS): `audio://level` `{ rms: number }` (0..1, ≈30/s while recording); `audio://error` `{ code, message }` (device lost mid-recording); `audio://limit-reached` `{}` (300 s cap hit); `dictation://hotkey` `{ action: 'toggle'|'start'|'stop'|'cancel' }` (toggle mode: every press → `toggle`; hold mode: press → `start`, release → `stop`; Escape → `cancel`).

Events (JS ↔ JS, `@tauri-apps/api/event`): `dictation://state` (overlay → all) payload `DictationSnapshot`; `dictation://command` (main → overlay) `{ type: 'toggle'|'cancel'|'retry'|'dismiss' }`; `settings://changed`, `history://changed`, `dictionary://changed` (no payload; receivers reload from store).

### 4.2 Backend HTTP API

Auth on everything except `/health`: `Authorization: Bearer <token>`, tokens from `APP_TOKENS` (comma-separated).
Errors: `{ "error": { "code", "message" } }`; codes `unauthorized` 401, `invalid_request` 400, `payload_too_large` 413, `rate_limited` 429, `provider_error` 502, `provider_timeout` 504.

- `GET /health` → `{ "ok": true }`
- `POST /v1/transcribe` — `multipart/form-data`: `audio` (file, ≤ 25 MB, `audio/wav`), `language` (`auto|en|pt-BR`), `vocabulary` (JSON array string, ≤ 100 terms, each ≤ 64 chars). → `{ "text": string, "language": string|null, "durationMs": number|null, "provider": string }`
- `POST /v1/cleanup` — JSON `{ text: string(≤20000), language: 'auto'|'en'|'pt-BR', style: 'minimal'|'professional'|'casual'|'concise', removeFillers: boolean, autoPunctuation: boolean, dictionary: { term: string, spoken?: string }[] }` → `{ "text": string, "provider": string }`
- Rate limit: 30 requests/min per token (configurable `RATE_LIMIT_PER_MIN`). Request bodies and returned text are never logged.
- Env (names only in `.env.example`): `PORT`, `APP_TOKENS`, `RATE_LIMIT_PER_MIN`, `STT_PROVIDER` (`openai|mock`), `OPENAI_API_KEY`, `STT_MODEL`, `LLM_PROVIDER` (`anthropic|mock`), `ANTHROPIC_API_KEY`, `LLM_MODEL`.

### 4.3 Settings (v1)

```ts
type Language = 'auto' | 'en' | 'pt-BR';
type CleanupStyle = 'verbatim' | 'minimal' | 'professional' | 'casual' | 'concise';
interface Settings {
  version: 1;
  onboardingDone: boolean;
  shortcut: { accelerator: string; mode: 'toggle' | 'hold' }; // default CommandOrControl+Shift+Space, toggle
  microphoneId: string | null;
  language: Language; // default 'auto'
  cleanup: { enabled: boolean; style: CleanupStyle; removeFillers: boolean; autoPunctuation: boolean }; // enabled, 'minimal', true, true
  history: { enabled: boolean; retentionDays: number | null }; // enabled, 30
  startup: { launchAtLogin: boolean };
  theme: 'system' | 'light' | 'dark';
  restoreClipboard: boolean; // true
  showPreview: boolean; // true: overlay shows recognized text before insertion
  backend: { url: string; token: string }; // url default http://127.0.0.1:8787
}
```
`verbatim` = no LLM call; local trim plus deterministic dictionary replacement only. Audio is never written to disk; there is no setting to save audio in the MVP.

## 5. Dictation state machine

States: `idle → recording → processing → inserting → completed → idle`, plus `error`. Pure reducer `transition(state, event)`; illegal events are ignored (returned state identical).

- `START` only from `idle` (or from `completed`/`error` after reset). A second `START` while not idle is ignored → no concurrent sessions.
- `STOP` only from `recording`; `CANCEL` from `recording|processing|inserting` → `idle` (aborts in-flight work via `AbortController`, releases mic).
- `FAIL(error)` from `recording|processing|inserting` → `error` with `{ stage, message, retryable }`. `RETRY` from `error`: stage `transcribe|cleanup` re-runs from the in-memory WAV (kept only while in `error`, never persisted); stage `insert` re-runs insertion with the final text. `DISMISS` → `idle` and drops the buffer.
- Every session has a `sessionId`; the controller inserts at most once per id (duplicate-insertion guard).
- `completed` auto-returns to `idle` after 1200 ms.
- Max recording 300 s (Rust cap emits `audio://limit-reached` → controller issues `STOP`).
- Focus changes: the overlay never takes keyboard focus; insertion targets whatever app is frontmost at insertion time. If paste fails, the text is left on the clipboard and the error says so.

`DictationSnapshot = { state, sessionId, startedAt?: number, level?: number, rawText?: string, finalText?: string, error?: { stage, message, retryable } }`.

## 6. Pipeline

`stop → WAV bytes → TranscriptionService.transcribe(wav, {language, vocabulary}) → raw transcript → (if cleanup.enabled && style≠verbatim) CleanupService.cleanup(...) else local trim → apply dictionary replacements → (optional preview delay) → insert → history.add(raw, final) if history.enabled`. Raw transcript is preserved in history entries. Empty transcript → `error` stage `transcribe`, message "No speech detected", retryable.

Cleanup prompt rules (server): never add information; keep names/acronyms/technical terms and dictionary spellings; keep the source language (no translation); keep numbers/dates in the locale's convention; output only the text.

## 7. Screens

- **Onboarding** (6 steps): welcome, microphone permission (`audio_probe`), shortcut (capture + `shortcut_register`), test (record → transcribe → insert into a built-in text box), language, done with quick-start.
- **Main**: left rail (Dictation, History, Dictionary, Settings). Dictation page: large record button, last 5 results, shortcut guide. History: search, copy, reinsert, delete, clear all. Dictionary: add/remove terms with optional "spoken as". Settings: everything in 4.3 plus microphone select, backend URL/token, disclosure text naming the third-party STT/LLM providers, "Delete all my data".
- **Overlay** (320×64 pill, bottom-center of the screen under the cursor, translucent, no focus): idle is hidden; recording = waveform + timer + stop/cancel; processing = progress; completed = check; error = message + Retry/Dismiss. Dark and light themes; visible focus rings; `prefers-reduced-motion` respected.

## 8. Privacy and security

Mic permission requested explicitly in onboarding with disclosure of what leaves the device (audio → backend → STT provider; text → backend → LLM provider). Audio never stored. History opt-out and retention. No raw audio or text in logs (client and server). "Delete all my data" clears settings, history, dictionary. API keys exist only in server env. The per-user backend token is stored in the settings JSON (OS keychain is a later hardening step; listed in limitations).

## 9. Testing

- Vitest (frontend): state machine transitions; controller (cancel, retry, duplicate insertion, audio error, provider failure, cleanup fallback); CleanupService/dictionary application; language selection → request options; settings migration/defaults; history retention + deletion; privacy (history disabled writes nothing; delete-all clears everything). Mock providers deterministic.
- Vitest (server): auth, validation, rate limit, routes with mock providers, adapters with mocked `fetch`.
- `cargo test`: WAV encoding/resampling, RMS level, insertion logic with fake clipboard/keyboard traits, shortcut mode mapping.
- Playwright E2E with mocked IPC: onboarding, settings persistence, history, main dictation flow.
- `docs/MANUAL-TEST.md`: macOS and Windows checklist (permission prompts, paste into browser/IDE/Slack/Notes, overlay does not steal focus, clipboard restoration, hold-to-talk).

## 10. Known risks

1. Overlay may steal focus on macOS (Tauri `show()` can activate the app). Requirement: it must not. Fallback if it does: `tauri-nspanel` on macOS / `WS_EX_NOACTIVATE` on Windows. Verify manually.
2. macOS dev builds attribute mic/Accessibility permission to the launching terminal/Cursor, not the app.
3. Global shortcut conflicts with other apps → `shortcut_taken` error surfaced in settings.
4. Provider adapters are written against public docs and tested with mocked HTTP only; live behavior is unverified without credentials.
5. Linux is not a target in this sub-project (code is `cfg`-guarded where practical).

## 11. Out of scope

Streaming transcription, saving audio, accounts, billing, sync, signing/notarization, auto-update, VAD, hold-to-talk polish beyond the basic `hold` mode, additional languages beyond `en`/`pt-BR`.
