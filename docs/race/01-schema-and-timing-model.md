# THE NINTH — Final Schema & Timing Model (for review)

**Status:** FINAL for sign-off (rev 2). No migration has been written or applied.
**Implemented:** Phase 3 migrations `20260928000001`–`20260928000005`. Test report and implementation notes (template seed tables, trimmed `race_action_status`, no change to `user_role`) in [03-phase-3-migration-report.md](03-phase-3-migration-report.md).
**Timing validated:** [02-timing-validation-50-athletes.md](02-timing-validation-50-athletes.md), produced by `node docs/race/scripts/timing-validation.mjs` (all invariants pass).
**Supersedes:** §14–§15 of [00-technical-report.md](00-technical-report.md) wherever they differ.
**Based on:** the Phase 2 decisions (D-1 … D-12) and the final sign-off decisions (F-1 … F-7, §11).

---

## 0. Decisions applied

| # | Decision | Where it lands |
|---|---|---|
| D-1 | Start interval **LOCKED at 3:30** (3:00 work + 0:30 transition) | `race_events` check constraint; §2 |
| D-2 | Heat gap configurable, default **10:00**, per event | `race_events.heat_gap_ms`; §2.3 |
| D-3 | START EVENT once, then everything runs automatically; manual next-heat start only when configured | `heat_start_mode`; §2.3, §5 |
| D-4 | Check-in order **per heat**, server timestamp, random draw only among exact ties, audited | `race_check_ins`; §3 |
| D-5 | SKIP leaves the slot empty; later athletes keep their start times | `race_start_slots`; §3.4 |
| D-6 | Station ties: standard competition ranking 1, 2, 2, 4 | §6 |
| D-7 | DNS / MISSED_START is not ranked; DNF for athletes who start but don't finish | `race_status`; §6 |
| D-8 | No grace period; offline queue; anything received after lock becomes PENDING_MASTER_REVIEW | `race_performance_events`; §4 |
| D-9 | VOID LAST ACTION before lock only, never deletes, both actions audited | §4.4 |
| D-10 | 2-break limit applies **only** to the Masters Wall Squat Hold | `race_station_rules`; §7 |
| D-11 | Manual payments: PENDING / PAID / REFUNDED / CANCELLED, ready for Paymob later | `race_payments`; §8 |
| D-12 | Primary internet plus 4G/5G backup; offline-aware judge app; server authoritative | §4, §5 |

---

## 1. Principles

1. **One clock.** Official time is **race time**: milliseconds since START EVENT, minus all paused time. Only Postgres computes it, using `clock_timestamp()`.
2. **The schedule is arithmetic.** Every start, window, lock and countdown is a pure function of: the heat anchors, the slot index, the station number and the constants below. No process has to "tick" for time to be correct.
3. **Ledger, not state.** Judge actions are append-only rows. Scores are *derived* from them and cached. Corrections are overrides stored alongside the ledger, never edits to it.
4. **Server decides validity.** A device reports what it saw. The server alone decides ACCEPTED / REJECTED / PENDING_MASTER_REVIEW.

---

## 2. Timing model

### 2.1 Constants (per event, frozen at START EVENT)

| Symbol | Column | Value | Rule |
|---|---|---|---|
| `W` | `work_ms` | 180 000 | locked |
| `T` | `transition_ms` | 30 000 | locked |
| `I` | `start_interval_ms` | 210 000 | **CHECK `I = W + T`** (D-1) |
| `S` | `station_count` | 9 | fixed |
| `G` | `heat_gap_ms` | 600 000 | configurable (D-2). Measured from the **last athlete's start** (F-1). CHECK `G ≥ I`, so every station keeps ≥ 0:30 changeover |
| `F` | `first_start_offset_ms` | 60 000 | START EVENT → first athlete start: the 60 s pre-race countdown (F-7) |
| `B` | `bind_lead_ms` | 60 000 | slot is bound to an athlete this long before its start |
| `A` | `announce_lead_ms` | 10 000 | voice + GET READY countdown |

`A ≤ B ≤ F` is enforced. The athlete is always named before the announcement, and heat 1 slot 1 binds exactly at START EVENT.

**Before START EVENT**, heat start times are *planned* from `race_events.planned_start_at` (the wall-clock time Master intends to press START). They are used for check-in deadlines and athlete communications. At START EVENT the real anchors replace them.

### 2.2 Race time

```
race_ms(t) = (t − started_at) − paused_total_ms − (paused_at IS NOT NULL ? t − paused_at : 0)
```
- `t` is `clock_timestamp()` on the server.
- While paused, `race_ms` is frozen. Every derived clock freezes with it: event clock, athlete clocks, station clocks, transitions and the next-start countdown. **Pause needs no special cases anywhere else.**
- Wall time for display: `wall(r) = started_at + r + paused_total_ms` (assuming no further pause). Clients recompute it on every pause/resume broadcast.

### 2.3 Heats and anchors

Each heat `h` has an **anchor** `anchor_h`: the race time of its slot 0. Anchors are written to `race_heats.anchor_race_ms` and never recomputed after that.

- `N_h` is the heat's `planned_slot_count` (its roster size, frozen at START EVENT; 1–9).
- **AUTO mode** (default). All anchors are written at START EVENT:
  ```
  anchor_1   = F
  anchor_h+1 = last_start_h + G  =  anchor_h + (N_h − 1) · I + G      (F-1)
  ```
  For a full heat: last start = heat start + 28:00, and the next heat starts at heat start + 38:00.
- **MANUAL mode** (D-3: "only when explicitly configured"). This is `race_events.heat_start_mode = 'MANUAL'`, or a per-heat override.
  - Heat `h+1` stays `AWAITING_START`. The race clock keeps running.
  - An authorized user presses **START NEXT HEAT**.
  - The server sets `anchor_h+1 = max(race_ms(now) + B, anchor_h + (last_used_slot_h + 1) · I)`. This guarantees no station overlap.
  - The action is audited.

### 2.4 Slot and station windows

For heat `h`, slot `k` (0-based), station `n` (1–9):

```
slot_start(h,k)         = anchor_h + k · I
station_start(h,k,n)    = slot_start(h,k) + (n − 1) · I
station_end(h,k,n)      = station_start(h,k,n) + W          ← performance lock, no grace
transition_end(h,k,n)   = station_end(h,k,n) + T            (n < 9; no transition after S09)
athlete_finish(h,k)     = slot_start(h,k) + 8·I + W  = slot_start + 31:00
bind_at(h,k)            = slot_start(h,k) − B
announce_at(h,k)        = slot_start(h,k) − A
```

**Changeover check (why 3:30 works).** At any station, consecutive slots `k` and `k+1` are separated by `I − W = T = 30 s`. Across a heat boundary the separation is `G − W = 7:00`. Station windows never overlap, by construction, and the validation script checks this on all 9 stations.

**Heats overlap on the course, never on a station.** Heat 2 starts while heat 1's later athletes are still racing. At most 9 athletes are ever on course at once (validated).

**Timeline for one athlete** (race time relative to slot start):

| Station | Work | Transition |
|---|---|---|
| 01 | 00:00 – 03:00 | 03:00 – 03:30 |
| 02 | 03:30 – 06:30 | 06:30 – 07:00 |
| 03 | 07:00 – 10:00 | 10:00 – 10:30 |
| 04 | 10:30 – 13:30 | 13:30 – 14:00 |
| 05 | 14:00 – 17:00 | 17:00 – 17:30 |
| 06 | 17:30 – 20:30 | 20:30 – 21:00 |
| 07 | 21:00 – 24:00 | 24:00 – 24:30 |
| 08 | 24:30 – 27:30 | 27:30 – 28:00 |
| 09 | 28:00 – 31:00 | — |

### 2.5 Worked event: 50 athletes (5 × 9 + 5), AUTO, G = 10:00 — validated

| Heat | N | Heat start | Last athlete start | Last athlete finish | Next heat start |
|---|---|---|---|---|---|
| 1 | 9 | 0:01:00 | 0:29:00 | 1:00:00 | 0:39:00 |
| 2 | 9 | 0:39:00 | 1:07:00 | 1:38:00 | 1:17:00 |
| 3 | 9 | 1:17:00 | 1:45:00 | 2:16:00 | 1:55:00 |
| 4 | 9 | 1:55:00 | 2:23:00 | 2:54:00 | 2:33:00 |
| 5 | 9 | 2:33:00 | 3:01:00 | 3:32:00 | 3:11:00 |
| 6 | 5 | 3:11:00 | 3:25:00 | **3:56:00** | — |

The full event finishes at **3:56:00** race time (12:56 if START EVENT is at 09:00). All 50 start slots are listed in [02-timing-validation-50-athletes.md](02-timing-validation-50-athletes.md).

Pause example: a 2:00 pause at race time 0:20:00 moves every later wall-clock time +2:00. Nothing in the database changes except `race_pauses` and `paused_total_ms`.

### 2.6 Overflow buffer (late athletes, without moving anyone)

A heat can take extra slots `k ≥ N_h` only while they stay clear of the next heat:
```
(k + 1) · I ≤ (N_h − 1) · I + G      ⇒      max overflow slots = floor(G / I) − 1 = floor(600/210) − 1 = 1
```
- The overflow slots fit inside the heat gap, so **nobody's start time changes** (D-5).
- If the overflow slot is used, a further late athlete gets `NO_SLOT_AVAILABLE`. An Event Manager can then move them to a later heat (audited).
- In MANUAL mode the limit is "until the next heat is started".

---

## 3. Check-in, queue and slot binding

### 3.1 Check-in (RPC `race_check_in`)
1. Take an advisory lock on the athlete's heat: `pg_advisory_xact_lock(hash(heat_id))`.
2. `checked_in_at := clock_timestamp()` **after** the lock. Check-in order within a heat is therefore strictly the order of commits (D-4).
3. `kind = LATE` if `checked_in_at > heat_checkin_deadline`. The deadline is heat start − 15:00 (F-7, configurable). Before START EVENT it is computed from `planned_start_at`; after, from the frozen anchor. Heat 1's deadline always falls before START EVENT.
   - Registration status becomes `CHECKED_IN` or `LATE_CHECK_IN`.
4. Audit: `race.checkin` or `race.checkin.late`.

Reception never supplies an order or a position. The RPC takes only `registration_id`.

### 3.2 Order within a heat
```
ORDER BY checked_in_at ASC, tie_draw_position ASC
```
**Exact ties** (identical microsecond timestamp; practically only possible from a bulk import, but required):
- Under the same lock, the server detects every row in the heat with the same `checked_in_at`.
- It creates a `race_tie_draws` row (seed from `gen_random_bytes`, the participants, the resulting order).
- It sets `tie_draw_position` on only those rows.
- Audit: `race.checkin.random_draw`, with the seed and the order.

### 3.3 Binding (lazy, deterministic)
At `bind_at(h,k)` the slot is bound to the **first checked-in, unbound, eligible** registration in heat order.
- **If none:** the slot becomes `EMPTY` (it burns). Later athletes are unaffected.
- **Before binding:** athletes and screens see a **projected** start. Projections only ever move back when someone is skipped, never forward, because new check-ins always sort last.
- **Late athletes** are last in order by construction, so they land in the next available slot, overflow included (§2.6).
- **Who binds:** `race_advance(event_id)` (idempotent) performs the binding. It is called by Master Control every second, by judge and screen fetches, and by pg_cron as a backup.
  - Binding is the **only** thing that depends on a caller.
  - `B = 60 s` gives the callers 50 seconds of headroom before the announcement.

### 3.4 SKIP (D-5)
- Allowed from `bind_at` until `station_end(h,k,1)` (the end of the athlete's Station 01 window).
- The slot becomes `SKIPPED`, and the registration becomes `MISSED_START` (DNS).
- Any station results already opened for that athlete become `VOID_DNS`.
- The slot is **not** reassigned, and every other slot keeps its time.
- Audited with a reason.

### 3.5 End of heat
When the last slot of a heat is past `bind_at`, any registration in that heat that is still unbound is set to `MISSED_START` by `race_advance`. This is audited as a `system` actor.

---

## 4. Judge actions, offline queue, lock and review

### 4.1 What a device sends (per action)
`client_event_id` (UUID, idempotency key), `device_id`, `device_seq` (monotonic per device), `registration_id`, `station_number`, `type`, `value`, `device_recorded_at`, `device_clock_offset_ms`, `offset_sampled_at`, `origin` (`ONLINE | OFFLINE_QUEUE`).

Because the schedule is arithmetic and bound slots are cached, **a judge phone can tell which athlete is on its station even while offline.**

### 4.2 Server acceptance (RPC `race_record_action`)
The server computes `r = race_ms(clock_timestamp())` on receipt. Then:

| Condition (checked in order) | Result |
|---|---|
| `client_event_id` already exists | Return the stored result (**idempotent**, never a duplicate) |
| Caller is not the judge assigned to that station | REJECTED `NOT_ASSIGNED` |
| Registration status is not `STARTED` | REJECTED `ATHLETE_NOT_ON_COURSE` |
| Race is paused, `origin = ONLINE` | REJECTED `RACE_PAUSED` |
| `r < station_start` | REJECTED `WINDOW_NOT_OPEN` |
| Performance action, `station_start ≤ r < station_end` | **ACCEPTED** |
| Performance action (REP, NO_REP, LAP, PENALTY, HOLD_*), `r ≥ station_end` | **PENDING_MASTER_REVIEW** (never auto-accepted, D-8). No REP or LAP is ever *accepted* after 3:00 (F-3) |
| Scoring action (§4.3: S04/S07 technique, S09 photo/OCR), `station_start ≤ r < transition_end` | **ACCEPTED** (F-3). For S09 there is no next station, so the scoring window is `[end, end + 30 s)` too |
| Scoring action, `r ≥ transition_end` | PENDING_MASTER_REVIEW |

- Every row stores both the server race time (`server_race_ms`) and the device estimate (`device_race_ms`). The reviewer sees "device says 02:58.4, received 03:07.1".
- Online actions received during a pause are rejected. Offline actions that were *recorded* during a pause go to review.

### 4.3 Action types
| Type | Class | Stations |
|---|---|---|
| `REP` | performance | S01 (M/W), S02, S04 (valid combo), S05, S07, S08 |
| `NO_REP` | performance | S01 (M/W), S02, S04, S05, S07, S08 |
| `LAP` | performance | S03, S06 |
| `PENALTY` | performance | S06 |
| `HOLD_START` / `HOLD_BREAK` / `HOLD_RESUME` | performance | S01 Masters |
| `TECHNIQUE_SCORE` (0–10) | scoring | S04, S07 |
| `OCR_CAPTURE` / `OCR_CONFIRM` / `OCR_RETAKE` | scoring | S09 |
| `VOID` | same class as its target | all |

- **Hold timing** uses `server_race_ms`.
- Any `HOLD_*` action with `origin = OFFLINE_QUEUE` puts the whole Masters hold result in `REVIEW_PENDING`. It is **never auto-accepted**, even if it syncs before lock (F-6), because the server can't time it honestly.

### 4.4 VOID LAST ACTION (D-9)
- The judge sends `VOID`. The server picks the target: the latest ACCEPTED, non-voided action by that judge on that station result.
- It is allowed only while that action class's window is open.
- The original row is never touched. `VOID` is its own ledger row with `voids_event_id`.
- `admin_audit_log` gets `race.action.void`, with a snapshot of the original action and of the VOID.
- After lock the judge has no VOID. Master/Admin use a correction instead (§4.6).

### 4.5 Master review (PENDING_MASTER_REVIEW)
`race_action_reviews`: one row per pending action.
- Decision `APPROVED | REJECTED`, reviewer, reason (required), timestamp, and an audit entry.
- An approved action counts in the derived score.
- A station result with an unresolved review is `REVIEW_PENDING`, and its category's rankings stay **PROVISIONAL**.

### 4.6 Corrections (after lock)
`race_result_corrections`: field, old value, new value, reason, user and timestamp, plus an audit entry.
- The official value is the derived value with the latest correction for each field applied.
- The history is fully replayable.

### 4.7 Station result states
```
SCHEDULED → ACTIVE (work) → SCORING (transition, technique/OCR only) → LOCKED
                                              ↘ REVIEW_PENDING ↗ (after reviews resolve)
LOCKED → CORRECTED        any → VOID_DNS (athlete skipped)
```
- The stored `status` is a cache that `race_advance` maintains.
- **Acceptance never reads it.** It always recomputes the window from the anchors.

---

## 5. Engine operations (all RPCs, all audited)

| RPC | Who | Effect |
|---|---|---|
| `race_server_time()` | anyone | Returns `clock_timestamp()` and `race_ms` (for clock sync) |
| `race_lock_heats(event)` | Event Manager | Freezes the rosters. Later changes need `race.heats.override_lock` plus a reason |
| `race_start_event(event)` | Master | Once only. Sets `started_at`, freezes constants, `planned_slot_count` and AUTO anchors, creates all slots |
| `race_pause(event, reason)` / `race_resume(event)` | Master/Admin | Writes a `race_pauses` row and updates `paused_at` / `paused_total_ms` |
| `race_start_next_heat(event, heat)` | Master (MANUAL mode only) | Sets the anchor as in §2.3 |
| `race_skip_athlete(slot, reason)` | Master | §3.4 |
| `race_mark_dnf(registration, reason)` | Master | Athlete leaves mid-race: DNF, remaining stations `VOID_DNS` |
| `race_advance(event)` | system / any client | Idempotent: bind slots, mark STARTED / FINISHED / MISSED_START, update result status caches |
| `race_record_action(...)` | Judge | §4.2 |
| `race_review_action(...)` / `race_correct_result(...)` | Master/Admin | §4.5, §4.6 |
| `race_compute_rankings(event, category)` | system / Event Manager | §6. Writes a versioned snapshot |

---

## 6. Scoring and ranking

**Station score.** `official_score` is derived from the accepted and approved actions (minus voided ones), then corrections are applied. The result is **higher-is-better at all 9 stations**.

**Station placement** (per station × category, across all heats):
- Eligible: registrations with `race_status = FINISHED` only. **DNS (MISSED_START) and DNF are excluded from station and overall rankings** (D-7, F-2). Their ledger, results and history are kept and shown as DNS/DNF.
- `placement = RANK() OVER (PARTITION BY station, category ORDER BY official_score DESC)` gives 1, 2, 2, 4 (D-6).

**Overall.** `total_points = Σ placement` over the 9 stations, lowest wins. Then:
```
RANK() OVER (PARTITION BY category
             ORDER BY total_points ASC,
                      s04_technique DESC NULLS LAST,
                      s07_technique DESC NULLS LAST,
                      (s04_technique + s07_technique) DESC NULLS LAST)
```
Athletes still equal after all of that share the rank (the tie is retained). **MISSED_START athletes are excluded entirely** (D-7).

**Snapshots.** `race_rankings` stores one row per athlete per computation (`version`, `computed_at`, `is_official`). A snapshot can be marked official only when every result in the category is `LOCKED` / `CORRECTED` and no review is pending.

---

## 7. Station rules (seed data, configurable)

| # | Station | Men | Women | Masters | Scoring |
|---|---|---|---|---|---|
| 01 | Squat | Barbell 20 kg, chair depth | Barbell 5 kg, chair depth | **Wall hold, BW, max 2 breaks** | reps (M/W) · `hold_ms` (Masters) |
| 02 | Push-up | default Standard | default Knee | default Knee | reps. Knee: `floor(raw/3)`, stores raw + remainder |
| 03 | Sled push | 100 kg | 60 kg | 80 kg | completed 10 m laps |
| 04 | Jab + Cross | — | — | — | valid combos (+ technique /10) |
| 05 | Box jump | 50 cm | 40 cm | 40 cm | reps |
| 06 | DB carry | 2×24 kg | 2×16 kg | 2×20 kg | Evaluated in order: each PENALTY cancels the last completed, not-yet-cancelled lap. With 0 laps it cancels nothing (no debt carried forward). Never negative (F-4) |
| 07 | Front kick | — | — | — | valid kicks (+ technique /10). **Barrier rule: configurable text, no mechanics coded** |
| 08 | Burpee + speed ball | — | — | — | complete cycles |
| 09 | Row | damper 5 | damper 4 | damper 4 | metres (OCR confirmed) |

- **Masters hold:** a hold interval runs from `HOLD_START`/`HOLD_RESUME` to `HOLD_BREAK` or `station_end`. `breaks_used ≤ 2`. The 3rd `HOLD_BREAK` ends the hold for good, and any further `HOLD_RESUME` is rejected with `MAX_BREAKS_REACHED`. The athlete is not disqualified.
- **Push-up style:** stored on the registration. It can be changed (audited) until S02 `station_start`, then it is locked.

---

## 8. Payments (D-11)
- Manual confirmation by Reception or the Event Manager. `provider = 'MANUAL'`.
- Paymob-ready fields: `provider`, `provider_order_id`, `provider_txn_id`, `race_payment_events` (raw webhook ledger), and an idempotency key.
- **Adding Paymob later means adding a provider value and a webhook route. No schema rewrite.**
- A registration becomes `CONFIRMED` when a payment is `PAID`, or when an Event Manager waives payment with a reason (audited).

---

## 9. Final schema (DDL for review — not yet a migration)

```sql
-- ───────────── enums ─────────────
create type race_event_status   as enum ('DRAFT','REGISTRATION_OPEN','REGISTRATION_CLOSED','HEATS_LOCKED','LIVE','FINISHED','RESULTS_OFFICIAL','ARCHIVED');
create type race_heat_start_mode as enum ('AUTO','MANUAL');
create type race_heat_status    as enum ('DRAFT','LOCKED','AWAITING_START','RUNNING','FINISHED');
create type race_category_code  as enum ('MEN','WOMEN','MASTERS');
create type race_scoring_type   as enum ('REPS','HOLD_MS','LAPS','CONVERTED_REPS','DISTANCE_M');
create type race_reg_status     as enum ('PENDING_PAYMENT','CONFIRMED','CANCELLED');
create type race_status         as enum ('REGISTERED','CHECKED_IN','LATE_CHECK_IN','STARTED','FINISHED','MISSED_START','DNF','WITHDRAWN');
create type race_payment_status as enum ('PENDING','PAID','REFUNDED','CANCELLED');
create type race_payment_provider as enum ('MANUAL','PAYMOB');
create type race_payment_method as enum ('CASH','INSTAPAY','VODAFONE_CASH','CARD_POS','BANK_TRANSFER','ONLINE');
create type race_pushup_style   as enum ('STANDARD','KNEE');
create type race_checkin_kind   as enum ('ON_TIME','LATE');
create type race_slot_status    as enum ('OPEN','BOUND','STARTED','SKIPPED','EMPTY');
create type race_result_status  as enum ('SCHEDULED','ACTIVE','SCORING','REVIEW_PENDING','LOCKED','CORRECTED','VOID_DNS');
create type race_action_type    as enum ('REP','NO_REP','LAP','PENALTY','HOLD_START','HOLD_BREAK','HOLD_RESUME','TECHNIQUE_SCORE','OCR_CAPTURE','OCR_CONFIRM','OCR_RETAKE','VOID');
create type race_action_origin  as enum ('ONLINE','OFFLINE_QUEUE');
create type race_action_status  as enum ('ACCEPTED','REJECTED','PENDING_MASTER_REVIEW','APPROVED','REVIEW_REJECTED');
create type race_role           as enum ('RECEPTION','JUDGE','MASTER_CONTROL','EVENT_MANAGER','STATION_SCREEN');
create type race_device_kind    as enum ('JUDGE','STATION_SCREEN','VENUE_SCREEN','MASTER','RECEPTION');
create type race_judge_app_status as enum ('SUBMITTED','APPROVED','REJECTED','WITHDRAWN');
create type race_ocr_status     as enum ('CAPTURED','CONFIRMED','RETAKEN','MANUAL');

-- ───────────── configuration ─────────────
create table race_events (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  slug text not null unique,
  name text not null default 'THE NINTH',
  event_date date not null,
  venue text,
  timezone text not null default 'Africa/Cairo',
  status race_event_status not null default 'DRAFT',
  work_ms int not null default 180000,
  transition_ms int not null default 30000,
  start_interval_ms int not null default 210000,
  station_count smallint not null default 9 check (station_count = 9),
  heat_size smallint not null default 9 check (heat_size between 1 and 9),
  heat_gap_ms int not null default 600000,   -- from LAST athlete START (F-1)
  heat_start_mode race_heat_start_mode not null default 'AUTO',
  first_start_offset_ms int not null default 60000,
  bind_lead_ms int not null default 60000,
  announce_lead_ms int not null default 10000,
  checkin_deadline_before_heat_ms int not null default 900000,
  planned_start_at timestamptz,             -- planned START EVENT wall time (deadlines before start)
  heats_lock_at timestamptz,               -- planned (48–72 h before)
  heats_locked_at timestamptz, heats_locked_by uuid references profiles(id),
  config jsonb not null default '{}',       -- voice language, display options…
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_interval_ms = work_ms + transition_ms),          -- D-1
  check (heat_gap_ms >= start_interval_ms),                     -- ≥ 30 s changeover at heat boundary
  check (announce_lead_ms <= bind_lead_ms and bind_lead_ms <= first_start_offset_ms)
);

create table race_categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events(id) on delete cascade,
  code race_category_code not null,
  name text not null,
  min_age smallint,                          -- 40 for MASTERS
  default_pushup_style race_pushup_style not null,
  sort_order smallint not null,
  unique (event_id, code)
);

create table race_stations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events(id) on delete cascade,
  number smallint not null check (number between 1 and 9),
  code text not null,                        -- SQUAT, PUSH_UP, SLED_PUSH, JAB_CROSS, BOX_JUMP, DB_CARRY, FRONT_KICK, BURPEE_SPEEDBALL, ROW
  name text not null,
  has_technique boolean not null default false,
  requires_ocr boolean not null default false,
  unique (event_id, number)
);

create table race_station_rules (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references race_stations(id) on delete cascade,
  category_id uuid not null references race_categories(id) on delete cascade,
  scoring_type race_scoring_type not null,
  higher_is_better boolean not null default true,
  movement text not null,                    -- 'Barbell Squat', 'Wall Squat Hold'…
  equipment jsonb not null default '{}',     -- {load_kg, height_cm, damper, lap_m}
  rule jsonb not null default '{}',          -- {max_breaks, knee_ratio, penalty_mode, barrier_rule_text, …}
  version int not null default 1,
  unique (station_id, category_id)
);

-- ───────────── people ─────────────
create table race_athletes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),   -- optional link to an app account
  member_id uuid references members(id),     -- optional link to a gym member
  full_name text not null,
  phone text not null,
  email text,
  gender gender,
  date_of_birth date,
  emergency_contact jsonb,
  created_at timestamptz not null default now()
);
create index on race_athletes (phone);

create table race_heats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events(id) on delete cascade,
  number smallint not null,
  status race_heat_status not null default 'DRAFT',
  start_mode race_heat_start_mode,           -- null = inherit event
  planned_slot_count smallint,               -- frozen at START EVENT
  anchor_race_ms bigint,                     -- frozen (AUTO at start, MANUAL at START NEXT HEAT)
  anchored_by uuid references profiles(id),
  unique (event_id, number)
);

create table race_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events(id),
  athlete_id uuid not null references race_athletes(id),
  category_id uuid not null references race_categories(id),
  heat_id uuid references race_heats(id),
  race_number text not null,                 -- 'N027' (per-event counter)
  status race_reg_status not null default 'PENDING_PAYMENT',
  race_status race_status not null default 'REGISTERED',
  pushup_style race_pushup_style not null,
  pushup_style_locked_at timestamptz,
  waiver_accepted_at timestamptz,
  payment_waived_by uuid references profiles(id), payment_waiver_reason text,
  created_at timestamptz not null default now(),
  unique (event_id, race_number),
  unique (event_id, athlete_id)
);

create table race_payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references race_registrations(id),
  amount numeric(10,2) not null check (amount >= 0),
  currency char(3) not null default 'EGP',
  status race_payment_status not null default 'PENDING',
  provider race_payment_provider not null default 'MANUAL',
  method race_payment_method,
  provider_order_id text, provider_txn_id text,
  idempotency_key text unique,
  recorded_by uuid references profiles(id),
  paid_at timestamptz, refunded_at timestamptz, cancelled_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create table race_payment_events (           -- append-only provider/webhook ledger (Paymob later)
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references race_payments(id),
  provider race_payment_provider not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default clock_timestamp()
);

create table race_staff (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  role race_role not null,
  station_id uuid references race_stations(id),  -- required for JUDGE / STATION_SCREEN
  active boolean not null default true,
  assigned_by uuid references profiles(id),
  assigned_at timestamptz not null default now(),
  check ((role in ('JUDGE','STATION_SCREEN')) = (station_id is not null))
);
create unique index on race_staff (event_id, profile_id, role, coalesce(station_id, '00000000-0000-0000-0000-000000000000'));

create table race_judge_applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events(id),
  full_name text not null, phone text not null, email text,
  experience text, preferred_stations smallint[],
  status race_judge_app_status not null default 'SUBMITTED',
  reviewed_by uuid references profiles(id), reviewed_at timestamptz, review_note text,
  created_at timestamptz not null default now()
);

create table race_devices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events(id),
  profile_id uuid references profiles(id),
  kind race_device_kind not null,
  station_id uuid references race_stations(id),
  label text not null,
  pairing_code_hash text,
  last_seen_at timestamptz, last_seq bigint not null default 0,
  revoked_at timestamptz
);

-- ───────────── race day ─────────────
create table race_clock (                    -- 1 row per event; realtime fan-out row
  event_id uuid primary key references race_events(id),
  started_at timestamptz,
  started_by uuid references profiles(id),
  paused_at timestamptz,
  paused_total_ms bigint not null default 0,
  finished_at timestamptz,
  version bigint not null default 0,         -- bumps on every state change
  updated_at timestamptz not null default clock_timestamp()
);

create table race_pauses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events(id),
  paused_at timestamptz not null, paused_race_ms bigint not null, paused_by uuid not null references profiles(id), reason text,
  resumed_at timestamptz, resumed_by uuid references profiles(id)
);

create table race_check_ins (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references race_registrations(id),
  heat_id uuid not null references race_heats(id),
  checked_in_at timestamptz not null,        -- clock_timestamp() under heat lock
  checked_in_by uuid not null references profiles(id),
  kind race_checkin_kind not null,
  tie_draw_id uuid,
  tie_draw_position smallint
);
create index on race_check_ins (heat_id, checked_in_at, tie_draw_position);

create table race_tie_draws (
  id uuid primary key default gen_random_uuid(),
  heat_id uuid not null references race_heats(id),
  tied_at timestamptz not null,
  seed bytea not null,
  participants uuid[] not null,              -- registration ids, draw order
  created_at timestamptz not null default clock_timestamp()
);

create table race_start_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events(id),
  heat_id uuid not null references race_heats(id),
  slot_index smallint not null,              -- k within heat (≥ N = overflow)
  is_overflow boolean not null default false,
  registration_id uuid unique references race_registrations(id),
  status race_slot_status not null default 'OPEN',
  bound_at timestamptz,
  skipped_at timestamptz, skipped_by uuid references profiles(id), skip_reason text,
  unique (heat_id, slot_index)
);
-- start/end times are NOT stored: derived from heat.anchor_race_ms + slot_index·I

create table race_station_results (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references race_registrations(id),
  station_id uuid not null references race_stations(id),
  slot_id uuid not null references race_start_slots(id),
  window_start_race_ms bigint not null,      -- materialized copy for indexing/audit (always == derived)
  window_end_race_ms bigint not null,
  judge_profile_id uuid references profiles(id),
  status race_result_status not null default 'SCHEDULED',
  official_score numeric,                    -- derived + corrections
  derived jsonb not null default '{}',       -- {valid, no_reps, knee_raw, remainder, completed_laps, penalties, cancelled_laps, hold_ms, breaks_used, distance_m}
  technique_score numeric(3,1) check (technique_score between 0 and 10),
  derived_version bigint not null default 0,
  locked_at timestamptz,
  unique (registration_id, station_id)
);

create table race_performance_events (       -- APPEND-ONLY LEDGER (trigger blocks UPDATE/DELETE)
  id uuid primary key default gen_random_uuid(),
  station_result_id uuid not null references race_station_results(id),
  type race_action_type not null,
  value numeric,
  payload jsonb not null default '{}',
  voids_event_id uuid references race_performance_events(id),
  client_event_id uuid not null unique,      -- idempotency
  device_id uuid references race_devices(id),
  device_seq bigint,
  origin race_action_origin not null,
  device_recorded_at timestamptz,
  device_clock_offset_ms int,
  device_race_ms bigint,
  server_received_at timestamptz not null default clock_timestamp(),
  server_race_ms bigint not null,
  judge_profile_id uuid not null references profiles(id),
  status race_action_status not null,
  rejection_code text,
  unique (device_id, device_seq)
);
create index on race_performance_events (station_result_id, server_race_ms);

create table race_action_reviews (
  id uuid primary key default gen_random_uuid(),
  performance_event_id uuid not null unique references race_performance_events(id),
  decision text not null check (decision in ('APPROVED','REJECTED')),
  reason text not null,
  reviewed_by uuid not null references profiles(id),
  reviewed_at timestamptz not null default clock_timestamp()
);
-- effective status = review decision if present, else ledger status (ledger row itself never changes)

create table race_ocr_records (
  id uuid primary key default gen_random_uuid(),
  station_result_id uuid not null references race_station_results(id),
  storage_path text not null,                -- original image, never overwritten
  provider text, raw_response jsonb,
  proposed_distance_m int, confidence numeric,
  confirmed_distance_m int,
  status race_ocr_status not null default 'CAPTURED',
  retake_of uuid references race_ocr_records(id),
  captured_by uuid not null references profiles(id),
  captured_at timestamptz not null default clock_timestamp(),
  confirmed_by uuid references profiles(id), confirmed_at timestamptz
);

create table race_result_corrections (       -- append-only
  id uuid primary key default gen_random_uuid(),
  station_result_id uuid not null references race_station_results(id),
  field text not null,                       -- 'official_score' | 'technique_score' | 'derived.completed_laps' …
  old_value jsonb, new_value jsonb not null,
  reason text not null check (length(trim(reason)) > 0),
  corrected_by uuid not null references profiles(id),
  corrected_at timestamptz not null default clock_timestamp()
);

create table race_rankings (                 -- versioned snapshots
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events(id),
  category_id uuid not null references race_categories(id),
  registration_id uuid not null references race_registrations(id),
  version int not null,
  station_placements jsonb not null,         -- {"1": 3, "2": 1, …}
  total_points int not null,
  tb_s04_technique numeric(3,1), tb_s07_technique numeric(3,1), tb_sum numeric(4,1),
  overall_rank int not null,
  is_official boolean not null default false,
  computed_at timestamptz not null default clock_timestamp(),
  computed_by uuid references profiles(id),
  unique (category_id, registration_id, version)
);
```

**Audit.** This reuses the existing `admin_audit_log` via `log_audit_event()` (`action = 'race.*'`, `target_table = 'race_*'`). A read policy is added for `has_permission('race.audit.view')`. The Audit screen shows `admin_audit_log` merged with the ledger (`race_performance_events`, `race_action_reviews`, `race_result_corrections`, `race_pauses`, `race_tie_draws`), so a whole race can be reconstructed from the database alone.

**Immutability.** `BEFORE UPDATE OR DELETE` triggers raise on `race_performance_events`, `race_action_reviews`, `race_result_corrections`, `race_tie_draws`, `race_payment_events` and `race_check_ins`. `race_pauses` allows exactly one update (setting `resumed_*`), and only through `race_resume`.

**RLS summary.**
- Judges read only their station's current or next athlete, via `has_race_role(event, 'JUDGE', station)`, and write only through `race_record_action`.
- Station screens are read-only for their own station.
- Reception reads registrations and check-ins, and writes only through `race_check_in`.
- Master and Event Manager work through RPCs.
- The public sees only an anonymized results view (race number, name, category, placements) once `RESULTS_OFFICIAL` is set, plus live provisional results if enabled in `config`.

---

## 10. Realtime & client clock

- **Clock sync:** 6 calls to `race_server_time()`, keep the sample with the lowest round-trip time, `offset = server − (t0+t1)/2`. Repeated every 60 s and on reconnect. The offset is **only for display**.
- **Channels:**
  - `postgres_changes` on `race_clock` (pause/resume/start: every client recomputes).
  - `race_start_slots` (binding, skip).
  - `race_station_results` filtered by `station_id` (live score).
  - **Broadcast** `race:{event}` for announcements.
  - **Presence** `race:{event}:devices` for the judge/screen connection panel.
- **Station screen states** are pure functions of `race_ms`:
  - `WORK` inside a window.
  - `TIME / TRANSITION` for `[end, end+30s)`, showing the final score, the next station and the next athlete.
  - `GET READY` for `[start−10s, start)`.
  - `NEXT ATHLETE` otherwise, with a countdown to the next bound or projected start.
  - `WAITING` before the station's first athlete.
  - `RACE PAUSED — PLEASE WAIT FOR OFFICIAL` overrides everything while `paused_at` is set.

---

## 11. Final decisions (sign-off round)

| # | Decision | Applied in |
|---|---|---|
| F-1 | Heat gap measured from the **last athlete's START**. Full heat: last start = heat start + 28:00, next heat = +10:00. Configurable, default 10:00 | §2.1, §2.3, §2.6, `race_events` |
| F-2 | DNF excluded from station and overall rankings, same as DNS. Raw results and history kept | §6 |
| F-3 | No REP/LAP accepted after 3:00. S04/S07 technique and S09 photo/OCR accepted through the 30 s transition. Later input → PENDING_MASTER_REVIEW | §4.2 |
| F-4 | S06 penalty with 0 laps cancels nothing. Never negative | §7 |
| F-5 | Tie-break exactly as the rulebook: S04 tech → S07 tech → S04+S07 → retain tie | §6 |
| F-6 | Offline Masters wall-hold data → PENDING_MASTER_REVIEW, never auto-accepted | §4.3 |
| F-7 | 60 s pre-race countdown; first athlete at +60 s; slot fixed at −60 s; voice at −10 s; check-in closes at heat start − 15:00 | §2.1, §3.1 |

**Changes caused by F-1 (rev 1 → rev 2):**
- Next-heat formula is now `anchor + (N − 1)·I + G` (was `+ N·I + G`).
- A full heat now takes 38:00 from heat start to the next heat start (was 41:30).
- The 50-athlete event ends at **3:56:00** (was 4:13:30).
- Late-athlete overflow drops to **1 slot per heat** (was 2).
- New `CHECK heat_gap_ms ≥ start_interval_ms`.
- New column `race_events.planned_start_at`, needed because heat 1's check-in closes before START EVENT.

No open items remain. On sign-off, Phase 3 starts with the migrations, in this order:
1. Enums + configuration tables.
2. People + heats.
3. Race-day ledger + immutability triggers.
4. RLS + RPCs.
5. Seed data for THE NINTH's 9 stations × 3 categories.
