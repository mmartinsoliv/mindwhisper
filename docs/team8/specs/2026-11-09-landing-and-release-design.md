# Landing page and public release: design

Status: approved by the user in chat on 2026-11-09 ("yes, go ahead"). Path: architectural.

## Goal

Make Mindwhisper downloadable by people other than its author: a product page in the style of session-deck.app and overdeck.app, installers for macOS and Windows 10/11, and a hosted backend so a downloader can dictate without running a server.

## Decisions

| Topic | Decision | Reason |
|---|---|---|
| Backend | Hosted by the owner, as a Cloudflare Worker. The owner issues access tokens and pays provider costs. | The app cannot transcribe without a backend URL and token. |
| Access | Invite-only. The page has a "Request access" button; the owner adds tokens to the Worker secret `APP_TOKENS`. | Only cost control available: tokens plus a rate limit. |
| Signing | Unsigned v1. macOS ad-hoc signed (`signingIdentity: "-"`), Windows unsigned. The page documents the Gatekeeper and SmartScreen steps. | No paid accounts needed. Signing can be added to CI later without redesign. |
| Site hosting | Cloudflare Pages, static, plain Vite + TypeScript, no framework. | One account with the Worker; the page is one screen of content. |
| Installer hosting | GitHub Releases. A tag `v*` builds a draft release; the owner publishes it. | Free, and tauri-action does it natively. |

## Architecture

```
GitHub tag v*  ──► Actions: tauri-action (macOS arm64, macOS x64, Windows) ──► draft GitHub Release (.dmg x2, .exe, .msi)
site/ (Cloudflare Pages) ──► browser fetches api.github.com/repos/<repo>/releases/latest ──► download buttons per OS
Mindwhisper app ──HTTPS──► server/ as a Cloudflare Worker ──► OpenAI / Gemini / Anthropic
```

Only the desktop app calls the API, from the origins already in the CORS list in `server/src/app.ts` (`tauri://localhost`, `http(s)://tauri.localhost`). The site never calls the API, so CORS does not change.

## Components

1. **App release fixes** (`src-tauri/tauri.conf.json`, `src/`)
   - A real content security policy (today `"csp": null`). `connect-src` must allow any HTTPS backend and a local one, because the backend URL is user-editable.
   - `DEFAULT_SETTINGS.backend.url` comes from the build-time variable `VITE_DEFAULT_BACKEND_URL`, falling back to `http://127.0.0.1:8787`, so tests and local development are unchanged.
   - Backend URL and token fields commit after 600 ms of idle, on blur and on unmount, not on every keystroke.
   - A shortcut that fails to register at startup is shown in the main window. The Rust `ShortcutRegistry` remembers the last registration error, exposes it through a new command `shortcut_status` and broadcasts it with the event `shortcut://status`.
2. **Worker** (`server/`)
   - New entry `server/src/worker.ts` reusing `createApp` unchanged apart from one optional dependency `limiter`.
   - The in-memory rate limiter does not work across isolates, so the Worker uses a Cloudflare Rate Limiting binding (`RATE_LIMITER`, 30 requests per 60 s per token).
   - Config is read from Worker bindings: only string values are passed to `loadConfig`.
   - `nodejs_compat` covers `node:crypto` in `middleware/auth.ts`. The Node entry `index.ts` stays for local development.
3. **Release pipeline** (`.github/workflows/`): `ci.yml` (frontend and server checks) and `release.yml` (tag build matrix, draft release). The release build reads the repository variable `DEFAULT_BACKEND_URL` and passes it as `VITE_DEFAULT_BACKEND_URL`.
4. **Landing page** (`site/`): one dark page. Hero with a CSS-built overlay demo, how it works, languages, privacy, download, install help, FAQ. Download buttons resolve release assets by name pattern at load time and fall back to the releases page.
5. **Docs**: README, `docs/PLATFORM-LIMITATIONS.md`, `docs/MANUAL-TEST.md`, and a new `docs/DEPLOY.md` runbook for the steps only the owner can do.

## Error handling

- The site shows the releases page link when the GitHub API call fails or returns no matching asset. It never shows a dead button.
- The Worker returns the same error shape as the Node server; a missing secret fails the request with a 500 instead of silently serving the mock provider.
- The shortcut banner is hidden on the Settings page, which already shows conflicts.

## Testing

- Existing suites stay green: `pnpm check`, `pnpm test:e2e`, `cd server && pnpm test && pnpm typecheck`, `cd src-tauri && cargo test`.
- New unit tests: CSP present and complete, default backend URL, the commit-on-idle field, the Rust status slot, the rate-limit middleware, the Worker env filter, the download asset picker.
- Not testable here: the real CSP in a running webview, the Worker on Cloudflare, the release on a real runner, installs on real machines. These are listed in `docs/MANUAL-TEST.md` and `docs/DEPLOY.md`, and stay unverified until someone runs them.

## Out of scope

Code signing and notarization, auto-update, Linux, self-serve token issuing, analytics on the site, a custom domain, and deploying anything to the owner's Cloudflare account (the runbook covers it).

## Open items for the owner

- **Repository visibility.** Download links work for the public only if the repository (or at least its releases) is public. The lead asks before creating or pushing the GitHub repository.
- **Worker URL.** It is known only after the first `wrangler deploy`; it then goes into the repository variable `DEFAULT_BACKEND_URL`.
- **Provider spend caps** must be set on the provider accounts before tokens are handed out.
