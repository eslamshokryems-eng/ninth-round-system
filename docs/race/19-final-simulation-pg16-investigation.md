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

## Probable cause of the intermittent stall (hypothesis, not proven)
**Status.** This section was rewritten from the investigation's notes after the original write-up and its raw artifacts (instrumented-run logs, row counts, timings) were lost in a container reset. It records the conclusion reached at the time, which is **a working hypothesis, not a proven root cause**: the original numbers are not reproduced, the stall has not been reproduced since, and PostgreSQL 17.11 (where it was instrumented) is no longer available. Treat the mechanism below as unverified until it is reproduced and the fix below is tested.

**Observed (evidence).**
- On the full harness the final simulation sometimes fails the timing guard with a drift of a few seconds on a *replayed* action. Example from one run: N006 S1 REP, +2.7 s then +5.3 s against the ±1 s limit; the same pattern appeared on PG 16 and on PG 17.
- The same code passed with 0 violations on other runs, so the failure is intermittent, not a deterministic logic error.
- The guard failed closed on every such run, as designed.

**Hypothesis (from the instrumented run; not re-verified).**
1. `race_final.act` (the harness's table of scheduled actions) is loaded in bulk and has no planner statistics until autovacuum's autoanalyze reaches it.
2. `race_final.refresh()` joins that table on the station number. Without statistics the planner may mis-estimate the join and build a very large intermediate row set, making `refresh()` slow until autoanalyze runs. Whether a given run is hit would then depend on background timing, which would explain why it is intermittent.
3. The harness clock is wall-driven: while `refresh()` is slow the race clock keeps moving, so the following actions would be *sent* late and the clock would "leap". The engine would still record each action at the instant it receives it, so the drift would be in the harness's pacing, not in the engine.
4. The driver repositions (`travel_to`) and corrects only a lag of less than 2 s. A longer stall would not be corrected and would appear as drift on the following actions of that flush, which the guard reports.

**Scope.** If the hypothesis holds, this is a harness problem and not a race-timing, scoring or migration defect: the slow step would be a harness query, and nothing in `supabase/migrations`, `packages/race` or the timing rules was changed. That follows from the hypothesis; it has not been independently demonstrated. The guard thresholds were not loosened and must not be.

**Proposed fix: NOT applied and NOT tested; needs approval.** Run `ANALYZE` on the `race_final` tables right after the plan is loaded, so `refresh()` always has statistics. It would be harness tooling only (`supabase-race/tests/harness/final/`), would change no threshold and no marker rule, and would remove the dependency on autoanalyze timing. Until it is applied and the stall is shown not to recur over many runs, the hypothesis stays a hypothesis.

**Later evidence (consistent with the hypothesis, does not confirm it).** On PG 16.15 in a fresh container the full harness passed twice in a row, on the League work tree and on a clean copy of `546068a` (0 violations; 8,704 and 8,721 independent checks, 0 mismatches). The stall did not recur, which is what a timing-dependent cause would predict, but a stall that does not appear in two runs proves nothing about its cause.
