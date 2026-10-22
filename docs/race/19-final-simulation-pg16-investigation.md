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
