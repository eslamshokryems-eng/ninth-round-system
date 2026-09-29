# THE NINTH — Phase 5: Check-in, Queue, Start-Slot Engine (report)

**Status:** complete and verified. **Not built yet (Phase 6):** START EVENT, pause/resume, SKIP, the automatic athlete start, and the ticking `race_advance` entry point. The slot engine below is finished but is **not connected to a clock yet** — Phase 6 calls it.

## Decisions taken (the previous "approved" did not answer the two open questions)
| Question | What I did | Easy to change? |
|---|---|---|
| How are athletes placed in heats? | Unchanged: the Event Manager assigns them (audited, locked after heat lock). **No auto-placement rule was invented.** | A rule can be added later as a separate tool |
| Do unpaid athletes keep their heat seat? | Yes — but they **cannot check in until payment is confirmed** (waived counts) | One line in `race_check_in` |

## What was delivered
| Layer | Contents |
|---|---|
| Database `20260929000003` | `race_check_in`, `race_queue`, tie draw, slot engine (`race_anchor_heats_from`, `race_freeze_schedule`, `race_bind_due_slots`), heat-anchor freeze guard |
| Package | `CheckInAthleteUseCase`, `GetQueueUseCase`, mappers, error wording |
| Web | `/race/reception/[slug]`: search (race number first), QR scan, big CHECK IN button, blocked-reason messages, live start queue with heat filter, LATE and NO-SLOT flags, slot times in event time; nav between Check-in and Registrations |

## How it behaves
- **Order is decided by the server, per heat.** `race_check_in(registration_id)` takes *only* the athlete — Reception cannot supply a position or a time. It locks the heat, and the timestamp is stamped by the database under that lock, so order of timestamps = order of commits.
- **Exact timestamp ties** → one audited random draw among *only the tied athletes* (seed recorded; the order is reproducible: sort by `md5(seed ‖ id)`). In live operation ties cannot occur (checks are serialised); the draw exists for bulk imports.
- **Late athlete:** after the heat's check-in deadline (heat start − 15:00) or after the clock starts for heat 1 → `LATE_CHECK_IN`, never cancelled, sorted last, given the **next available slot**. Nobody already in the queue moves.
- **Slot binding** (60 s before each slot's start): the slot takes the first checked-in, not-yet-slotted athlete **in check-in order**; if nobody is eligible it burns `EMPTY` and later athletes do **not** move up. Result in the tests: heat 1 ran athletes 1,2,3,4,5,7,(empty),8,(empty),9 — athlete 7 started before athlete 6's number because athlete 6 never arrived.
- **Overflow slots:** a late athlete arriving after every planned slot is used gets an extra slot inside the 10-minute heat gap. Capacity = `floor(gap / 3:30) − 1` = **1 per heat** at the default gap. A second late athlete is flagged **NO SLOT AVAILABLE** for the Event Manager — never silently dropped, never auto-cancelled.
- **Heat close:** once a heat can take nobody else, athletes who **never checked in** become `MISSED_START` (DNS). Athletes who are present but have no slot stay `LATE_CHECK_IN`.
- **Pause:** binding uses race time, which freezes on pause — 35 minutes of pause burned nothing in the test.
- **MANUAL heats:** the anchor chain stops at a MANUAL heat; the later "start next heat" step re-anchors from that point. Empty heats take no time.

## Verification
| Check | Result |
|---|---|
| DB harness | ✅ **554 assertions** (+60 this phase) + rollback + gym fingerprint + concurrency |
| Package tests | ✅ 114 |
| Repo | ✅ lint · typecheck 15/15 · all tests · `next build` |
| Browser (`race-e2e.mjs`, mocked Supabase) | ✅ **28/28**, screenshots reviewed |
| Concurrency (parallel sessions) | ✅ 9 simultaneous check-ins → positions exactly 1..9; 10 simultaneous check-ins of one athlete → 1 row; 9 staggered check-ins racing a moving clock and 80 binder passes → start order = check-in order, 0 inversions, nobody bound twice (stable over 3 runs) |
| Negative control | ✅ removing the heat lock produces positions `1,2,2,2,5,5,5,5,8` and fails the suite |

## Changes to existing (race) objects
- `race_check_ins` is no longer *fully* append-only: the single legal follow-up write is attaching a tie-draw result (NULL → draw, once, only for a real participant, only if it matches the recorded draw). Update/delete/truncate of anything else remain refused (tested, including as the table owner).
- A heat's `anchor_race_ms` and `planned_slot_count` can never change once set (trigger, applies to every writer).

## Open questions / limits
1. **No undo for a wrong check-in.** Check-ins are append-only by design (audit). A mistake needs a designed correction flow (withdraw/re-check) — **decision needed**.
2. **Late arrival after the heat closed** (→ `MISSED_START`) cannot check in at all; an Event Manager override does not exist yet.
3. **Overflow capacity of 1** follows from the approved 3:30 interval and 10:00 gap. A longer gap gives more (15:00 → 3).
4. **Slot start times shown to athletes** are plan times; they are exact only if the race is never paused.
5. The **reception screen is English only** and has no offline mode (judge app will).
6. Browser tests use a mocked backend; nothing has run against a real Supabase project yet.
