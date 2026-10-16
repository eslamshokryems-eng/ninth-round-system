# 17 — THE NINTH League (8-week cumulative-points season)

Status: **implemented in code and tested locally; NOT activated.** The database migration is a *proposal* kept outside `supabase/migrations`; nothing has been applied to any
Supabase project, nothing deployed, no real data written. The race engine is untouched.

## Approved vs provisional
| | |
|---|---|
| **Approved** | all eligible gym members; one main challenge per week; 8-week season; cumulative points decide the standings; TV display + responsive phone page; race engine stays independent; no migration / deployment without approval |
| **Provisional (configurable, never hard-wired)** | points per rank (development default `25,20,16,13,11,10,9,8,7,6,5,4,3,2,1`, `beyond 1`, participation floor `1`, absent `0`); tie handling (`SHARE`: tied results all get the points of the shared rank, next rank skipped; `SPLIT`: they share the average of the places they occupy); eligibility timing (`AT_REGISTRATION` / `ENTIRE_SEASON` = no late joiners); attempts per challenge (per-challenge, default 1) and which attempt counts (`BEST` / `LATEST` / `FIRST_APPROVED`, per challenge); absence (`ZERO` / `PARTICIPATION`); corrections (administrator only, mandatory reason, until the season is completed, all audited) |
| **Not modelled (undecided)** | appeals; injury / disqualification as distinct states (an administrator can void an attempt or mark a participant ineligible/inactive, with a reason) |

Season standings tie rule (provisional): equal totals **share a rank** (1, 2, 2, 4). Display order inside a shared rank is *only* presentation: first places, then name.

## Architecture and the boundary with the race engine
```
packages/league            pure TypeScript, no dependency on @9thround/race or on any SDK
  domain/                  types · validation · scoring (rank, points, ledger reconciliation) · standings · public projection · CSV import · gateway interface
  infrastructure/          SupabaseLeague (RPC wrapper) · InMemoryLeague (same rules, for dev + tests) · synthetic demo fixtures
apps/race/app/race/league  /race/league (phone) · /tv · /p/<publicId> · /admin · /admin/<seasonId>
supabase-race/proposed/league/20261101000001_race_league.sql    6 tables + 35 functions, all race_league_*
```
* **No coupling to the race engine.** The league reads/writes no `race_events`, `race_clock`, `race_station_*`, `race_slots` or race result. A weekly *league challenge* is a different concept from an official THE NINTH *race*. If a future challenge should import a race result, the intended seam is a new, documented adapter — not a join into engine tables.
* **Separate from the gym system.** Members are linked only through an optional opaque `external_ref` (text, private, never public); no cross-database foreign key, no gym credential. For development: synthetic "Demo Athlete NN".
* **One source of truth.** Points live only in an **append-only ledger** (`race_league_points_ledger`); standings are derived from it. A close, a correction or a rule change appends only the *difference* (so a retry adds nothing and nothing is rewritten). `race_league_apply_scores()` is the single scoring path.
* **Authority is the database.** Every table has RLS enabled and **no client privilege at all**; every read/write is a `SECURITY DEFINER` function that re-checks the caller (season staff role or Super Admin). The browser never sends a rank, points, status or approver.
* **Public reads are an allow-list.** `race_league_public_season / _challenge_results / _participant` answer only for a **published** season and return only: public id, display name, rank, points, weekly points, challenges completed, movement, gap, season/challenge descriptors. No UUID, no member reference, no staff identity, no rule table. An unpublished or missing season returns the same `{available:false}` (no enumeration).

## Roles
`LEAGUE_ADMIN` (season setup, challenges, participants, rules, corrections, publishing, audit) · `JUDGE` (record attempts) · `REVIEWER` (approve/reject). Super Admin has all. Nobody approves a result they recorded (`LEAGUE_SELF_REVIEW`) — not even an administrator. A challenge with `requires_verification = false` counts a recorded attempt at once.

## Lifecycle
Season `draft → scheduled → active → completed` (never reopens; only its published flag can still change). Challenge `draft → published → open → closed` (closed never reopens; closing is refused while attempts are pending; closing awards points once). Exactly 8 weeks (`ends_on − starts_on = 55`, `weeks = 8`).

## Routes (local)
| Route | What |
|---|---|
| `/race/league[?season=<slug>]` | phone page: standings, search, week-by-week challenges + results, season progress |
| `/race/league/p/<publicId>` | one athlete |
| `/race/league/tv[?season=…&interval=15&rotate=off&mode=podium&motion=reduced]` | TV: standings → week results → podium → progress, QR to the phone page, last-updated, offline bar, reduced motion; **read-only** (no input, button or link) |
| `/race/league/admin`, `/admin/<seasonId>` | staff: season, challenges, participants (+CSV), attempts (record / review / correct), points rules, standings, audit |

Local test: `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=anon pnpm --filter ./apps/race dev` (uses **synthetic fixtures** — "Demo Athlete NN" — with a banner on every screen; the admin hub lets you *act as* admin / judge / reviewer / outsider / anonymous).
**A production build can never use the fixtures** (`chooseLeagueSource`: `NODE_ENV === "production"` ⇒ database, whatever any variable says); with the migration not applied the pages show "not published" / "could not load", never demo data.

## Environment variables (names only)
`NEXT_PUBLIC_LEAGUE_SEASON` (public address of the default season), `NEXT_PUBLIC_LEAGUE_SOURCE=database` (dev only). No secret is involved; the existing `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are reused.

## Tests (what exists)
* `packages/league` — 94 vitest tests: validation, ranking (time / reps / distance / load / numeric), points, SHARE/SPLIT ties, absence, counting policies, ledger reconciliation (exactly-once, corrections, reversals), standings, public allow-list, CSV import (formulas, duplicates, binary, size), authorization, self-review, idempotency, attempt limits, lifecycle, completed-season lock, source policy; **24 TS/SQL scoring parity cases** (`domain/parity-cases.json`).
* `supabase-race/tests/harness/league/` (own throw-away database, step 5e of `run.sh`; apply the PROPOSED file): `32_league` (lock-down, authorization, lifecycle, attempts, review, scoring, corrections, completed lock, audit), `33_league_parity` (SQL = TS on every shared case), `34_league_public` (anon allow-list, no UUID/ref leak, unpublished = missing, cross-season, injection, direct table access denied), `35` + shell: parallel-session checks (one request id ×10 → 1 attempt; 8 attempts vs limit 2 → 2; 6 simultaneous closes → points once; 6 recomputes → nothing added).
* `apps/race/scripts/league-e2e.mjs` — 26 browser checks on a dev server (phone, TV at 1920×1080, admin roles) + 6 on a production build with Supabase mocked (fixtures unreachable).

## Security limitations (known)
* Public pages poll (15–20 s); there is no CDN cache or rate limit in front of the three public RPCs yet (each is a bounded read: ≤1000 rows). Add edge caching / throttling before large public traffic.
* A participant's public id is random but, once a phone link is shared, it is a capability to see *that athlete's public page* (public data only).
* The in-memory adapter is a development/test mirror, not an authority; its rules are checked against the SQL by the shared parity file for scoring only — other rules are asserted in both suites separately.
* `display_name` is public by design: choose "First L." names (the import reduces `full_name` accordingly).
* Member import is by CSV validated server-side; the secure synchronisation with the gym system is **not built** (needs an approved integration boundary).
* Staff accounts: league roles are granted by an administrator (`race_league_set_staff`); there is no screen for it yet.

## Activation (later, only after explicit approval)
1. Approve the exact migration (below). 2. `git mv supabase-race/proposed/league/20261101000001_race_league.sql supabase-race/supabase/migrations/`.
3. Update the pinned counts in the same commit: `ops/staging_setup.sh` `EXPECTED_LOCAL` 20 → 21; `ops/staging_checks.sql` tables 35 → **41**, race functions 147 → **182**, triggers 66 → **78** (policies 49 and enums 23 unchanged); `verify/verify_deployment.sql` table count; harness `01_structure.sql` (tables 41, append-only 9) and make `tests/harness/league.sh` skip the "proposed" step. 4. Run the full harness (PG 16 and 17.11). 5. Apply to **staging** with `staging_setup.sh` (it lists the pending migration and asks for confirmation). 6. Grant league roles, create the season, import participants, check `/race/league` is *not published*, publish, set `NEXT_PUBLIC_LEAGUE_SEASON`, then deploy.

## Decisions still needed
Final points table · tie handling (SHARE vs SPLIT) and any further tie-break · eligibility timing · attempts per challenge and which attempt counts · absence points · correction window / who may correct · appeals · how members will be synchronised from the gym system · whether a league challenge may ever consume an official race result · who the first league administrators are.
