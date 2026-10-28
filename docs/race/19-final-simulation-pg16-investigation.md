# Final simulation: "Masters hold ms N19" failure on PostgreSQL 16.13 — root cause

**Failure:** `Masters hold ms N19: system 44627, model 47000 (±400)` — 1 of 8,710 checks, first PG 16.13 run; identical code passed on rerun.

## Verdict
Test-harness / model-design defect (nondeterministic timing). **Not an engine defect.** The Race Engine, its migrations and the tolerance are unchanged.

## Cause
- The model computed the Masters hold from the **scheduled** instant of each action. The system scores from the instant the action **actually ran** (`server_race_ms`).
- Slot order within a heat follows check-in arrival order (parallel check-in storm), so the layout differs per run. Some layouts put a Masters hold START inside the 5.5–5.8 M offline-queue flush (~181 actions sent back to back). Natural drift there is up to ~1.3 s; the hold tolerance is 400 ms.
- A stall of ≥ ~2.3 s before that action shifts the recorded start. N19: 36,900 − 2,373 + 10,100 = 44,627 (observed). Model: 47,000.

## Evidence
1. Forced the layout (sequential check-ins) → system = 47,000 (model value).
2. Same layout plus an injected 2.373 s stall before N19's HOLD_START → `system 44546 — model 47000`: reproduces the failure.
3. In that failing run the ledger-replay check (system vs the recorded times, tolerance ±1 ms) still passed → the engine scored the recorded times correctly.
4. With the fix, same layout and stall → `MODEL AGREES: 8724 checks, 0 mismatches`, `holdDriftMaxMs: 2486`.
5. Mutation control: hold started 1 s late in the live `race_result_tally` (isolated copy) → fix still FAILS with 18 mismatches (e.g. `N19: system 44886 — model 46886`, `N50 replay: 133989 vs 130989`). The check is not weakened.

**Not established:** what caused the original ~2.4 s stall (natural per-action gaps are 4–17 ms, so it was an external hiccup on the test machine). It was not reproduced without injection.

## Fix (`docs/race/scripts/final-model.mjs`, commit 1640380)
For Masters hold-window events only, the model is fed the recorded time (from the exported ledger) instead of the scheduled time. Window membership and accept/reject still use the scheduled instant. Maximum drift is reported as `holdDriftMaxMs`. Tolerance (400) unchanged.

## Results (real repo, fixed model, no migrations applied anywhere)
| | Race tests | League tests | Final simulation |
|---|---|---|---|
| PG 16.13 | 1447 pass | 357 pass | AGREES, 8711 checks, 0 mismatches (holdDriftMaxMs 247) |
| PG 17.11 | 1447 pass | 357 pass | AGREES, 8719 checks, 0 mismatches |

Caveat: neither run hit a stall, so these confirm no regression; the stall behaviour is proven by the injected-stall run (4) and the control (5).

Migration stays in `supabase-race/proposed/league/`. No remote writes, settings, roles or deploys.

## Follow-up: timing guard (`final-model.mjs` → `timingDrift`)
Every action's recorded server time is now compared with its scheduled instant, and each violation is a **failure** that names athlete, station, action, scheduled (expected), recorded (actual) and drift.
- The first action at a scheduled instant: |drift| ≤ 1000 ms (exactly 1000 passes, 1001 fails), both signs.
- Later actions of the same instant (offline-queue flushes replay ~180 actions serially): at most 1000 ms behind the previous action. A literal "every action within 1 s" rule flagged 94 healthy actions (max natural drift 1.4–1.7 s, a smooth 6–10 ms per queued action), so it was refined rather than loosened; a stall (a jump > 1 s) still fails. A large drop in drift means the harness repositioned the race clock and the action is judged absolutely.
- Tests: `docs/race/scripts/final-model.timing.test.mjs` (17, `node --test`), run inside the harness.
- Negative control on a real PG16 export: +2373 ms on one flush action → exactly 1 failure, `N020 S2 REP … scheduled 5800000, recorded 5803283, drift +3283`.

## Follow-up: browser suite (`apps/race/scripts/race-e2e.mjs`)
The 7 deterministic failures (rowing/evidence) were environmental: the build lacked `NEXT_PUBLIC_RACE_E2E_OCR=1` (scripted-OCR hook). Documented in the script header; with the flag the suite is 96/96. A separate reception pick-list failure on cold servers was a test race (an ambiguous wait let the next step type while the previous check-in request was still in flight); the wait now targets the result card. No application code changed.

## Follow-up: reposition markers (harness) and diagnostics
- The harness now records every `travel_to` the final driver makes (`race_final.reposition()` → `clock_marks`, plus an independent call counter in `race_sim.travel_to`); the guard exempts only the one action a *valid* marker precedes (same position and instant; flush markers also name athlete, station, action). Missing, malformed, duplicate, reordered, stale, other-run or miscounted marker data fails closed: no marker is trusted and any drop is a violation. No reset is inferred from timestamps.
- Verified on PG 16.13 and 17.11 (full harness, exit 0, 0 mismatches, 0 violations). The earlier intermittent +2377 ms stall did not recur in that run; its cause is analysed in "Root cause of the intermittent stall" below.
- Diagnostics: genuine timing violations are listed first, and marker problems are grouped one line per problem code (a deleted marker used to produce ~10,000 lines that hid the violations from the console).
- Known limits: `advance` / `post-flush-0` markers bind by position and instant only; the artifact has no dropped-action id (flush markers naming an action absent from `act_log` are OCR steps, dropped judge actions or rowing corrections, and never exempt anything); OCR steps are not timing-checked.

## Intermittent stall: cause unknown (the first hypothesis was tested and is not supported)
**Status.** The original analysis and its raw artifacts (instrumented-run logs, row counts, timings) were lost in a container reset, and this section was rewritten from the investigation's notes. The numbers below are only those observed afterwards in this repository's own runs. **The root cause of the stall is not known.**

**Observed (evidence).**
- On the full harness the final simulation sometimes fails the timing guard with a drift of a few seconds on *replayed* actions. Examples: N006 S1 REP, +2.7 s then +5.3 s, on PG 16 and on PG 17 (an earlier container); N018 S5 REP act #1517 +2,447 ms and N017 S1 REP act #1518 +2,373 ms, on PG 16.15, at ~3,300 s race time.
- The size is consistently a little above 2 s (also the original +2,377 ms), against the ±1,000 ms limit.
- The same code passed with 0 violations on other runs (PG 16.15, twice, on the League tree and on a clean copy of `546068a`; 8,704 and 8,721 independent checks, 0 mismatches), so the failure is intermittent, not a deterministic logic error.
- The guard failed closed every time, as designed; every other harness section passed on the failing runs.

**Hypothesis that was tested and is NOT supported.** The investigation's working hypothesis was that `race_final.act` (bulk-loaded plan table) has no planner statistics until autoanalyze reaches it, so `race_final.refresh()` (a join on the station number) can be planned badly and run slowly, the wall-driven clock then leaps, and the driver (which corrects only a lag of less than 2 s) leaves the rest as drift. The fix that follows from it, `ANALYZE` on `race_final.act`, `blackout` and `script` right after the plan is loaded (with a check that statistics exist), was **applied and run on the full PG 16.15 harness: the stall still occurred** (the +2,447 / +2,373 ms violations above), with statistics demonstrably present at the start. The hypothesis is therefore not sufficient to explain the stall, and the `ANALYZE` change was **reverted** because it did not help. One failing run does not give a rate, and the unanalysed-table effect cannot be ruled out as a contributor, only as the sole cause.

**Scope.** Nothing observed implicates `supabase/migrations`, `packages/race` or the timing rules, and the guard thresholds were not loosened and must not be. That is absence of evidence, not a demonstration that the engine is uninvolved: the cause could equally be the harness's wall-clock pacing, the database server (checkpoints, autovacuum, scheduling) or the host.

**Open.** Next steps, none yet done: repeated full-harness runs to get a failure rate; instrumenting the final driver to log, per flush, the wall time of each `refresh()` and each action against the race clock (to see where the ~2.4 s is spent); comparing runs with autovacuum disabled and with a checkpoint forced before the simulation; checking whether the stall correlates with a specific flush or race time (the observed ones were at ~74-82 s and at ~3,300 s of race time, so they are not obviously in one place). Until one of these identifies the cause, treat the stall as a known intermittent harness failure and keep the guard strict.
