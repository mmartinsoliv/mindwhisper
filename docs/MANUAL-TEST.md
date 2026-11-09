# Manual test checklist

Automated tests cover the interface and the orchestration with the Tauri runtime mocked (`pnpm test`, `pnpm test:e2e`) and the Rust logic with fakes (`cd src-tauri && cargo test`). They do **not** exercise the microphone, real pasting into other apps, global shortcuts, the tray, overlay focus behaviour or real providers. This checklist does.

## How to run it

1. Start the server: `pnpm server:dev` (with `server/.env` set; see `README.md`).
2. Start the app: `pnpm tauri dev` (or install a build from `pnpm tauri build`).
3. Run the whole table once with `STT_PROVIDER=mock` and `LLM_PROVIDER=mock` (checks the app and the native layer without any provider), then again with real providers (checks transcription quality and cleanup). Write pass, fail or n/a in the Mock and Real provider columns, and tick the box only when the check passed in every run you did.
4. In `tauri dev`, grant Microphone and Accessibility to the terminal or IDE that launched the app.
5. Record failures with the OS version, what you pressed and what you saw. Do not paste dictated text or audio into reports.

## macOS

Tester: ______  Date: ______  OS version: ______  Mic: ______  Provider run: mock / real (circle)

| Check | Mock result | Real provider result | Notes |
|---|---|---|---|
| - [ ] First launch: onboarding appears; microphone prompt shows and the step reports 'Your microphone is working' | | | |
| - [ ] Microphone denied in system settings: the step shows an error with 'Open system settings'; 'Try again' works after granting | | | |
| - [ ] Shortcut step: the default shortcut registers; pick a shortcut used by another app and see the conflict message | | | |
| - [ ] Try it step: dictation inserts into the built-in text box; Skip works without a server token | | | |
| - [ ] Dictate into a browser text field (Safari or Chrome on macOS, Chrome or Edge on Windows) | | | |
| - [ ] Dictate into Notes (macOS) or Word (Windows) | | | |
| - [ ] Dictate into VS Code | | | |
| - [ ] Dictate into Slack | | | |
| - [ ] Dictate into a terminal (Terminal or iTerm on macOS, Windows Terminal on Windows) | | | |
| - [ ] Overlay appears bottom-centre of the screen that holds the cursor | | | |
| - [ ] Overlay does not steal focus: the text cursor stays in the target field while recording and after inserting | | | |
| - [ ] Overlay Stop and Cancel buttons work with the mouse without moving focus away from the target app | | | |
| - [ ] Esc cancels a recording and nothing is inserted; Esc works normally in other apps when no dictation is active | | | |
| - [ ] Clipboard text before and after a dictation is identical | | | |
| - [ ] Image on the clipboard before dictating: the app reports it cannot restore it | | | |
| - [ ] Accessibility missing (macOS): insertion fails with an error and Retry works after granting; on Windows, an administrator window ignores the paste and the error says the text is on the clipboard | | | |
| - [ ] Hold-to-talk mode: press starts, release stops and inserts | | | |
| - [ ] Unplug the microphone while recording: a readable error appears and the microphone is released | | | |
| - [ ] Stop the server (backend offline): a readable error with Retry; Retry works once the server is back | | | |
| - [ ] 5-minute recording stops by itself at the cap and is processed | | | |
| - [ ] History: an entry is added, search works, Copy works, Reinsert pastes into the previously focused app, Delete and Clear all work | | | |
| - [ ] Dictionary: a term with 'spoken as' replaces the spoken form in the inserted text | | | |
| - [ ] Launch at login: enable, log out and in, the app is running in the tray | | | |
| - [ ] Close the main window: dictation still works from the tray and the shortcut; 'Open' from the tray shows the window again | | | |
| - [ ] Delete all my data: settings, history and dictionary are gone and onboarding restarts | | | |
| - [ ] Light and dark themes render correctly; 'System' follows the operating system | | | |
| - [ ] Language: Português (Brasil) and English dictations come out in the right language; Automatic detects both | | | |
| - [ ] Install and launch: install the built app (or run `pnpm tauri dev`), launch it, and see the main window and the tray icon (criterion 1) | | | |
| - [ ] Start dictation with the global shortcut while another app is focused: the overlay appears and the text cursor stays in that app (criteria 3, 4) | | | |
| - [ ] Accuracy and punctuation: dictate 5 sentences in each language; the transcript is accurate and punctuated (criterion 6, real provider only) | | | |
| - [ ] AI cleanup: with cleanup on, each writing style changes the text as described; with cleanup off or 'Preserve my words' the text is only trimmed (criterion 7) | | | |
| - [ ] No provider key in the app: the settings file and the app's network traffic contain only the server URL and the access token, never a provider key (criterion 10) | | | |
| - [ ] History control: turn 'Save dictation history' off, dictate, and confirm nothing was saved; turn it on, dictate, and confirm the entry appears (criterion 11) | | | |
| - [ ] Complete a full dictation (record, stop, text inserted) without opening the main window at any point (criterion 12) | | | |
| - [ ] macOS: Accessibility pane opens from 'Open system settings' and the permission is listed under System Settings → Privacy & Security → Accessibility | | | |
| - [ ] macOS: in `pnpm tauri dev` the permissions are granted to the terminal or IDE, not to Mindwhisper | | | |

### macOS latency notes

Record the time from pressing stop to the text appearing, 5 runs per provider, in a quiet room.

| Provider | Utterance length | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Median |
|---|---|---|---|---|---|---|---|
| mock | ~5 s | | | | | | |
| real | ~5 s | | | | | | |
| real | ~30 s | | | | | | |

## Windows

Tester: ______  Date: ______  OS version: ______  Mic: ______  Provider run: mock / real (circle)

| Check | Mock result | Real provider result | Notes |
|---|---|---|---|
| - [ ] First launch: onboarding appears; microphone prompt shows and the step reports 'Your microphone is working' | | | |
| - [ ] Microphone denied in system settings: the step shows an error with 'Open system settings'; 'Try again' works after granting | | | |
| - [ ] Shortcut step: the default shortcut registers; pick a shortcut used by another app and see the conflict message | | | |
| - [ ] Try it step: dictation inserts into the built-in text box; Skip works without a server token | | | |
| - [ ] Dictate into a browser text field (Safari or Chrome on macOS, Chrome or Edge on Windows) | | | |
| - [ ] Dictate into Notes (macOS) or Word (Windows) | | | |
| - [ ] Dictate into VS Code | | | |
| - [ ] Dictate into Slack | | | |
| - [ ] Dictate into a terminal (Terminal or iTerm on macOS, Windows Terminal on Windows) | | | |
| - [ ] Overlay appears bottom-centre of the screen that holds the cursor | | | |
| - [ ] Overlay does not steal focus: the text cursor stays in the target field while recording and after inserting | | | |
| - [ ] Overlay Stop and Cancel buttons work with the mouse without moving focus away from the target app | | | |
| - [ ] Esc cancels a recording and nothing is inserted; Esc works normally in other apps when no dictation is active | | | |
| - [ ] Clipboard text before and after a dictation is identical | | | |
| - [ ] Image on the clipboard before dictating: the app reports it cannot restore it | | | |
| - [ ] Accessibility missing (macOS): insertion fails with an error and Retry works after granting; on Windows, an administrator window ignores the paste and the error says the text is on the clipboard | | | |
| - [ ] Hold-to-talk mode: press starts, release stops and inserts | | | |
| - [ ] Unplug the microphone while recording: a readable error appears and the microphone is released | | | |
| - [ ] Stop the server (backend offline): a readable error with Retry; Retry works once the server is back | | | |
| - [ ] 5-minute recording stops by itself at the cap and is processed | | | |
| - [ ] History: an entry is added, search works, Copy works, Reinsert pastes into the previously focused app, Delete and Clear all work | | | |
| - [ ] Dictionary: a term with 'spoken as' replaces the spoken form in the inserted text | | | |
| - [ ] Launch at login: enable, log out and in, the app is running in the tray | | | |
| - [ ] Close the main window: dictation still works from the tray and the shortcut; 'Open' from the tray shows the window again | | | |
| - [ ] Delete all my data: settings, history and dictionary are gone and onboarding restarts | | | |
| - [ ] Light and dark themes render correctly; 'System' follows the operating system | | | |
| - [ ] Language: Português (Brasil) and English dictations come out in the right language; Automatic detects both | | | |
| - [ ] Install and launch: install the built app (or run `pnpm tauri dev`), launch it, and see the main window and the tray icon (criterion 1) | | | |
| - [ ] Start dictation with the global shortcut while another app is focused: the overlay appears and the text cursor stays in that app (criteria 3, 4) | | | |
| - [ ] Accuracy and punctuation: dictate 5 sentences in each language; the transcript is accurate and punctuated (criterion 6, real provider only) | | | |
| - [ ] AI cleanup: with cleanup on, each writing style changes the text as described; with cleanup off or 'Preserve my words' the text is only trimmed (criterion 7) | | | |
| - [ ] No provider key in the app: the settings file and the app's network traffic contain only the server URL and the access token, never a provider key (criterion 10) | | | |
| - [ ] History control: turn 'Save dictation history' off, dictate, and confirm nothing was saved; turn it on, dictate, and confirm the entry appears (criterion 11) | | | |
| - [ ] Complete a full dictation (record, stop, text inserted) without opening the main window at any point (criterion 12) | | | |
| - [ ] Windows: microphone privacy toggle (Settings → Privacy → Microphone) off gives the error with a next step | | | |
| - [ ] macOS: install the unsigned `.dmg` from a release, drag the app to Applications, and pass Gatekeeper (right-click, Open, Open) so the app starts | | | |
| - [ ] Windows: run the `-setup.exe` (and separately the `.msi`) from a release and pass SmartScreen (More info, Run anyway) so the app installs and starts | | | |
| - [ ] The shortcut banner appears when the shortcut is taken at startup (hold it in another app first) and disappears after choosing another one in Settings | | | |
| - [ ] No CSP errors in the webview console while using every page and a dictation (needs a debug build or devtools; look for "Content Security Policy" messages) | | | |
| - [ ] The download page buttons point at the published release assets (macOS Apple Silicon, macOS Intel, Windows installer) and open the right file | | | |

### Windows latency notes

| Provider | Utterance length | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Median |
|---|---|---|---|---|---|---|---|
| mock | ~5 s | | | | | | |
| real | ~5 s | | | | | | |
| real | ~30 s | | | | | | |

## Acceptance criteria that only this checklist covers

Each of the twelve MVP criteria is mapped to its checklist rows in the README section "Verification status". The criteria that have no automated coverage of the real behaviour are: 1 (install and launch), 3 (focus a field in another app), 4 (the operating system delivers the global shortcut), 5 and 6 (speech accuracy and punctuation), 7 (real cleanup quality), 8 (real paste), 10 (no key in the client, by inspection) and 12 (without the main window). Do not mark one as met until its rows pass in a recorded run.

## Results summary

| OS | Date | Provider | Passed | Failed | Not run | Notes |
|---|---|---|---|---|---|---|
| macOS | | mock | | | | |
| macOS | | real | | | | |
| Windows | | mock | | | | |
| Windows | | real | | | | |

No manual run has been recorded yet; until a row above is filled in, everything in this checklist is unverified.
