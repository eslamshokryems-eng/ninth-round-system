# Phase 7 — Judge scoring — report

Baseline: the approved final architecture checkpoint (`07-final-architecture-checkpoint.md`). THE NINTH stays fully isolated from the gym system; nothing was created, connected, configured or pushed to any Supabase project; no credentials were requested or committed. CI is unchanged: `apps/race` stays in the monorepo Turbo build.

## Delivered

**Database** (`20260930000001_race_judge_scoring.sql`, 12th migration)

| RPC | Purpose |
|---|---|
| `race_record_action` | THE judge RPC. One call = one action (`REP`, `NO_REP`, `LAP`, `PENALTY`, `HOLD_START/BREAK/RESUME`, `TECHNIQUE_SCORE`, `VOID`). |
| `race_review_action` | Master Control / Event Manager decides a `PENDING_MASTER_REVIEW` action (reason required, decision final). |
| `race_station_view` | What a judge / station screen shows: athlete, movement, window, time left, live tally, next athlete. Settles the race on read. |

Rules, all enforced in the database:
* **Idempotent by `client_event_id`.** A retry, double tap or queue replay returns the ORIGINAL row (`duplicate = true`), writes nothing. Reusing an id for a different action, or by another user, is refused (`RACE_IDEMPOTENCY_CONFLICT`).
* **Server time only.** `server_race_ms` is stamped by the server (pause-aware). The device supplies no time and no score.
* **Exact windows, no grace.** The phase is derived from the stamped race time and the result's window: performance input while `start ≤ t < start+3:00`; technique until the 0:30 scoring window ends.
* **Nothing is dropped.** A late action is kept as `REJECTED` with a code (`WINDOW_CLOSED`, `NOT_STARTED`, `ATHLETE_NOT_RACING`, `NO_TECHNIQUE_AT_STATION`) and audited. An offline replay that the device timed inside the window but that arrived after the lock becomes `PENDING_MASTER_REVIEW` (does not count until approved).
* **Score is derived from the append-only ledger**, never typed: reps; converted reps (KNEE 3:1, no partial group); laps with the F-4 penalty rule (a penalty cancels the last completed lap, never below zero); Masters wall-squat hold (2 breaks allowed, the 3rd exit ends the hold, D-10). Recomputed after every accepted change and finalised at the station lock.
* **VOID** is a new ledger row that cancels an earlier one (once, same result only). Only the station's judge, Master Control or the Event Manager may score; other stations, Reception, strangers, anon and other events' managers are refused.

**Judge app** (`/race/judge/[slug]/[station]`): athlete, movement, big countdown, giant REP / NO REP / LAP / PENALTY / HOLD buttons per station, technique slider, UNDO LAST. Every tap first goes into an on-device **outbox** with its own id and device sequence; sends are in-order, at-least-once and idempotent; a network error keeps the entry (and marks it `OFFLINE_QUEUE`), a refusal is parked with its reason and never retried, the outbox survives a reload.

**Package**: `domain/judge`, `domain/action-queue`, judge use cases (local validation: id shape, technique 0–10, VOID target, offline metadata), Supabase repository and mappers; 14 new unit tests (168 in the package).

## Tests run against the REAL judge RPC (as requested)

`21_judge_scoring.sql` — **70 assertions** (permissions, idempotent replays, conflicts, VOID, exact windows at 3:59.9 / 4:00.1, technique window, offline → review, every scoring type, pause, station view, audit).

`concurrency.sh` — parallel sessions against `race_record_action`:

| Scenario | Result |
|---|---|
| ONE action delivered by 30 sessions at once | 1 row, 29 duplicates, score 1, 0 errors |
| 10 actions × 4 simultaneous retries | exactly 10 new events, 30 duplicates |
| 20 devices × 5 distinct actions at once | 100 events, none lost, none doubled, exact score, no deadlock |
| 8 sessions void the same action | exactly 1 VOID accepted |
| 320 actions from 40 devices racing the 3:00 lock | each one either accepted before the end or `WINDOW_CLOSED` after; **0 accepted at/after the end**; none lost; score = accepted |
| 8 reviews of one pending action | exactly 1 decision |
| 40 min blackout, then 12 submissions | all 12 rejected `WINDOW_CLOSED`, result LOCKED — the RPC derived the state itself |

**A real defect was found and fixed by the lock-race test.** The first version decided accept/reject from the result's *stored* status read before waiting for the row lock; under load one action was accepted with `server_race_ms` at/after the window end. The phase is now derived from the race time stamped after the lock. (The failing run is the negative control: it failed, the fix passes.)

Browser (mocked Supabase, own app): **50/50**, including the offline tap, a **lost response** retried with the same id and counted once, reload with unsent taps, a rejected-late notice, a parked refusal (7 new checks; run twice).

## Notes
* The judge ledger writes audit rows only for rejected / pending / reviewed actions; accepted actions are audited by the append-only ledger itself (judge, server time, key), to avoid one audit row per rep.
* Deferred by design: rowing OCR capture / confirmation (next phase), station screen display, results and rankings.
* Still isolated: no gym file changed (`tests/check-isolation.sh`); no Supabase project touched.
