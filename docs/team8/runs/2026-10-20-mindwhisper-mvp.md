# Run log — mindwhisper-mvp

spec: docs/team8/specs/2026-10-20-mindwhisper-mvp-design.md
plan: docs/team8/plans/2026-10-20-mindwhisper-mvp.md
branch: none (folder is not a git repo)
pr: none

## Brainstorm
- path: architectural
- spec rounds with the user: 1 (scope question: Sub-project 1 only; the user confirmed twice)

## Plan
- plan: written by the lead · self-review fixes: 7 (CORS for the webview, `dist` must exist for cargo, settings store decoupled from `applyTheme`, `RecordingIndicator` state type, `Spinner` nested status role, access-token entry in onboarding, React state-updater bug in the onboarding shell)
- tasks: 17 (+ #20, added at review: server `.env` loading; + "Close the run") · tracks: 7 (backend, base, native, logic, overlay, app, qa) · waves: 4 · peak: 3 at once (up to 4 while `backend` overlaps wave 2) · mode: teammates — parallel tracks in the same waves, file ownership disjoint
- estimate: ≈$53.00 (per task in the plan's table)
- folder is not a git repo: no branch, no commits; run log and plan are plain files

## Run
- executors (all `team8:executor-high`, one shared checkout, no git so no branch/commits/PR):
  - backend · opus · high · track backend · wave 1 (tasks 1, 2); reopened once for #20 (a stopped `backend` woke on the assignment notice and did it; a fresh `backend-2` · opus · high only verified)
  - base · sonnet · high · track base · wave 1 (task 3); base#2 · opus · high · wave 2 (task 4, respawned so the UI kit ran on the router's opus route)
  - native · sonnet · high · track native · wave 2 (tasks 5-8)
  - logic · sonnet · high · track logic · wave 2 (tasks 9-12)
  - overlay · sonnet · high · track overlay · wave 3 (task 13)
  - app · sonnet · high · track app · wave 3 (tasks 14, 15)
  - qa · sonnet · high · track qa · wave 4 (tasks 16, 17)
  - peak 4 at once (wave 2: base, native, logic with backend still finishing review fixes)
- track reviews (opus reviewer, read-only; no git, so each reviewer read a bundle file of the track's files): backend 2/3 rounds; base 2/3; native 2/3; logic 3/3; overlay 3/3 + lead ruling; app 2/3 + two small round-3 fixes; qa 2/3 + one-line fix. Findings fixed: backend 5 (3 blocking, 2 promoted); base 7 + input borders; native 8; logic 8 + 1 new edge (+ 3 residual minors); overlay 7 + 2 (retry storm, Escape disarm); app 8 + 2; qa 13 + 1 (docs could not work as written; mock hid wrong argument names).
- residuals (minor, not fixed, recorded in docs/PLATFORM-LIMITATIONS.md or below): backend 9, base 2, native 9, logic 3, overlay 3, app 5, kit follow-ups 2 (`Select` has no `disabled`, `TextField` hint sits inside the label), `deleteAllUserData` uses `Promise.all` not `allSettled`; details in the scratchpad notes.
- final verification, run by the lead on the final code: `pnpm check` 17 files / 192 tests; `pnpm build` OK; `pnpm test:e2e` 13 passed (3 consecutive runs); `cd server && pnpm test` 38 passed + typecheck; `cd src-tauri && cargo test` 37 passed + 1 ignored (hardware) + `cargo check`; `pnpm tauri build --debug --no-bundle` compiled (qa's run); root and server `.env.example` byte-identical. NOT verified: microphone, real paste into other apps, overlay focus behaviour, tray, global shortcut conflicts, real STT/LLM providers (adapters tested against mocked HTTP only), Windows, Linux; the app was never launched.
- actual (`measure`, list price): ≈$55.90 total · team-lead ≈$40.68 · executors ≈$13.40 (backend $1.36, base $0.43, base#2 $0.93, native $1.77, logic $2.61, overlay $1.26, app $1.62, qa $3.64, backend-2 $0.31) · reviewers ≈$1.29 (7 reviewer runs)
- estimate vs actual: plan estimate ≈$53 priced executors only; executors + reviewers came to ≈$15.2, so the lead (≈$40.7, mostly reading the router's multi-hundred-KB `prepare_spec` outputs back into context and long review reports) was the real cost and the estimate did not include it.
- timing: message lag median 0.0 min, p90 0.4, max 0.8, none over 5 min; review tails overlay 19.3 min, app 8.8, qa 8.2; idle-with-work-waiting 8 short stretches totalling 0.5 min.
- went wrong / change next time:
  - Spec §11 was the out-of-scope list, but Task 17 told qa to verify "the acceptance criteria in §11"; the 12 criteria live in the user's brief and were never copied into the spec. Put acceptance criteria into the spec verbatim.
  - The plan's own documented setup (`cp server/.env.example server/.env`) could not work (server never loaded `.env`, blank values failed validation) and no automated check caught it until the qa review; add a "follow the README literally" smoke step to the docs task.
  - Smart Router: the plan is far larger than one intake (98 KB) so every wave needed its own slice, and `prepare_spec` returns the full source (60-90 KB) into the lead's context each time; the router also merged two tracks into one package whenever their models matched, so each track had to be routed in a separate batch.
  - A reopened track needs a new owner name before the task is created: stopped teammates stay in `members[]`, so a respawn became `backend-2` while the old `backend` also woke on the assignment and did the work.
  - The completion hook rejected `status: completed` until `metadata.verified` had been set in an earlier call, for several teammates.
  - Reviewers had no git diff (the folder is not a repo), so each review used a hand-built bundle of the whole track's files; a `git init` at the start would have made diffs and per-task commits possible.
