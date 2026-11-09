# Run log: landing-and-release

spec: docs/team8/specs/2026-11-09-landing-and-release-design.md
plan: docs/team8/plans/2026-11-09-landing-and-release.md
branch: landing-and-release
pr: https://github.com/mmartinsoliv/mindwhisper/pull/1 (the folder had no git history; the baseline commit a0bc314 was created on main at the start of this batch, and the public repository was created at the end, after the owner chose public)

## Brainstorm
- path: architectural
- spec rounds with the user: 4 questions (backend model, signing, signing follow-up, hosting) and one plan approval

## Plan
- plan: written by the lead · self-review fixes: 3 (Task 3 file ownership, Task 6 title wording, Task 5 pnpm note)
- tasks: 7 (+ Close the run) · tracks: 3 (app, infra, site) · waves: 2 · peak: 3 at once · mode: teammates — three tracks own disjoint files and start together; the last docs task waits for all of them
- estimate: ≈$11.55

## Run
- executors: app · sonnet · high (executor-high) · track app · wave 1 (tasks 1, 2, 3), then wave 2 (task 7); infra · sonnet · high · track infra · wave 1 (tasks 4, 5); site · sonnet · high · track site · wave 1 (task 6). Peak 3 at once. The plan priced task 6 on opus; the router resolved every worker to sonnet, so the site track ran on sonnet.
- track reviews: infra 1/3 rounds (sonnet reviewer, nothing Blocking, 5 Minor); site 1/3 rounds (sonnet reviewer, nothing Blocking, 9 Minor, 6 fixed); app 1/3 rounds (opus reviewer, 1 Blocking and 6 Minor). Ruling on the app Blocking item: the sentence about a 6-second debug launch was true (the implementing agent ran it) but easily misread beside the README's "never launched", so it was reworded and dated, not removed.
- residuals (Minor, not fixed): infra: Worker setup errors surface as Cloudflare's non-JSON error page, `worker.ts` has no test of its module-scope caching, CI is the first proof that `worker:check` needs no Cloudflare login, the commit author is the git config identity. site: a scale and a rotate transition run outside the reduced-motion block, `loadDownloads` test does not assert the fetch call, three nav links hide at 640 px and below. app: `record_result` and the emit are not atomic, a failed save on unmount is silent, `style-src 'unsafe-inline'` may be ignored if Tauri injects a nonce (only a console read on a release build can tell).
- checked by the lead at close, on the final branch: `pnpm check` 205 tests passed; `pnpm build` built; `pnpm test:e2e` 13 passed; `cd server && pnpm test` 62 passed, `pnpm typecheck` clean, `pnpm worker:check` bundles with `RATE_LIMITER (30 requests/60s)`; `cd site && pnpm test` 9 passed, `pnpm typecheck` clean; `cd src-tauri && cargo test` 38 passed, 1 ignored; secret scan over tracked files found nothing.
- not verified by anyone: the CSP in a running webview (the console was never read), the Worker on Cloudflare, `release.yml` on GitHub runners (no tag has been pushed; `ci.yml` did pass on the PR, all three jobs, including `worker:check` on a clean runner), installs on real macOS and Windows machines, the landing page against a real published release (only mocked API responses), anything in `docs/MANUAL-TEST.md`.
- pr: #1, opened by the lead after the owner chose a public repository. 10 commits on `landing-and-release` after the baseline. Pushed with the GitHub CLI credential helper for that command only; no git config was changed. No tag was pushed, so no release build has run.
- actual: executors ≈$4.64 (app ≈$2.14, infra ≈$0.97, site ≈$1.53) and reviewers ≈$0.60, so ≈$5.24 for the batch workers. The lead's ≈$9.07 covers its whole transcript, including the conversation before the plan, so it is not a batch cost.
- estimate vs actual: the plan estimated ≈$11.55 for the seven tasks; the workers came in at ≈$5.24, about 45% of it, mainly because the site task ran on sonnet and not opus. All 7 tasks and 3 tracks finished in about 15 minutes of wall time.
- review tails (minutes from last task done to track clear): infra 1.8, site 3.3, app 3.1. Message lag median 0.0 min.
- went wrong / change next time:
  - The router first packaged tasks 1 to 6 as a single worker, which would have collapsed three parallel tracks; fresh per-track routes were needed. Chaining tasks inside a track with `dependsOn` split the app track into three packages, so one teammate per track used its first package only. Next time route one task per track, with no in-track chains.
  - The task-completed hook rejected completions until `metadata.verified` had been stored in an earlier call; all three teammates hit it. Say so in the dispatch prompt.
  - The task-created hook demanded the four metadata fields even for the lead-only "Close the run" task.
  - The commit trailer reads Sonnet 5.5 on some commits and Opus 5.5 on others, depending on each session's attribution reminder.
  - `site/package.json` names a script `deploy`, which `pnpm deploy` shadows with a built-in; `docs/DEPLOY.md` correctly says `pnpm run deploy`. Renaming the script to `release:site` would be tidier.
  - The site teammate did not fetch the two reference sites; it built from the plan's description of them.
