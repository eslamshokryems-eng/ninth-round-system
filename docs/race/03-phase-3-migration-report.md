# THE NINTH — Phase 3 Migration & Test Report

**Status:** Phase 3 complete. **All tests pass.** No race-engine behaviour (check-in, START EVENT, judging, scoring) was built. That starts in Phase 4/5 after sign-off.

Reproduce: `supabase/tests/race/run.sh` (see [supabase/tests/race/README.md](../../supabase/tests/race/README.md)).

## What was delivered

| File | Contents |
|---|---|
| `supabase/migrations/20260928000001_race_config.sql` | 21 enums; rulebook template tables; `race_events`, `race_categories`, `race_stations`, `race_station_rules`; timing constraints |
| `supabase/migrations/20260928000002_race_people_heats.sql` | athletes, heats, registrations, manual payments (Paymob-ready), payment event ledger, race staff, judge applications, devices |
| `supabase/migrations/20260928000003_race_day_ledger.sql` | race clock, pauses, tie draws, check-ins, start slots, station results, judge action ledger, reviews, OCR evidence, corrections, ranking snapshots; append-only / no-delete / server-time triggers |
| `supabase/migrations/20260928000004_race_access.sql` | role helpers, timing functions, guard triggers, audit wiring, column-level grants, RLS policies, foundation RPCs, `race.events.create` permission |
| `supabase/migrations/20260928000005_race_seed.sql` | 3 categories, 9 stations, 27 station × category rules |
| `supabase/rollback/20260928_race_phase3_down.sql` | manual emergency rollback (outside the migrations folder: single migration system kept) |
| `supabase/tests/race/*` | test harness, Supabase shim, fixtures, 9 test suites |

26 tables · 21 enums · all objects `race_*` · RLS on every table from the moment it is created.

## Results

| # | Area | Result |
|---|---|---|
| 1 | Migration success | ✅ 46 existing + 5 race migrations apply cleanly in CLI order; 11 structural assertions |
| 2 | Rollback safety | ✅ Rollback with live race data restores the exact pre-race fingerprint (1,611 objects); zero `race_*` relations remain; migrations re-apply cleanly afterwards |
| 3 | RLS / security | ✅ 43 assertions (anon, no-role user, athlete self-service, manager column limits, cross-event isolation, deactivated staff) |
| 4 | Race-role permissions | ✅ 42 assertions (Reception, Judge, Station Screen, Master Control, Event Manager, Super Admin; escalation guard; heat lock) |
| 5 | Append-only protection | ✅ 73 assertions: UPDATE/DELETE/TRUNCATE refused on 7 ledgers **as table owner and as service_role**; pauses, OCR, no-delete tables; idempotency |
| 6 | Timing constraints | ✅ 33 assertions; SQL schedule matches the JS validator row-for-row (50 athletes × 11 values) |
| 7 | Heat-gap constraints | ✅ 25 assertions (gap ≥ 3:30, F-1 formula, overflow capacity, 7:00 boundary changeover, roster capacity) |
| 8 | Seed data | ✅ 29 assertions: every weight/height/damper/rule vs the rulebook; exact copy into events |
| 9 | Gym regression | ✅ Catalog fingerprint: all 1,611 existing objects unchanged. 17 end-to-end gym-flow assertions. Repo CI gates: lint ✅ · typecheck 14/14 ✅ · 182 existing Vitest tests ✅ |

**Total: 274 suite assertions + 4 harness checks, 0 failures.**

### Only touches on existing objects (all additive)
- `admin_audit_log`: one new SELECT policy, *race event managers read race audit entries* (scoped to `race_*` rows of events they manage). The table stays append-only for every client.
- `permissions`: row `race.events.create`. `role_permissions`: `branch_manager → race.events.create`.

## Findings

### Fixed during Phase 3 (race code)
1. **NULL-guard bypass.** The existing helpers `is_super_admin()` / `has_permission()` return NULL (not false) for anonymous or deactivated callers. `IF NOT (NULL …)` skips the guard. The first test run caught `race_create_event` succeeding for an anonymous caller. Fixed at the root: strict wrappers `race_is_super_admin()` / `race_has_permission()`, and every RPC guard written `IS NOT TRUE`. Covered by 7 regression tests (anon + deactivated manager).
2. **CI lint.** `docs/race/timing-validation.mjs` (pushed in the previous round) failed the repo ESLint gate. Moved to `docs/race/scripts/`, per the repo's existing `**/scripts/**/*.mjs` convention. `pnpm lint` is clean.

### ⚠️ Pre-existing gym-system vulnerability (NOT fixed — out of scope, needs approval)
The same NULL-guard pattern exists in four existing SECURITY DEFINER functions:
`set_role_permission`, `set_user_permission_override`, `clear_user_permission_override` (20260815000002) and `prepare_staff_deletion` (20260821000002).

Verified on the local harness (rolled back): **as `anon`, `set_role_permission('reception', 'audit_logs.view', true)` succeeds.** Anyone with the public anon key, or any deactivated staff account, can rewrite the permission matrix. `delete_receipt` has the same pattern but is SECURITY INVOKER, so RLS still blocks it.

Fix: one line per function (`if public.is_super_admin() is not true then`) in a new migration, with tests. Not applied, because Phase 3 rules forbid modifying existing gym functionality.

## Implementation notes vs the approved schema
- **Seed as templates.** `race_category_templates` / `race_station_templates` / `race_station_rule_templates` hold the rulebook. `race_create_event()` copies them into each event and refuses unless the copy is exactly 3 / 9 / 27.
- **`race_action_status`** is `ACCEPTED | REJECTED | PENDING_MASTER_REVIEW` only. The ledger row never changes; the Master decision lives in `race_action_reviews` (the effective status, as specified in §9).
- **No `race_official` value was added to the existing `user_role` enum** (that would modify an existing type). External judges/screens get `profiles.role = member`, which carries zero gym privileges. All race authority comes from `race_staff`. Tested: an external judge sees no gym data, and a coach with a race role gains no gym permissions.
- **Denormalised `event_id` / `station_id`** on ledger tables, with composite foreign keys. The database guarantees an action, result, slot, judge and category always belong to the same event and station.
- **Guard triggers are SECURITY INVOKER** and use `current_user`. A direct API write is `authenticated`; an authorised RPC runs as the owner. So "direct edit after lock" is refused, while the same change through `race_move_athlete_heat()` (reason required, audited) is allowed.
- **Server time:** every "server saw it" column is overwritten with `clock_timestamp()` on insert, even for privileged writers (tested with a forged year-2000 value).

## Recommended before Phase 4
1. Approve the gym NULL-guard fix above (queued as a separate task).
2. Optionally add `supabase/tests/race/run.sh` as a CI job. GitHub's Ubuntu runners ship PostgreSQL. Not added yet, because it changes CI for the whole repo.
3. Generate `packages/database-types` for the race tables when a local Supabase is linked (`pnpm db:types`). Phase 4 is the first phase with TypeScript consumers.
