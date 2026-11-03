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
- Verified on PG 16.13 and 17.11 (full harness, exit 0, 0 mismatches, 0 violations). The earlier intermittent +2377 ms stall did not recur in that run; its cause is analysed in "Intermittent stall" below.
- Diagnostics: genuine timing violations are listed first, and marker problems are grouped one line per problem code (a deleted marker used to produce ~10,000 lines that hid the violations from the console).
- Known limits: `advance` / `post-flush-0` markers bind by position and instant only; the artifact has no dropped-action id (flush markers naming an action absent from `act_log` are OCR steps, dropped judge actions or rowing corrections, and never exempt anything); OCR steps are not timing-checked.

## Intermittent stall: cause found (stale planner statistics), fix verified on PG 16.15 and PG 17.11
**Status.** Established by measurement on PG 16.15 and on PG 17.11 (PGDG build 17.11-1.pgdg24.04+2; details below). Not verified on PG 16.13 or on Supabase's managed 17.11.0.003 build. The earlier analysis was lost in a container reset; everything here was re-measured in this repository's own runs (commits `33a5b81`, `834ab5c`, `0b151a1`).

**Symptom.** On the full harness the final simulation sometimes fails the timing guard on *replayed* actions: N006 S1 REP act #2/#3 at +2.1 to +5.6 s (scheduled 74,166 / 81,612 ms), or act #1 at +3.2 s; once also two flush actions at ~3,300 s (+2.6 s, +2.2 s). The final-only mode (`ONLY_FINAL=1`) never showed it. The guard failed closed every time; it was never loosened.

**Mechanism (measured).**
1. `race_final.refresh()` fills in each planned action's race time with an `UPDATE ... FROM race_final.res` join. In a full run `race_final.act` (bulk loaded, 6,063 rows) has no statistics and the public race tables are stale, so the planner uses default estimates (`act` = 5 rows) and nested loops.
2. On that plan `refresh()` took **6.6-8.5 s per tick for the first 8-10 ticks** (race time 0-90 s), against 0.002 s once statistics exist. The remaining sections of a step (advance, flushes, scripts) were milliseconds (per-step wall-time log, `race_final.step_log`; per-part tick log, `race_final.tick_log`).
3. The race clock is wall-driven. A 7 s tick leaves it ~7 s ahead of the schedule. The driver puts it back on the scheduled instant only when it is less than 2 s behind. At 2 s or more the action is recorded late: e.g. a tick ending at 80 s race time left act #2 (scheduled 74,166) recorded at 77,0xx-77,5xx.
4. Whether a run slips therefore depends on where the clock lands relative to the next scheduled action. Slow ticks occurred in **all** baseline full runs, including the ones that passed.
5. The planner flips to hash joins (`act` estimated at 5,903-6,063 rows) as soon as statistics exist, and `refresh()` drops to ~1-50 ms. In final-only runs the same nested-loop plan is fast because the tables are small.

**Fix (`0b151a1`, harness only).** `ANALYZE` the seven tables `refresh()` and its view read (`race_final.act`, `blackout`, `script`, `race_stations`, `race_station_results`, `race_registrations`, `race_start_slots`) after the plan is loaded and before the first `refresh()`, then assert from the catalogs that the statistics exist and are consistent (`pg_class.reltuples` vs `count(*)`, a `pg_stats` row for every column `refresh()` uses). Any gap raises `RACE_FINAL_STATS` and stops the setup before the first step (verified: nothing ran, 0 steps, 0 actions). The timing guard, its tolerances, the race engine, scoring and migrations are unchanged. An earlier attempt that analysed only `act`, `blackout` and `script` still failed, because the public tables' estimates were part of the slow plan.

**Evidence: interleaved A/B, PG 16.15, 5 full runs per arm (order E B B E B E E B E B).**

| Arm | Runs | Failed the timing guard | Runs with slow ticks (> 0.5 s) | Max `refresh()` |
|---|---|---|---|---|
| Baseline (no `ANALYZE`) | 5 | **4** (N006 S1 acts #2/#3, +2.1 to +5.4 s; one also at ~3,300 s) | 5 (8-10 ticks, 56-62 s) | 6.6-8.5 s |
| With `ANALYZE` + check | 5 | **0** | 0 | 0.013-0.042 s |

The one baseline pass (run 08) had the same 10 slow ticks; the clock happened to land inside the 2 s window. In the experiment arm the first three N006 S1 drifts were 7-14 ms in every run; the largest natural flush drift (rule: at most 1 s behind the previous action) was 1,097-1,352 ms. Earlier runs agree: 3 baseline full runs under the passive sampler (one slip, +3,198 ms; all three showed the same ~5 long early driver statements), and 3 further runs of the experiment (0 slow ticks, 0 violations). The check was proven both ways: it passes after `ANALYZE`, and with the `ANALYZE` lines removed the harness stops at `RACE_FINAL_STATS` before any step (disposable-cluster unit tests: never analysed, `VACUUM` only, missing table, view, stale rows, empty then populated table, column added after `ANALYZE`, unprivileged role).

**Evidence: PostgreSQL 17.11, interleaved A/B (5 full runs per arm, order B1 A1 B2 A2 B3 A3 B4 A4 B5 A5, one at a time).** PGDG packages 17.11-1.pgdg24.04+2 (`postgresql-17`, `postgresql-client-17`, `libpq5`), SHA256-verified against the GPG-signed repository metadata and extracted (not installed) into a scratch directory; every run logged `PostgreSQL 17.11`. JIT was switched off for every session with `PGOPTIONS='-c jit=off'`, because the extracted package set has no LLVM 19 and the first JIT-eligible query of `02_timing.sql` otherwise fails to load `llvmjit.so`; JIT changes how a plan is executed, not which plan is chosen. Two earlier attempts (B1, A1) failed on that missing library before the final stage and are not counted.

| Arm | Runs | Failed the timing guard | Runs with slow ticks (> 0.5 s) | Max `refresh()` | `act` estimate / join at tick 1 |
|---|---|---|---|---|---|
| Baseline (no `ANALYZE`) | 5 | **5** (N006 S1 REP act #2 and/or #3, +3.4 to +6.0 s) | 5 (7-8 ticks, 58-63 s in total) | 8.3-9.2 s | 5 rows, nested loops (switches to ~5,900 rows and hash joins at tick 8-9) |
| With `ANALYZE` + check | 5 | **0** | 0 | 0.012-0.057 s | 6,063 rows, hash join |

First three N006 S1 drifts: baseline 10-13 ms for act #1, then +3,401 to +4,371 ms for act #2 in all five runs and +5,635 / +5,997 ms for act #3 in two of them (7-9 ms in the other three); with `ANALYZE` 7-17 ms for all three actions in every run. The independent model compared 8,707-8,738 checks per run; the only failures were the timing-guard violations of the baseline arm. The largest natural flush drift in the `ANALYZE` arm was 1,014-1,504 ms (rule: at most 1 s behind the previous action). The ~3,300 s flush (about 150 actions) took 2.2 s and 2.3 s in two baseline runs, 0.8 s in the other three, and 0.9-1.3 s in the `ANALYZE` arm; no flush violation occurred on PG 17.

**What is not established.**
- PG 16.13 and Supabase's managed PG 17.11.0.003 are not verified: the PG 17.11 runs used PGDG's build with JIT off, on the same machine as the PG 16.15 runs. The catalog check itself needs PG 14+ (`reltuples = -1` for never analysed).
- 5 runs per arm and version is a small sample; the baseline failure rate was 4 of 5 on PG 16.15 and 5 of 5 on PG 17.11, not a precise rate. Whether a baseline run slips depends on where the clock lands relative to the next action, so single runs can pass (one PG 16.15 baseline run did).
- The ~3,300 s flush (about 160 actions) took 2.2-2.6 s in three of five baseline runs and 0.9-1.1 s in all five experiment runs; one baseline run failed the guard there. That is consistent with the same cause (on PG 17.11 the flush took 2.2-2.3 s in two of five baseline runs and about 1 s in the `ANALYZE` arm, with no violation), but which statement is slow was not identified.
- What made autoanalyze finally arrive (after tick 8 in the run where it was observed) was not investigated.
- The check detects missing and grossly stale statistics (row-count mismatch beyond max(5 rows, 5 %)), not a skewed value distribution.

**Scope.** Nothing observed implicates `supabase/migrations`, `packages/race` or the timing rules. The harness's own wall-clock pacing made a slow bookkeeping query look like a timing drift in the race, and the guard reported it correctly.
