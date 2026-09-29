# Phase 6 — Race engine, master clock, pause, skip, corrections — report

Status: **built and verified in the test harness. NOT connected to any live database or production flow.**
As instructed, this report comes before connection. Nothing below has touched a real Supabase project (none is configured for the race system yet).

Branch `claude/ninth-race-system-bo9jaj` · migrations `20260929000004`, `20260929000005`.

---

## 1. Verdict

| Gate | Result |
|---|---|
| Race SQL harness (migrations + all suites + parallel-session concurrency) | **767 assertions + all concurrency checks pass, exit 0** |
| Phase 5 tests removed or weakened | **None** (details in §6) |
| `pnpm lint` / `pnpm typecheck` (15 tasks) / `pnpm test` (9 tasks, race package 153 tests) | pass |
| Web build + browser E2E (Chromium, mocked Supabase) | **41/41** (28 earlier + 13 new for Master Control) |
| Negative controls (remove the safety, watch the test fail) | START lock, PAUSE lock → both caught |
| Bugs the new tests found in my own code | **4**, all fixed (§4) |

---

## 2. What was delivered

### Database (`20260929000004_race_queue_corrections.sql`)

**Locked decision 1 — wrong check-in.** `race_correct_check_in(old, new, reason)`, **Master Control only** (Event Manager alone is refused; Reception cannot undo, delete or correct).
- Same heat only; old athlete must be checked in and not started; new athlete confirmed and not checked in.
- The original check-in is **never deleted or overwritten**. It is marked superseded by a row in the new append-only ledger `race_check_in_corrections` (old athlete, new athlete, reason, user, server timestamp).
- The corrected athlete **inherits the original arrival time**, so nobody behind them is pushed. The old athlete can check in again and joins at the end.
- If the wrong athlete already held a BOUND slot, the same slot (same start time) goes to the right athlete.
- A started athlete cannot be corrected — that is SKIP.

**Locked decision 2 — arrives after the heat closes (DNS).** `race_override_dns(reg, reason)`, **Event Manager only** (Master Control and Reception are refused).
- Looks for a *safe slot*. If none: returns `NO_SLOT_AVAILABLE`, changes nothing, writes an audit row.
- Never moves an assigned athlete, never changes an existing start time.
- `race_move_athlete_later_heat(reg, heat, reason)`, Event Manager only: later heats only, refuses anyone holding a slot, refuses if the target heat has no safe slot (`RACE_NO_SLOT_AVAILABLE`).

**Locked decision 3 — overflow.** 10:00 heat gap and one overflow slot per heat unchanged. "Safe slot" is one objective number, `race_heat_free_capacity` = open slots + overflow room that fits before the next heat − athletes still owed a slot. The second late athlete gets NO SLOT / EVENT MANAGER.

### Database (`20260929000005_race_engine.sql`)
- `race_start_event` — control roles only, once only, requires locked heats, freezes the schedule, first athlete at +60 s.
- `race_advance_core` / `race_advance` — the engine tick: binds slots, **starts athletes automatically at their exact second**, station WORK → performance lock at exactly 3:00 (**no grace**) → 0:30 scoring → LOCK → next athlete takes over; push-up style locks at Station 02; athlete finish; heat and event finish. Nothing "ticks": everything is `anchor + slot × 3:30` arithmetic on race time; the engine only records.
- `race_pause` / `race_resume` — race time is exactly continuous across pauses (whole-millisecond stamps).
- `race_skip_athlete` — the slot stays empty, nobody moves up, no other start time changes; allowed until the athlete's Station 01 window ends; results become `VOID_DNS`.
- `race_mark_dnf`, `race_start_next_heat` (MANUAL heats only; server computes the anchor), `race_control_state` (one JSON snapshot for the dashboard, incl. a `skippable` list).
- Internal entry points (`race_advance_core`, `race_advance_all`) are not callable by any API role.

### Test tooling
- `supabase/tests/race/simulator.sql` — `race_sim` schema: time travel, pause aging, and four timing invariants checked **after every simulated tick** (no station overlap incl. the 0:30 hand-over; every window equals the model; started athletes have exactly 9 results; statuses agree with race time).

### TypeScript / web
- `@9thround/race`: `timeline.ts` (window/phase arithmetic pinned to the SQL), `race-clock.ts` (min-RTT clock sync, monotonic extrapolation, pause freeze, version-triggered re-sync), engine repository + 11 use cases (reasons enforced client-side too; no time/order/position parameter exists anywhere), friendly wording for every new `RACE_*` code. 153 package tests (was 114).
- `/race/control/[slug]` Master Control: race clock, START EVENT (two-step confirm), EMERGENCY PAUSE / RESUME, pre-race countdown, next athlete + countdown + optional voice, 9 station cards, SKIP with mandatory reason, correction flow, Event Manager exceptions (DNS override, move to later heat), START HEAT for manual heats, heat table. Ticks the engine once a second.

---

## 3. Verification detail

**SQL suites** (new): `14_engine` (START permissions/once-only/lock requirement; automatic start; exact boundaries at 3:59.9 / 4:00.1 / 4:29.9 / 4:30.1; hand-over; push-up lock; pause ms-exactness incl. 25 rapid cycles; skip rules; DNF; manual heats; event finish; audit), `15_queue_corrections` (all three locked decisions, every refusal, history retained, ledger append-only, no start time changes), `16_simulation`.

**50-athlete simulation** (heats 9,9,9,9,9,5; 5-second ticks, ~2,900 ticks, invariants every tick): #5 never arrives, #14 late mid-heat, #27 skipped, #30 DNF, #48 takes heat 6's only overflow slot, #49 gets NO SLOT AVAILABLE, pauses of 2:00 and 5:00.
Result: anchors 0:01:00 / 0:39:00 / 1:17:00 / 1:55:00 / 2:33:00 / 3:11:00; **47 started, 46 finished, 1 DNF, DNS = #5, #27, #49**; 51 slots = 47 started + 1 skipped + 3 burned; 417 locked results; every window = slot start + (n−1)×3:30; every start audit lag ≤ one tick; start order = check-in order (0 inversions); event finished at 4:00:00 race time; 7:00 of pause subtracted; exact audit counts.

**Parallel sessions** (real concurrent connections behind a barrier): 12 simultaneous START EVENT → exactly 1; 20 sessions × 3 ticks and 20 *unlocked* core calls → every athlete started once, 81 results, no deadlock; 10 simultaneous pauses → 1, resumes → 1; 8-desk pause/resume storm (97 pauses) → none overlapping, `paused_total_ms` = exact sum; SKIP racing the automatic start on 8 slots → always SKIPPED/MISSED_START/no live results; 8 desks correcting onto the same athlete → exactly 1.

**Negative controls:** removing the clock row lock from START EVENT → 12/12 sessions "started" (test failed); from PAUSE → refused sessions died with raw database errors instead of `RACE_ALREADY_PAUSED` (test failed). Locks restored.

---

## 4. Defects the new tests found in my own Phase 6 code (fixed before this report)

1. **Event finished before the last station's 0:30 scoring window closed** — Station 09 was left in `SCORING` forever. Heat/event finish now waits for every result to be locked.
2. **Overlapping pauses under concurrency** — the pause timestamp was taken before waiting for the clock lock, so a queued caller could stamp a time earlier than a pause that ran while it waited (334 overlapping pairs in the storm). Now stamped after the lock.
3. **DNS override / heat move violated "one active check-in per athlete"** for an athlete who already had a check-in (skipped athletes). Ledger row now written first, old check-in superseded, then the new one; the ledger's FK to the new check-in is deferred to allow it.
4. Test-only: an unscoped inversion query in the Phase 5 binder concurrency test started seeing Phase 6 corrected athletes (§6).

---

## 5. Decisions I took (tell me if any is wrong)

- **Correct check-in requires the old athlete to be *checked in and not started*.** After start it is SKIP + Event Manager override.
- **Skip window = until the athlete's Station 01 window ends** (3:00 after their start). Later than that: DNF.
- **DNF voids only stations not yet reached**; the one in progress finishes its normal lock cycle so the station hand-over stays exact.
- **Move-to-later-heat offers only heats that already have a schedule** (anchored). A MANUAL heat that has not been started has no slots to give.
- **EMERGENCY PAUSE takes no reason** (panic button; recorded as "Emergency pause"). RESUME asks nothing.
- The engine is driven by **any staff device ticking once a second** (server de-duplicates). Start/lock times in the schedule are exact regardless; only the *recorded* moment can lag by one tick (audited as `lag_ms`).

## 6. Existing tests — audit

Suites `00`–`13` are byte-identical to Phase 5. Changes to existing files:
- `01_structure.sql`: three counts raised (27→28 tables, 21→22 enums, 6→7 append-only triggers) because Phase 6 adds one table/enum/ledger; one new assertion.
- `concurrency.sh`: the binder-order query now filters to its own event and to non-superseded check-ins (**tighter**, and required once corrected check-ins exist); one `|| true` added so a failed count cannot silently kill the script.

## 7. Open items before connecting to production

1. **No scheduler.** `race_advance_all()` exists as a backstop but no `pg_cron`/Edge timer is configured. Until then a race needs at least one staff device (Master Control, a judge, a station screen) open.
2. **A MANUAL heat that is never started blocks the automatic event finish** (by design: no silent skipping). Master Control shows it as "starts on your command".
3. **Not applied to any hosted Supabase project.** Applying migrations `…0004` and `…0005` (after `…0001`–`…0003`) and generating real DB types is the connection step — waiting on your go.
4. Phase 7 (judge app, scoring, station screens) will consume `race_station_results` windows and `race_control_state`; nothing in Phase 6 blocks it.
5. Voice announcement uses the browser's speech synthesis and needs one tap ("Voice: on") per device — a browser rule.

## 8. Reproduce

```
cd supabase && tests/race/run.sh                      # 767 assertions + concurrency
pnpm lint && pnpm typecheck && pnpm test
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=anon pnpm --filter @9thround/web build
# then next start -p 3100 and: NODE_PATH=$(npm root -g) node apps/web/scripts/race-e2e.mjs
```
