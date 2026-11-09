# Deploy and release runbook

This is for the owner. Every step below needs one of your accounts (GitHub, Cloudflare, a speech and a text provider), so none of it has been run by the project: the Worker, the site and the release workflow were written and unit-tested here but have never run on Cloudflare, on a GitHub runner or on a real machine. Expect to fix small things the first time, and write down what you had to change.

## 1. What is hosted where

- The API runs as the Cloudflare Worker `mindwhisper-api` (source `server/src/worker.ts`, config `server/wrangler.toml`).
- The download page runs as the Cloudflare Pages project `mindwhisper` (source `site/`).
- The installers live on GitHub Releases of `mmartinsoliv/mindwhisper`. The workflow `release` builds them when you push a tag that starts with `v`.

## 2. One-time setup

1. Create the GitHub repository `mmartinsoliv/mindwhisper` and decide its visibility. The site finds the installers through the public GitHub API, so the download buttons only work for other people if the repository (or at least its releases) is public. For a private repository the page falls back to a link to the releases page, which visitors cannot open.
2. Connect this checkout and push (nothing has been pushed so far, and no remote is configured):

   ```bash
   git remote add origin git@github.com:mmartinsoliv/mindwhisper.git
   git push -u origin main
   ```

   The work for this release is on the branch `landing-and-release`; merge it into `main` first, or push that branch and open a pull request.
3. Set spend caps in the provider dashboards (OpenAI, Anthropic, or Gemini, whichever you use) before you issue any token. The rate limit below limits requests, not money.
4. Install dependencies once in each package, because the root, `server/` and `site/` are separate pnpm projects:

   ```bash
   pnpm install
   (cd server && pnpm install)
   (cd site && pnpm install)
   ```

## 3. Deploy the Worker

```bash
cd server
pnpm exec wrangler login
pnpm exec wrangler secret put APP_TOKENS        # comma-separated list of access tokens, see section 4
pnpm exec wrangler secret put OPENAI_API_KEY    # speech to text (default provider)
pnpm exec wrangler secret put ANTHROPIC_API_KEY # text cleanup (default provider)
pnpm exec wrangler secret put GEMINI_API_KEY    # only if you switch a provider to gemini
```

Each command prompts for the value, so the secret never appears in your shell history or in a file. The first `secret put` may offer to create the Worker; accept.

The non-secret settings are in `[vars]` in `server/wrangler.toml` (`STT_PROVIDER = "openai"`, `LLM_PROVIDER = "anthropic"`). Edit them if you choose other providers, and put the matching key as a secret. The Worker refuses to serve when either provider resolves to `mock`, so a missing variable cannot return fake transcripts.

Optional dry run that builds the bundle without publishing it: `pnpm worker:check`.

Deploy:

```bash
pnpm worker:deploy
```

Wrangler prints the URL, `https://mindwhisper-api.<your-account>.workers.dev`. Copy it, then check it:

```bash
curl -s <url>/health
# expect: {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" -X POST <url>/v1/cleanup
# expect: 401 (no token was sent)
```

If either answer differs, run `pnpm exec wrangler tail` in a second terminal and repeat the request to see the error. The `RATE_LIMITER` binding (30 requests per 60 seconds, per token) is created from `server/wrangler.toml` on deploy; if Wrangler complains about the `ratelimits` section, update Wrangler (`pnpm up wrangler`) and retry.

For local development of the Worker, copy `server/.dev.vars.example` to `server/.dev.vars`, fill in your own keys, and run `pnpm worker:dev`. Never commit `.dev.vars`.

## 4. Issue and revoke tokens

Tokens are plain secrets that you hand out by hand, one per person.

1. Generate one: `openssl rand -hex 24`.
2. Add it to the comma-separated list and put the whole list again:

   ```bash
   cd server
   pnpm exec wrangler secret put APP_TOKENS   # paste: tokenA,tokenB,tokenC
   ```

3. Send the person their token over a private channel. They paste it in Settings, Backend, Access token.
4. To revoke, put the list again without that token. It takes effect on the next request.

There is no per-user usage report. Your cost controls are the rate limit (30 requests per minute per token) and the spend caps from section 2. If one token is abused, revoke it and issue a new one.

## 5. Point release builds at the Worker

In the GitHub repository open Settings, Secrets and variables, Actions, the Variables tab, and add a repository variable named `DEFAULT_BACKEND_URL` with the Worker URL from section 3.

The `release` workflow passes it to the build as `VITE_DEFAULT_BACKEND_URL`, so the installed app starts with that Server URL already filled in. Only builds made after you add the variable carry it; people still need a token. If the variable is unset or blank, the app defaults to `http://127.0.0.1:8787`, which is what development and the tests use.

## 6. Cut a release

1. Pick a version, for example `0.1.0`. Set the same `version` in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `package.json`. Commit the change.
2. Tag and push:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. In the repository's Actions tab wait for the `release` workflow. It runs three builds: macOS Apple Silicon, macOS Intel and Windows.
4. Open Releases. The workflow creates a draft, so nobody can see it yet. Check that it has two `.dmg` files (aarch64 and x64), one `-setup.exe` and one `.msi`.
5. Install each on a real machine and run the matching rows of `docs/MANUAL-TEST.md` (the unsigned install rows, the shortcut banner, the console check). Nothing in the project has been installed from a release yet.
6. Publish the draft. Until then the site has nothing to link to.

The release body tells people the build is unsigned. A macOS build is ad-hoc signed only (`signingIdentity` is `-`), which lets it run on Apple Silicon but is not a Developer ID signature.

## 7. Deploy the site

```bash
cd site
pnpm install
pnpm run deploy
```

Use `pnpm run deploy`, not `pnpm deploy`: pnpm has a built-in command called `deploy` that fails outside a workspace and never reaches the script. The script builds the page and runs `wrangler pages deploy dist --project-name mindwhisper`. The first run asks you to log in and to create the project `mindwhisper`; answer yes. Wrangler prints the `*.pages.dev` address.

If you use another repository owner or name, change `REPO` in `site/src/config.ts` first; it is the only place the repository is named.

The page reads the latest published release when it loads, so it shows direct download links only after step 6 is published. Before that, and whenever the GitHub API call fails, the buttons fall back to the releases page. The "Request access" button opens a prefilled issue in the repository, which is only useful if issues are enabled and the repository is public; replace it if you prefer another channel.

## 8. Not done by this project

- Code signing and notarization. Users see the macOS Gatekeeper warning (right-click the app, choose Open, then Open again, or System Settings, Privacy and Security, Open Anyway) and the Windows SmartScreen warning (More info, then Run anyway). The download page explains both. macOS may also ask for Microphone and Accessibility again after an update, because the ad-hoc signature changes with every build.
- Auto-update. People must download new versions by hand.
- A custom domain for the page or the Worker.
- Linux builds.
- Self-serve tokens, usage reporting and analytics.
