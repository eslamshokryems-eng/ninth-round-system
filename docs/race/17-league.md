# 17 — THE NINTH League (8-week cumulative-points season)

Status: **implemented in code and tested locally; NOT activated.** The database migration is a *proposal* kept outside `supabase/migrations`; nothing has been applied to any
Supabase project, nothing deployed, no real data written. The race engine is untouched.

## Approved vs provisional
| | |
|---|---|
| **Approved** | all eligible gym members; one main challenge per week; 8-week season; cumulative points decide the standings; TV display + responsive phone page; race engine stays independent; no migration / deployment without approval |
| **Provisional — owner-supplied, for implementation and local testing, NOT final** (each is configurable and changeable with a reason + audit entry; none is hard-wired) | see the table below |
| **Not modelled** | injury as a distinct state (an administrator can void an attempt, mark a participant inactive, or record a documented eligibility decision, each with a reason); participant self-service appeals (see "Conflict with the architecture") |

| # | Rule | Implementation |
|---|---|---|
| 1 | Points | 1st 100, 2nd 90, 3rd 80, 4th 75, 5th 70, 6th 65, 7th 60, 8th 55, 9th 50, every other eligible participant with an approved valid result 40. Stored per season (`rules.points`), editable by a league administrator with a reason; closed challenges are re-scored by *appending* the difference |
| 2 | Ties | equal performance ⇒ same rank and same points (`SHARE`), competition ranking 1, 2, 2, 4 (the participant after a tie of two is 4th and earns 4th-place points). Equal **season totals** share a rank and carry `tied: true` (shown as "T2"); no final tie-break is invented, also after week 8 and after the season is completed. `SPLIT` remains available as a configurable alternative |
| 3 | Eligibility | registration requires staff to attest an **active, verified** gym membership (`add_participant(…, membership_verified = true)`; the CSV column `membership_verified` must be an explicit yes — false, empty or anything else is refused). The attestation date is kept. Nothing reads a membership end date, so a later expiry changes nothing for the season. Eligibility changes **only** by an administrator's documented decision recorded in an append-only table: `DISCIPLINARY` or `FRAUD` to restrict (points are reversed by appending), `REINSTATEMENT` to reverse; a reason is mandatory; audited |
| 4 | Attempts | up to 3 per weekly challenge (default; configurable 1–10 per challenge). The **best valid, judge-approved** attempt counts (`BEST`; `LATEST` / `FIRST_APPROVED` remain options). A pending or rejected attempt never counts. The ranking direction and the unit are configured per challenge (units are a closed list per metric kind; either direction is allowed for every kind — e.g. a sprint ranks the lower time, a plank hold the longer time). A rejected or voided attempt does not use up an attempt slot (hard ceiling: 10 attempt numbers per participant per challenge) |
| 5 | Absence | an eligible participant without an approved valid result earns **0** points and takes **no rank** — no ledger line is written and the athlete is not in the challenge ranking (`absence_policy = PARTICIPATION` stays available as an option) |
| 6 | Corrections | only a league administrator corrects an approved result (`race_league_correct_attempt`). Reason mandatory; the permanent record (`race_league_corrections`, append-only) keeps previous value, new value (or "removed"), actor, time, reason and the originating request; the audit log gets an entry; standings recompute by appending the difference. A **judge may submit results and *request* a correction** (`race_league_request_correction`) — a request changes nothing; an administrator applies or declines it with a reason. One pending request per result. A season cannot be completed while requests are pending |
| 7 | Appeals | a participant may appeal within **48 hours after the result is published** (rule `appeal_window_hours`, default 48). "Published" = the challenge is closed **and** the season is published — whichever happened last. One appeal per participant per result. An administrator **who did not record (or correct) any attempt in that result** decides it (`upheld` / `dismissed`) with a reason; the decision is stored and audited. An appeal **never changes a score**: an upheld appeal is followed, if warranted, by a separate normal correction. A season cannot be completed while appeals are undecided. Appeal text is visible to administrators only |
| 8 | Gym synchronisation | none. Synthetic participants ("Demo Athlete NN") and the validated CSV adapter only; `external_ref` is an opaque private string. No cross-database dependency |

### Conflict with the architecture (and what was done instead)
* **Participants have no account in this isolated module** (no cross-database link, no gym login). A participant therefore cannot submit an appeal themselves. **Implemented:** staff (administrator, judge or reviewer) lodge it on the participant's behalf; the 48-hour window is measured against the **server clock at the moment staff enter it** (no back-dating). **Decision needed:** keep staff intake, or approve a participant-facing mechanism (participant login or an unguessable per-participant appeal link with rate limiting) — a separate security design.
* **"An administrator who did not record the original result"** needs at least two administrators. With a single administrator, an appeal against a result they recorded cannot be decided; the system refuses (`LEAGUE_CONFLICT_OF_INTEREST`) rather than let someone mark their own work. A Super Admin is treated like any other administrator for this rule.
* **"Verified gym membership"** cannot be verified by the system without reading the gym database, which is out of scope. It is a **staff attestation** (a required checkbox / CSV column), recorded with its date and accountable through the audit trail.
* **Corrections after publication** are allowed until the season is completed (provisional; no separate correction window was requested). A completed season is final.

Season standings tie rule: equal totals **share a rank** (1, 2, 2, 4). Display order inside a shared rank is *only* presentation: first places, then name.

## Architecture and the boundary with the race engine
```
packages/league            pure TypeScript, no dependency on @9thround/race or on any SDK
  domain/                  types · validation · scoring (rank, points, ledger reconciliation) · standings · public projection · CSV import · gateway interface
  infrastructure/          SupabaseLeague (RPC wrapper) · InMemoryLeague (same rules, for dev + tests) · synthetic demo fixtures
apps/race/app/race/league  /race/league (phone) · /tv · /p/<publicId> · /admin · /admin/<seasonId>
supabase-race/proposed/league/20261101000001_race_league.sql    11 tables + 46 functions, all race_league_* (+ a rollback script beside it, also unapplied)
```
* **No coupling to the race engine.** The league reads/writes no `race_events`, `race_clock`, `race_station_*`, `race_slots` or race result. A weekly *league challenge* is a different concept from an official THE NINTH *race*. If a future challenge should import a race result, the intended seam is a new, documented adapter — not a join into engine tables.
* **Separate from the gym system.** Members are linked only through an optional opaque `external_ref` (text, private, never public); no cross-database foreign key, no gym credential. For development: synthetic "Demo Athlete NN".
* **One source of truth.** Points live only in an **append-only ledger** (`race_league_points_ledger`); standings are derived from it. A close, a correction or a rule change appends only the *difference* (so a retry adds nothing and nothing is rewritten). `race_league_apply_scores()` is the single scoring path.
* **Authority is the database.** Every table has RLS enabled and **no client privilege at all**; every read/write is a `SECURITY DEFINER` function that re-checks the caller (season staff role or Super Admin). The browser never sends a rank, points, status or approver.
* **Public reads are an allow-list.** `race_league_public_season / _challenge_results / _participant` answer only for a **published** season and return only: public id, display name, rank, points, weekly points, challenges completed, movement, gap, season/challenge descriptors. No UUID, no member reference, no staff identity, no rule table. An unpublished or missing season returns the same `{available:false}` (no enumeration).

## Roles
`LEAGUE_ADMIN` (season setup, challenges, participants, rules, eligibility decisions, corrections and correction decisions, appeal decisions, publishing, audit) · `JUDGE` (record attempts, *request* corrections, lodge appeals) · `REVIEWER` (approve/reject, lodge appeals). Super Admin has all. Nobody approves a result they recorded (`LEAGUE_SELF_REVIEW`) — not even an administrator. A challenge with `requires_verification = false` counts a recorded attempt at once.

## Lifecycle
Season `draft → scheduled → active → completed` (never reopens; only its published flag can still change). Challenge `draft → published → open → closed` (closed never reopens; closing is refused while attempts are pending; closing awards points once). Exactly 8 weeks (`ends_on − starts_on = 55`, `weeks = 8`).

## Routes (local)
| Route | What |
|---|---|
| `/race/league[?season=<slug>]` | phone page: standings, search, week-by-week challenges + results, season progress |
| `/race/league/p/<publicId>` | one athlete |
| `/race/league/tv[?season=…&interval=15&rotate=off&mode=podium&motion=reduced]` | TV: standings → week results → podium → progress, QR to the phone page, last-updated, offline bar, reduced motion; **read-only** (no input, button or link) |
| `/race/league/admin`, `/admin/<seasonId>` | staff: season, challenges, participants (+CSV, membership attestation, eligibility decisions), attempts (record / review / correct / request correction / decide requests), appeals, points rules, standings, audit |

Local test: `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=anon pnpm --filter ./apps/race dev` (uses **synthetic fixtures** — "Demo Athlete NN" — with a banner on every screen; the admin hub lets you *act as* admin / judge / reviewer / outsider / anonymous).
**A production build can never use the fixtures** (`chooseLeagueSource`: `NODE_ENV === "production"` ⇒ database, whatever any variable says); with the migration not applied the pages show "not published" / "could not load", never demo data.

## Environment variables (names only)
`NEXT_PUBLIC_LEAGUE_SEASON` (public address of the default season), `NEXT_PUBLIC_LEAGUE_SOURCE=database` (dev only). No secret is involved; the existing `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are reused.

## Tests (what exists)
* `packages/league` — 124 vitest tests (incl. the TypeScript half of the differential test): validation, ranking (time / reps / distance / load / numeric), points, SHARE/SPLIT ties, absence, counting policies, ledger reconciliation (exactly-once, corrections, reversals), standings, public allow-list, CSV import (formulas, duplicates, binary, size), authorization, self-review, idempotency, attempt limits, lifecycle, completed-season lock, source policy; **28 TS/SQL scoring parity cases** and **150 generated differential scenarios** (`differential-cases.json`: ties, missing results, rejected attempts, retries, administrator corrections, a rule change and an eligibility decision, compared stage by stage with the real SQL functions) (`domain/parity-cases.json`).
* `supabase-race/tests/harness/league/` (own throw-away database, step 5e of `run.sh`; apply the PROPOSED file): `32_league` (lock-down, authorization, lifecycle, attempts, review, scoring, corrections, completed lock, audit), `33_league_parity` (SQL = TS on every shared case), `34_league_public` (anon allow-list, no UUID/ref leak, unpublished = missing, cross-season, injection, direct table access denied), `36_league_rules` (the eight provisional rules against the real functions), `37_league_review` (independent-review probes: no client privilege on any table or the ledger sequence, cross-season writes refused, exactly-once corrections, a 3,000-athlete scaling guard), `38_league_differential` (SQL replay of the 150 scenarios), a **rollback rehearsal** (migration → rollback → identical object counts → migration again), `35` + shell: parallel-session checks (one request id ×10 → 1 attempt; 8 attempts vs limit 2 → 2; 6 simultaneous closes → points once; 6 recomputes → nothing added).
* `apps/race/scripts/league-e2e.mjs` — 29 browser checks on a dev server (phone, TV at 1920×1080, admin roles) + 6 on a production build with Supabase mocked (fixtures unreachable).

## Security limitations (known)
* Public pages poll (15–20 s); there is no CDN cache or rate limit in front of the three public RPCs yet. Each answers with at most 1,000 standings rows, but computing them is linear-ish in the number of athletes (measured: 1,000 athletes ≈ 80 ms, 5,000 ≈ 0.3 s, 20,000 ≈ 1.9 s per call on a shared sandbox CPU), so edge caching and throttling are REQUIRED before public traffic — see `17-league-review.md` §6.
* A participant's public id is random but, once a phone link is shared, it is a capability to see *that athlete's public page* (public data only).
* The in-memory adapter is a development/test mirror, not an authority; its rules are checked against the SQL by the shared parity file for scoring only — other rules are asserted in both suites separately.
* `display_name` is public by design: choose "First L." names (the import reduces `full_name` accordingly).
* Member import is by CSV validated server-side; the secure synchronisation with the gym system is **not built** (needs an approved integration boundary).
* Staff accounts: league roles are granted by an administrator (`race_league_set_staff`); there is no screen for it yet.

## Activation (later, only after explicit approval)
1. Approve the exact migration (below). 2. `git mv supabase-race/proposed/league/20261101000001_race_league.sql supabase-race/supabase/migrations/`.
3. Update the pinned counts in the same commit: `ops/staging_setup.sh` `EXPECTED_LOCAL` 20 → 21; `ops/staging_checks.sql` tables 35 → **46**, race functions 147 → **193**, triggers 66 → **89** (measured in the harness: relations 35 → 47 incl. the ledger's identity sequence, functions 214 → 260 incl. trigger/helper functions, triggers 66 → 89; policies 49 and enums 23 unchanged — re-measure with `staging_checks.sql` itself before pinning); `verify/verify_deployment.sql` table count; harness `01_structure.sql` (tables 46, append-only 11) and make `tests/harness/league.sh` skip the "proposed" step. 4. Run the full harness (PG 16 and 17.11). 5. Apply to **staging** with `staging_setup.sh` (it lists the pending migration and asks for confirmation). 6. Grant league roles, create the season, import participants, check `/race/league` is *not published*, publish, set `NEXT_PUBLIC_LEAGUE_SEASON`, then deploy.

## Decisions still needed
Final points table · tie handling (SHARE vs SPLIT) and any further tie-break · eligibility timing · attempts per challenge and which attempt counts · absence points · correction window / who may correct · appeals · how members will be synchronised from the gym system · whether a league challenge may ever consume an official race result · who the first league administrators are.

## Added in the independent review (see `17-league-review.md`)
* **Two independent league administrators** (two distinct active accounts; a Super Admin's implicit access does not count) are required to activate or publish a season and while it is live (`race_league_admin_count`, enforced in `set_season_status`, `set_published`, `set_staff`).
* An administrator who recorded, corrected **or removed** any result cannot decide the appeal against it.
* Public season payload carries `participantCount` and `truncated`; the phone page says "Showing the top N of M athletes".
* `proposed/league/20261101000001_race_league.rollback.sql` (unapplied): drops exactly the league objects; audit rows written by league actions remain (the audit log is append-only).

## Added in the continuation task (see `18-league-public-protection-and-roles.md`)
* **League role management screen** (`Staff & roles` tab): Super-Admin-only directory lookup (`race_league_find_account`) and appoint / remove (`race_league_set_staff`, now with a mandatory reason, audit, idempotency, season-row lock, two-administrator floor). No service-role key, no role granted.
* **Public API with edge cache + rate limiting** (`/race/league/api/...`, `packages/league/server`): allow-listed, `s-maxage` cache, distributed (REST-Redis) limiter that fails safe, 503 in production if protection is not configured. Not active until configured and deployed.
* Migration effects now: 11 tables, 1 sequence, 23 triggers, **46** functions (`race_league_*`); rollback script alongside.
