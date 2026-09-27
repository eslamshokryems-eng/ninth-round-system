# THE NINTH — Race System: Phase 1 Technical Report

**Status:** Phase 1 (inspection + proposal). No application code, schema, or config was changed to produce this report. Awaiting approval before Phase 2.

---

## 1. Current project structure

pnpm + Turborepo monorepo, Clean Architecture / DDD (`domain/` → `application/` → `infrastructure/`, dependencies point inward).

```
apps/
  web/      Next.js 14 (App Router) — Reception / Staff / HR / Sales web app (the live product, app.9throundegypt.com)
  site/     Next.js (separate major version) — public marketing site, no Supabase dependency (9throundegypt.com)
  mobile/   Expo SDK 54 React Native — member app + reception screens
packages/
  identity  reception  sales  hr  audit           ← real, tested bounded contexts
  training  nutrition  tracking  billing  notifications  ai   ← mostly scaffolds
  shared-kernel  supabase-client  database-types  i18n  ui  config
supabase/
  migrations/  46 SQL migrations (source of truth for schema + RLS + RPCs)
  functions/   15 Edge Functions (Stripe, AI, QR check-in, notifications…)
docs/          architecture docs + docs/phase-1/* (per-feature specs)
```

## 2. Current technology stack

| Layer | In repo |
|---|---|
| Web | Next.js **14.2**, React 18.2, TypeScript 5.5, Tailwind 3.4 |
| State | Zustand (auth store), TanStack Query |
| Backend | Supabase: Postgres 15, Auth, Storage, Edge Functions |
| Data access | `supabase-js` 2.45 + **SECURITY DEFINER / INVOKER RPCs** + RLS |
| Types | `packages/database-types` — **hand-authored** (not generated) |
| Tests | Vitest (per package), ~dozens of use-case tests |
| CI | GitHub Actions: lint → typecheck → test → build |
| Hosting | Vercel (`apps/web` root, separate project for `apps/site`) |
| Misc | `jsqr` + `qrcode` (QR scan/generate), `xlsx` export, Resend (OTP email) |

**Not present:** Prisma, Supabase Realtime usage, PWA (manifest / service worker), pg_cron.

## 3. Current database structure

~55 tables across gym-management domains: `profiles`, `branches`, `staff_profiles`, `members`, `memberships`, `membership_payments`, `membership_types`, `check_ins`, `expenses`, `other_sales`, `leads`, `lead_followups`, HR (`staff_shifts`, `attendance_records`, `leave_requests`, `staff_salaries`), `permissions`, `role_permissions`, `user_permission_overrides`, `admin_audit_log`, `trusted_devices`, `device_verification_codes`, `security_settings`, plus Phase-1 consumer tables (programs, workouts, nutrition, habits…).

Patterns worth keeping:
- **RLS on every table**, helpers `auth_role()`, `is_admin()`, `is_super_admin()`, `is_branch_staff()`, `has_permission(key)`.
- Business writes go through **RPCs** (`check_in_member`, `register_membership`, …) — atomic, server-timestamped.
- **Append-only audit** (`admin_audit_log`) written only via `log_audit_event()` (SECURITY DEFINER) + generic `log_table_change()` trigger.
- Sequential human codes generated in SQL (member code, employee code).

**No race-related tables exist.** Zero naming collisions if race tables are prefixed `race_`.

## 4. Existing authentication

- Supabase Auth, persisted session in `localStorage`, `AuthBootstrapProvider` → Zustand `useAuthStore` (`profileId`, `role`, `branchId`).
- **Employee-code login** (synthetic email + code, `resolve_login_email()`); accounts created server-side by `/api/staff/create-account` (service role, `verifyStaffAdmin`).
- **Trusted device / OTP** gate on every staff screen (`(reception)/layout.tsx`).
- One role per profile: `user_role` enum = `member | coach | reception | sales_employee | branch_manager | super_admin`.
- Fine-grained permissions: `permissions` catalog + `role_permissions` + per-user overrides, checked by `has_permission()`.

## 5. Existing UI architecture

- App Router route groups: `(auth)`, `(reception)` (25 real pages), `(admin)` / `(trainer)` (empty scaffolds), `api/` route handlers.
- Client components, data via bounded-context modules from `src/lib/composition-root.ts` (singleton Supabase client → `createXModule(client)`).
- Theme: black / white / **gold** (`bg #0B0B0C`, `surface #161616`, `gold #C9A227`) + semantic tokens incl. `brand #DC2626` (red). Desktop sidebar + mobile drawer shell.
- `apps/site` already loads **Anton / Barlow Condensed / Inter / Cairo** — exactly the condensed-heading + clean-body pairing THE NINTH needs.

## 6. Existing reusable components

`apps/web/src/components/ui`: `button`, `card`, `stat-card`, `status-badge`, `page-header`, `section-header`, `text-field`, `select-field`, `filter-bar`, `empty-state`, `loading-skeleton`, `option-card`, `qr-code`.
Feature components: `qr-scanner` (jsqr camera), `date-range-picker`, `staff-picker`, charts (`donut`, `breakdown-bars`, trend charts).

## 7. Existing APIs / server actions

No Next.js server actions. Two surfaces:
- **Route handlers** (`/api/staff/*`, `/api/auth/device/*`) — privileged ops with service role after verifying the caller's JWT.
- **Postgres RPCs** via `supabase.rpc()` — the main write path.
- **Edge Functions** — Stripe checkout/webhook, QR check-in, AI, notifications.

## 8. Supabase integration

Single typed client factory (`packages/supabase-client`), DI through composition roots. Local config in `supabase/config.toml` (Auth + Storage enabled). **Realtime is enabled by default on Supabase but not used anywhere** — no channels, no presence, no `postgres_changes`.

## 9. Prisma integration

**None.** Schema lives in SQL migrations; types are hand-maintained.

## 10. Deployment configuration

Vercel (serverless) for `apps/web` and `apps/site`; Supabase hosted; CI on every PR. No custom `vercel.json` for `apps/web`. Consequence: **no long-running server process** is available for a race engine — see §14.3.

---

## 11. What can be reused

| Existing | Reuse for THE NINTH |
|---|---|
| Supabase Auth + employee-code login + `/api/staff/create-account` pattern | Judge / Master / Reception / Screen accounts |
| `permissions` + `has_permission()` | New `race.*` permission keys |
| `admin_audit_log` + `log_audit_event()` | Governance audit (start, pause, skip, corrections, heat changes, config) |
| RPC-with-server-timestamp pattern (`check_in_member`) | `race_check_in`, `race_record_event`, `race_pause`… |
| Sequential code generator pattern | Race numbers `N001…` |
| `qr-scanner`, `qr-code` | Athlete QR confirmation → instant check-in lookup |
| `xlsx` export | Results / start lists export |
| UI primitives, Tailwind setup, `brand` red token | Race admin pages (re-themed) |
| Supabase Storage | OCR evidence photos |
| `packages/ai` port + `ANTHROPIC_API_KEY` | Rowing-display OCR (vision) |
| Vitest + CI | Race engine + scoring unit tests |
| `apps/site` font stack | Race typography |

## 12. What needs to be added

1. `packages/race` bounded context (domain: timeline, queue, scoring, ranking, station rules — pure + unit-tested).
2. `race_*` schema + RLS + RPCs (§15).
3. Supabase **Realtime** (first use in repo): Broadcast + Presence + `postgres_changes`.
4. Server-clock sync utility (NTP-style offset) for display clocks.
5. `/race/*` route tree with its own black/red/white theme (§16).
6. PWA (manifest + service worker) scoped to judge + screen routes; IndexedDB outbox for offline judge events.
7. Payment integration for registrations (provider TBD — §13).
8. Voice announcement engine (Web Speech API or pre-rendered audio).
9. OCR route handler + Storage bucket `race-evidence`.
10. Race simulator (injectable clock) for testing and rehearsal.

## 13. Potential conflicts & open decisions

### Conflicts with the requested stack
| # | Conflict | Recommendation |
|---|---|---|
| C1 | **Prisma requested, repo uses SQL migrations + RLS + RPCs.** Prisma would bypass RLS (it connects as a privileged DB user), duplicate migration history, and fork the team's conventions. | **Do not add Prisma.** Stay on SQL migrations + `supabase-js` + RPCs. Spec says "use existing stack". |
| C2 | Hand-written `database-types`. Race schema is large. | Generate types (`pnpm db:types`) for race tables once a local Supabase is linked; keep hand-written fallback until then. |
| C3 | Next.js 14 (spec says Next.js — fine). | Stay on 14. No upgrade in scope. |
| C4 | Brand: web app is black/white/**gold**; race is black/**red**/white. | Scoped race theme under `/race` layout (CSS variables), existing app untouched. |
| C5 | Single-role `user_role` enum doesn't cover judge / master / event manager / station screen, and a gym `reception` user isn't automatically race reception. | Event-scoped race roles in a `race_staff` table (§17). Add one enum value `race_official` for external judges with no gym role. |
| C6 | Trusted-device OTP gate is heavy for volunteer judges on race day. | Race routes use their own layout; judges get device-bound session via pairing code (§17). |
| C7 | Vercel = serverless, no ticking server process. | Time-derived engine (§14.3): state is a pure function of anchors; no process needs to "tick". |
| C8 | Stripe exists in repo, but the business runs in Egypt (cash / InstaPay / Vodafone Cash in current receipts). | **Decision needed:** online provider (Paymob / Fawry / Stripe) or reception-recorded payments first. |

### Race-format issues found in the spec (need your call)
| # | Issue | Why it matters | Options |
|---|---|---|---|
| D1 | **Zero changeover at every station.** Athlete *k* works station *n* in `[k·180 + (n-1)·210, +180)`. Athlete *k+1* starts station *n* at exactly that end second. | No time to reset rower / sled / hand over; judge must finalize S04/S07 technique + S09 OCR while the next athlete is already working. Station-screen "TIME 00:30" state overlaps the next athlete's WORK. | (a) Keep 3:00 — needs 2 rowers + technique judge at S04/S07. (b) **3:30 start interval** → exactly 30s idle per station, screen states work as specified. Interval will be configurable either way. |
| D2 | Heats vs continuous starts. | Is there a gap between heats? Is "START EVENT" once per day or per heat? Is start order by check-in time *within* a heat or globally? | Recommend: one continuous queue per event, heat = start block; order by check-in within heat; configurable gap between heats. |
| D3 | Skip behaviour. | When Master skips, does the slot burn (station 01 idle 3:00) or does the next checked-in athlete take it? | Recommend: slot burns (spec: "do not move existing athletes"). |
| D4 | Tie inside a single station ranking. | Two athletes with 37 reps. | Recommend standard competition ranking (1, 2, 2, 4). |
| D5 | Ranking of MISSED_START / unfinished athletes. | Affects placement points for everyone. | Recommend: excluded from station ranking, overall = DNS. Or last+1 per station. |
| D6 | Offline judge + "server timestamp decides". | A rep tapped at 2:59 offline, synced at 3:05, would be rejected. | Recommend: accept if the **offset-corrected device time** is inside the window AND the device had synced its clock within N seconds; flag as `late_synced` for Master review. Otherwise strict rejection. |
| D7 | Judge mis-taps. | No undo in spec. | Recommend `VOID` event (references a prior event, allowed only before lock, audited). |
| D8 | Squat breaks. | "Max 2 breaks" reads as Masters wall-hold only. | Confirm Men/Women rep squat has no break rule. |
| D9 | S07 barrier. | Not finalized. | Stored as configurable rule text + flag; no mechanics coded. |
| D10 | Venue internet is a single point of failure (Supabase is cloud). | Whole race stops if the uplink drops. | Dedicated 4G/5G failover router + judge offline outbox; engine keeps correct time because it's anchor-based. |

---

## 14. Recommended architecture for THE NINTH

### 14.1 Placement in the monorepo
- `packages/race` — new bounded context (`domain/`, `application/`, `infrastructure/`), same conventions as `reception`.
- `apps/web/app/race/*` — all race UIs in the existing web app (shared auth, client, CI, deploy). Separate layout, theme, and guard.
- Optional later: `race.9throundegypt.com` domain alias on the same Vercel project.

### 14.2 Authority model
```
            ┌──────────────────────────── Postgres (authoritative) ───────────────────────────┐
            │  race_events.started_at, race_pauses  → race clock                              │
            │  RPCs validate role + window using clock_timestamp()  → accept / reject          │
            │  race_performance_events (append-only, idempotent by client_event_id)           │
            └─────────────┬───────────────────────────────┬───────────────────────────────────┘
                 Realtime (broadcast + postgres_changes)   │ RPC writes
      ┌─────────────┬─────────────┬───────────────┬────────┴────────┐
   Master Ctrl   Judge (PWA)   Station screens  Reception      Public results
   (display +    (writes via   (display only)   (check-in RPC)
    commands)     outbox)
```
Clients **never** decide time. They receive anchors and render.

### 14.3 Race clock (the core idea)
- **Race time** `R(t) = (t − started_at) − Σ completed pauses − (t − current_pause_start if paused)`.
- Everything is scheduled in **race time**, not wall time:
  `slot_start(k) = k × start_interval` · `station_start(k, n) = slot_start(k) + (n−1) × (work + transition)` · `station_end = station_start + work`.
- Pause freezes `R` → every clock (event, athlete, station, transition, next-start countdown) freezes automatically, with zero special-casing.
- **Lock check in SQL:** a performance event is accepted only if `R(clock_timestamp()) < station_end` and the event isn't paused. No grace period.
- **No ticking server needed:** `race_advance(event_id)` is an idempotent RPC that materializes due transitions (bind next athlete to slot at announce time, open/lock station windows, write audit rows). Called by Master Control every second, by any judge/screen fetch, and by a pg_cron backup — timing correctness never depends on who calls it or when.
- **Client clocks:** `race_server_time()` sampled 5–8 times, lowest-RTT sample gives offset; displays render `R` from anchors + offset. Re-sync every 60s and on reconnect.

### 14.4 Scoring
- Station rule evaluators in `packages/race/domain` (pure functions): reps, knee conversion (÷3, floor, remainder), carry laps with penalty = cancel last lap (floor 0), squat hold accumulation with break limit, rowing distance.
- `official_result = reduce(performance_events)` → reconstructable at any time; the stored `race_station_results` row is a cache with a `version`.
- Ranking per station per category across all heats → placement points → overall with tie-break S04 tech → S07 tech → sum → retain tie. Snapshotted in `race_rankings` with `computed_at` + `version`.

### 14.5 Realtime
- `postgres_changes` on `race_live_state` (one row per event: status, anchors, current slot) and `race_station_results` (filtered by station).
- **Broadcast** channel per event for commands/announcements (`announce`, `pause`, `resume`, `skip`) — low latency.
- **Presence** for judge + screen connection monitoring on Master Control.
- Private channels with Realtime Authorization (RLS on `realtime.messages`) so a station screen only receives its station.

### 14.6 Offline judge
- IndexedDB outbox, each tap = `client_event_id` (UUID v4) + offset-corrected device time.
- `race_performance_events.client_event_id` **UNIQUE** → replay is idempotent; duplicates are impossible.
- UI states: `ONLINE / OFFLINE / SYNCING / SYNCED` + pending count.

### 14.7 Voice
- Runs on the Master Control machine (venue audio), triggered at `slot_start − announce_lead` in race time. Web Speech API (en/ar) with pre-rendered fallback; `10…1 GO!` countdown rendered from the same anchor on every screen → synchronized by construction, not by messaging.

### 14.8 OCR
- Judge captures photo → Storage `race-evidence/{event}/{result}/{n}.jpg` (original kept, never overwritten) → route handler calls vision model → proposed meters → judge **CONFIRM** or **RETAKE**. Retakes chain via `retake_of`. Confirmation is a performance event.

---

## 15. Proposed database schema (for review — not yet written)

All tables `race_`-prefixed, UUID PKs, `created_at`, RLS on. Enums shown inline.

**Configuration**
- `race_events` — id, branch_id → branches, slug, name, event_date, venue, timezone, status `draft|registration_open|registration_closed|heats_locked|live|finished|archived`, start_interval_s (180), work_s (180), transition_s (30), announce_lead_s (10), heat_size (9), heats_locked_at/by, started_at/by, finished_at, config jsonb, version.
- `race_categories` — id, event_id, code `MEN|WOMEN|MASTERS`, name, gender, min_age, sort_order.
- `race_stations` — id, event_id, number 1–9, code, name, scoring_type `reps|hold_ms|laps|distance_m|converted_reps`, higher_is_better, has_technique, requires_ocr.
- `race_station_rules` — id, station_id, category_id, equipment jsonb (load_kg, height_cm, damper, etc.), rule jsonb (max_breaks, knee_ratio, penalty_mode, barrier_rule_text…), version. Unique (station_id, category_id).

**People & registration**
- `race_athletes` — id, profile_id? → profiles, member_id? → members, full_name, phone, email, gender, date_of_birth, emergency_contact jsonb.
- `race_registrations` — id, event_id, athlete_id, category_id, race_number (`N027`, unique per event), status `pending_payment|confirmed|cancelled|refunded`, pushup_style_default, waiver_accepted_at, heat_id?.
- `race_payments` — id, registration_id, amount, currency, method, provider, provider_ref, status, paid_at, recorded_by.
- `race_staff` — id, event_id, profile_id, race_role `reception|judge|master_control|event_manager|station_screen`, station_id?, active, assigned_by. Unique (event_id, profile_id, race_role, station_id).
- `race_judge_applications` — id, event_id, full_name, phone, email, experience, preferred_stations int[], status `submitted|approved|rejected`, reviewed_by/at.

**Heats & queue**
- `race_heats` — id, event_id, number, status `draft|locked|running|finished`, locked_at/by.
- `race_check_ins` — id, registration_id UNIQUE, checked_in_at (server), checked_in_by, kind `on_time|late`, tie_group_id?, tie_draw_position?, draw_seed?.
- `race_start_slots` — id, event_id, slot_index, heat_id, registration_id? UNIQUE, status `open|bound|announced|started|skipped|empty`, bound_at, skipped_by/at, skip_reason. Unique (event_id, slot_index).

**Race execution**
- `race_sessions` — id, registration_id UNIQUE, start_slot_id, status `queued|running|finished|missed_start|dnf|dq`, pushup_style (locked at start), started_race_ms, finished_race_ms.
- `race_station_results` — id, session_id, station_id, window_start_ms / window_end_ms (race time), judge_profile_id, status `pending|active|locked|corrected`, official_score numeric, raw jsonb (knee_raw, remainder, completed_laps, penalties, cancelled_laps, hold_ms, breaks_used, valid, no_reps), technique_score, locked_at, version. Unique (session_id, station_id).
- `race_performance_events` — **append-only** — id, station_result_id, type `REP|NO_REP|LAP|START_HOLD|BREAK|RESUME|PENALTY|TECHNIQUE_SCORE|OCR_CAPTURE|OCR_CONFIRM|VOID`, value numeric, payload jsonb, voids_event_id?, client_event_id UNIQUE, device_recorded_at, server_received_at (clock_timestamp), race_ms, judge_profile_id, device_id, accepted bool, rejection_reason, late_synced bool.
- `race_technique_evaluations` — id, station_result_id, judge_profile_id, score 0–10, recorded_at (also mirrored as event).
- `race_ocr_records` — id, station_result_id, storage_path, provider, raw_response jsonb, proposed_m, confidence, confirmed_m, status `captured|confirmed|retaken`, retake_of?, confirmed_by/at.
- `race_pauses` — id, event_id, paused_at, paused_by, reason, resumed_at, resumed_by.
- `race_live_state` — event_id PK, status, started_at, paused_at, paused_total_ms, current_slot_index, updated_at (realtime fan-out row).

**Results & governance**
- `race_result_corrections` — id, station_result_id, field, old_value jsonb, new_value jsonb, reason (required), corrected_by, corrected_at.
- `race_rankings` — id, event_id, category_id, registration_id, station_placements jsonb, total_points, tb_s04, tb_s07, tb_sum, overall_rank, is_official, version, computed_at.
- `race_devices` — id, event_id, profile_id, kind `judge|station_screen|master|reception`, station_id?, label, pairing_code_hash, last_seen_at, revoked_at.
- Audit → existing `admin_audit_log` via `log_audit_event()`, `target_table = 'race_*'`; read policy extended with `has_permission('race.audit.view')`.

**Key RPCs:** `race_server_time`, `race_check_in`, `race_late_check_in`, `race_lock_heats`, `race_start_event`, `race_pause`, `race_resume`, `race_skip_athlete`, `race_advance`, `race_record_event`, `race_confirm_ocr`, `race_correct_result`, `race_compute_rankings`.

## 16. Proposed page / route structure

```
/race                                   role-aware hub
PUBLIC
/race/e/[slug]                          event page
/race/e/[slug]/register                 registration + payment
/race/e/[slug]/me                       athlete: race number, category, heat, instructions (magic link)
/race/e/[slug]/judges/apply             judge application
/race/e/[slug]/results                  live + final leaderboard
OPERATIONS
/race/reception                         search (race # / name / phone), check-in, queue view
/race/control                           Master Control — 16:9 live dashboard
/race/judge                             Judge PWA — portrait, assigned station only
/race/screen/[station]                  Station screen — 9:16, display only
/race/screen/main                       Venue big screen (next athlete, countdown, leaderboard)
ADMIN
/race/admin/events  /race/admin/[eventId]/{settings,athletes,registrations,heats,judges,screens,results,rankings,corrections,audit}
API
/api/race/ocr  /api/race/devices/pair  /api/race/staff/*  /api/race/payments/webhook
```

## 17. Proposed role / permission structure

| Race role | How granted | Scope |
|---|---|---|
| Athlete | Registration (magic-link / OTP to phone or email) | Own registration only |
| Reception | `race_staff.race_role = reception` | Search, check-in. No write to start order (RPC-computed). |
| Judge | `race_staff` with `station_id` | Only `race_record_event` on own station's active result; no clock RPCs; RLS hides other stations. |
| Master Control | `race_staff` | start / pause / resume / skip / advance / correct (with reason) |
| Event Manager | `race_staff` (+ `branch_manager` default) | Event config, athletes, heats, judges, results |
| Super Admin | existing `super_admin` | Everything, incl. post-lock heat changes |
| Station Screen | device account in `race_staff`, paired by code | Read-only, own station channel |

Permission keys added to the existing catalog: `race.events.manage`, `race.registrations.manage`, `race.heats.manage`, `race.heats.override_lock`, `race.checkin`, `race.control.start`, `race.control.pause`, `race.control.skip`, `race.results.correct`, `race.judges.manage`, `race.audit.view`.
Enforcement: SQL helper `has_race_role(event_id, role[, station_id])` inside every RPC + RLS; UI guards are convenience only (same principle as the existing reception layout).

## 18. Proposed implementation phases

| Phase | Scope | Exit criteria |
|---|---|---|
| 1 | ✅ This report | Approval + answers to D1–D10, C8 |
| 2 | Final schema doc + SQL migrations (review before apply) | Migration applies clean on local Supabase; RLS tests |
| 3 | Event / Category / Station / Rules / Heat + admin pages + race theme | Seeded "THE NINTH" event with 9 stations × 3 categories |
| 4 | Athlete / Registration / Race number / Payment (provider per C8) | Register → race number `N###` → confirmation page |
| 5 | Check-in + queue + start-slot engine + tie random draw + late check-in | Unit tests on queue ordering; audited draws |
| 6 | Master race engine (race clock, advance, pause/resume, skip) + **simulator** | Simulated 50-athlete race at 60× speed with pauses matches expected timeline to the ms |
| 7 | Judge PWA + offline outbox + idempotent sync | Airplane-mode test: zero duplicates, lock enforced |
| 8 | Station screens + venue screen + voice + presence | All screens + voice in sync (< 250 ms visual drift) |
| 9 | Results + ranking + tie-breaks + public leaderboard | Ranking fixtures incl. all tie-break branches |
| 10 | Audit views + authorized corrections | Every correction shows old/new/reason/user/time |
| 11 | OCR rowing workflow | Photo retained, confirm/retake chain |
| 12 | Full race dress rehearsal (simulator + real devices) | Rehearsal sign-off checklist |

**Recommendation:** build the domain timeline/scoring library with tests in Phase 3 (it has no UI dependency) so Phases 5–9 plug into a proven core.
