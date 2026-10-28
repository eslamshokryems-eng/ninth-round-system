# THE NINTH League — station layouts (weekly workouts with their own stations and exercises)

Status: **implemented locally, NOT applied anywhere.** The League migration is still only a proposal (`supabase-race/proposed/league/`), the League public gate is closed, and no
remote system was touched. This document describes what exists, how it stays independent of the race, what is verified, and how to rehearse it.

## What it adds

A weekly League challenge may optionally have its **own workout layout**: an ordered list of 1–20 *League stations*, each with 1–5 exercises (movement standard, equipment,
target) and one typed result. A judge records **one value per station**; the database validates each value, adds them up, and records the total as the attempt's value through the
**existing** attempt path. Review, correction, audit, points, ties and standings are the existing League ones, unchanged.

| Capability | Where |
|---|---|
| Layout configuration, immutable versions, substitution with reason + audit | `race_league_set_layout`, `race_league_get_layout` |
| Per-station judging, idempotent, stale-screen protection | `race_league_record_station_attempt` |
| Per-station correction (administrators), void unchanged | `race_league_correct_station_attempt` |
| Reviewer's breakdown | `race_league_station_breakdown` |
| Pure rules (TypeScript twin of the SQL validators) | `packages/league/domain/layout.ts` |
| Shared TS/SQL cases | `packages/league/domain/layout-cases.json` |
| Screens | `apps/race/src/components/league/station-layout.tsx`, wired into the League admin page |

Supported result types are the ones that can be validated and ranked unambiguously **as a sum**: `REPS`, `TIME`, `DISTANCE`, and `COMPLETION` (done = 1, not done = 0; the challenge
ranks the number of stations completed, as `NUMERIC/count`). All stations of one layout share one type, and it must match the challenge metric. `LOAD` (is the total or the heaviest lift
the result?) and mixed types (a composite score) are **refused**, not guessed.

## Independence from the race

* A League station is a row of `race_league_layout_stations` with its own id. The four new tables reference only League tables and the shared profile directory. **No foreign key,
  function or view touches `race_stations`, `race_events`, `race_clock`, `race_station_results`, `race_start_slots` or any race timing/scoring object** (asserted by suite 40 against the catalog
  and the function bodies, and by a static scan in `league-stations.test.ts`).
* The race keeps its nine stations. A League layout has any number from 1 to 20. Editing a League exercise cannot edit a race exercise: there is no path from one to the other.
* No second race clock and no second engine: the League has no clock. The "time" of a station result is the value the judge enters, as before.
* Race fingerprint test: a real race event (nine race stations, clock row) is created first; after the whole League scenario the stations, events, results, slots and clocks hash identically.

## What is reused (not duplicated)

* **Athletes**: `race_league_participants` (synthetic participants or the validated CSV only; no gym database). The new tables store no person (asserted: no name, e-mail, identity key or participant column).
* **Judges / administrators / reviewers**: `race_league_staff` roles resolved from `auth.uid()` / `race_profiles` by the existing `race_league_has_role` / `race_league_require_admin`. Nothing here grants a role.
* **Result submission**: `race_league_record_attempt` (called inside the station function), so idempotency by request id, eligibility, attempt limits, challenge-open checks and the pending → approved review stay exactly as they were.
* **Audit**: the existing race audit log, with `league.layout.create`, `league.layout.substitute`, `league.attempt.stations`, `league.attempt.stations.correct`.
* **Standings**: untouched. They consume attempt values; a station attempt's value is its validated sum.

## Versioning and history

* A layout is an **immutable version** (append-only tables, update/delete/truncate refused even for the owner). Changing an exercise creates a new version with a mandatory reason; the audit entry records which
  exercises were replaced by which.
* An attempt keeps the layout version it was recorded under (`race_league_station_results.layout_id`). A correction is validated against **that** version and its replacement stays under it.
* After the first attempt the **structure is frozen** (number of stations, result type, per-station cap) so every attempt of the challenge stays comparable; only exercise content can be substituted.
  A layout can only be introduced **before the first attempt** (a table lock closes the race between the first layout and a concurrent attempt).
* A challenge's metric and unit are fixed once it has a layout. A closed challenge and a completed season cannot change their layout.

## Security

* Every mutation is a `SECURITY DEFINER` function with a pinned `search_path` that re-checks the caller: set / correct = league administrator of **that** season; record = judge or administrator; read layout / breakdown = staff.
  The four tables have RLS on, no policy and no client privilege; `anon` can execute none of the new functions; the validators and the deferred check are executable by no client role.
* A **deferred constraint trigger** makes the consistency a database rule, not a habit: at commit, an attempt of a challenge that has a layout must have exactly one value per station, of one version of *its* layout, summing to the attempt
  value. So the generic single-value record / correct / apply-request paths **fail closed** on a station challenge instead of leaving a total no station explains. (A **void** creates no replacement and stays allowed.)
* Public pages are unchanged and carry no exercise, station, standard or equipment data (asserted in SQL and TypeScript). The public gate, rate limiter and cache are not touched.
* The intended administrator accounts are **not** granted anything by this work.

## Tests (all local, synthetic data)

| Layer | What | Result when last run |
|---|---|---|
| SQL, `tests/harness/league/40_league_stations.sql` | authorization, validation, versions, substitution, judging, review, ties, corrections, void, immutability, independence, privacy | part of the league harness |
| SQL, `41_league_layout_parity.sql` | the same 102 cases as TypeScript (67 layout cases, 35 station-total cases): same verdict, normalized layout / total and message | part of the league harness |
| SQL + shell, `42_…setup.sql`, `league.sh` | 10 identical requests at once, 8 submissions vs a limit of 2, 6 simultaneous substitutions, first layout racing attempts, stations rollback rehearsal | part of the league harness |
| TypeScript, `layout.test.ts`, `league-stations.test.ts` | the pure rules, the shared cases, gateway behaviour, independence scan, public no-leak | `pnpm --filter @9thround/league test` |
| Browser, `apps/race/scripts/league-e2e.mjs` | editor, substitution, judge form, breakdown (fixtures) | manual script |

Commands: `ONLY_LEAGUE=1 PGBIN=<pg bin> EXPECT_PG_VERSION=<x.y> RACE_TEST_PGPORT=<port> bash supabase-race/tests/harness/run.sh` (league only), the same without `ONLY_LEAGUE` (full harness, includes the timing-sensitive final simulation:
run it alone), `pnpm --filter @9thround/league test`, `pnpm exec turbo run typecheck test`.

## Proposed migration and rollback

* `supabase-race/proposed/league/20261101000002_race_league_stations.sql` — additive; apply **after** `…000001_race_league.sql`. Not in `supabase/migrations/`, so `supabase db push` and `staging_setup.sh` never see it.
* `…000002_race_league_stations.rollback.sql` — removes only the station-layout objects; the base league keeps working. **Data loss**: every layout version, exercise and per-station breakdown (attempt totals remain).
  Rehearsed in `league.sh`: base → stations → stations rollback restores the exact base object counts → applies again identically. The base rollback still drops everything `race_league_*`.
* If the stations migration is not applied, the screens detect the missing functions and fall back to the ordinary single-value form (the editor says layouts are unavailable).

## Blocked / not done

* Nothing is applied: persistence for the whole League (including layouts) is blocked by the unapplied base migration and the closed gate.
* Participants do not see exercises or standards on public pages (deliberately not exposed; would need an allow-list change, parity cases and a gate review).
* A judge's *request* for a correction on a station attempt proposes a bare total; if an administrator applies it, the database refuses it at commit. Administrators use the per-station correction; the screen hides the single-number request for station attempts.
* Season lifecycle stays `draft → scheduled → active → completed` (no `archived`); the eight-week season rule of the base migration is unchanged.
* OCR/evidence, rowing and the race judge screens are not involved and not changed.

## Manual rehearsal (local only; nothing remote)

1. `ONLY_LEAGUE=1 … run.sh` on PostgreSQL 16 and 17: expect all league assertions, the four concurrency lines and the rollback lines to pass.
2. `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=anon pnpm --filter @9thround/race-web exec next dev -p 3101`, then
   `NODE_PATH=$(npm root -g) node apps/race/scripts/league-e2e.mjs`; open `/race/league/admin`, choose "as admin", Challenges → week 7 (synthetic layout), edit, Attempts → record station results.
3. Staging rehearsal (**needs separate approval**; do not do it from this repository state): apply the base migration, then the stations migration, to a throw-away staging project only; keep the public gate closed.
