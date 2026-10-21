# 17b — THE NINTH League: independent pre-activation review

Status: **review complete, approval gate CLOSED.** Everything below was done locally against throw-away databases and a local web server. No migration was applied, no remote database was written, no Supabase setting or deployment was touched, no pull request exists.

## 1. Exact scope of the change (league work only: `b7eba0b^..HEAD`)
47 files, +8.7k lines. **New** (all league): `packages/league/**`, `apps/race/app/race/league/**`, `apps/race/src/{features,components}/league/**`, `apps/race/scripts/league-e2e.mjs`, `docs/race/17-league*.md`, `supabase-race/proposed/league/*.sql` (migration + rollback, outside `supabase/migrations`), `supabase-race/tests/harness/league.sh` and `league/32…38_*.sql`.
**Modified existing files (6, each small and listed here in full):**
| File | Change |
|---|---|
| `apps/race/package.json` | + `"@9thround/league": "workspace:*"` |
| `apps/race/next.config.mjs` | `transpilePackages` + `@9thround/league` |
| `apps/race/.env.example` | + comments naming `NEXT_PUBLIC_LEAGUE_SEASON`, `NEXT_PUBLIC_LEAGUE_SOURCE` (no values, no secrets) |
| `pnpm-lock.yaml` | the new workspace package |
| `supabase-race/tests/harness/run.sh` | step 5e (`league.sh`) and an `ONLY_LEAGUE` shortcut — test tooling only |
| `supabase-race/tests/check-isolation.sh` | league added to the dependency allow-list **and** four new checks (§4) |

**Race Engine:** `git diff b7eba0b^..HEAD -- packages/race supabase-race/supabase supabase-race/verify supabase-race/ops apps/race/src apps/race/app` (excluding the league folders) is **empty**: no race source, timing, scoring, route or migration file was touched by the league work. Against the gym base `527f705` the gym files are identical (check-isolation). *History note:* two older race migrations (`20260929000005_race_engine.sql`, `20260930000001_race_judge_scoring.sql`) were edited several times in September, long before the league and before staging was set up; none of the 20 migration files appears in any league commit.

## 2. Security review of the migration — findings
Method: read every function and table; wrote adversarial probes (suite `37_league_review`); mutation-tested the scoring; measured the public reads.

| # | Finding | Severity | Status |
|---|---|---|---|
| F1 | **Public standings were quadratic.** Per-row subqueries made `race_league_public_season` / `_public_participant` cost 1.5 s at 1,000 athletes, **35 s at 5,000, >8 min at 20,000** — a self-inflicted denial of service for anyone who can load the public page. | High | **Fixed** (set-based joins/window functions). Output byte-identical on the 1,000-athlete corpus; now 77 ms / 0.32 s / 1.9 s. Guard test: 3,000 athletes must answer inside 5 s |
| F2 | The ledger's identity sequence was `USAGE/UPDATE`-able by `anon`/`authenticated` through Supabase default privileges (`setval` could reorder "latest line wins"). Not reachable through PostgREST, but needless. | Low–Med | **Fixed** (`revoke all on sequence …`); probe added |
| F3 | "Two independent league administrators" was only a conflict check, never required. | Medium (against your requirement) | **Fixed**: activating or publishing a season needs ≥2 distinct active `LEAGUE_ADMIN` accounts (a Super Admin's implicit access does not count) and `set_staff` refuses to drop a live season below two |
| F4 | An administrator who **removed** a result (void, no replacement) was not seen as having "recorded" it, so could decide its appeal. | Medium | **Fixed**: the conflict test also checks the corrections table; probe added |
| F5 | Public reads cut off at 1,000 rows silently; the challenge-results subquery picked its 1,000 rows without an order. | Low | **Fixed**: ordered; payload now carries `participantCount` and `truncated`; the phone page says "Showing the top N of M" |
| F6 | `check-isolation.sh` was **failing** on `apps/race → @9thround/league`, contrary to my earlier report. | Process | **Fixed and strengthened** (§4); I withdraw the earlier "0 failures" claim |
| F7 | The staff overview returned season rules in storage naming; the Rules tab would have crashed against a real database. | Medium | Fixed earlier (camelCase helper) + SQL test |

**Verified as sound (with evidence in the suites):**
* *RLS / grants:* all 10 tables have RLS and **no policy and no client privilege** (select/insert/update/delete/truncate/references/trigger checked for both `anon` and `authenticated`); the three public reads are the only functions `anon` can execute; 26 functions are executable by `authenticated`; every other function (helpers, scoring, correction core, admin count, rules mapper) is not callable by any client; all 44 are `SECURITY DEFINER … set search_path = ''` or immutable helpers.
* *Authorization:* every state-changing function derives the actor from `auth.uid()` (no uid parameter exists) and checks a season-scoped role; cross-season writes (record, close, restrict, correct, appeal, appoint staff, read overview) are refused; judge/reviewer/plain/anon matrices tested per function.
* *Private data:* public payloads are an explicit allow-list (keys asserted exactly); no UUID, member reference, staff identity or appeal text; unpublished = missing = identical response (no enumeration). Staff overview hides member references from non-admins and appeals/corrections/eligibility decisions from non-admins.
* *Duplicate point awards:* single scoring path (`race_league_apply_scores`) under an advisory lock, writing only the difference; 10 parallel identical requests → 1 attempt; 8 attempts vs limit 2 → 2; 6 parallel closes → points once; 6 parallel recomputes → nothing; a retried correction is refused (`already voided`).
* *Corrections:* administrator-only, reason mandatory, previous/new/actor/time/reason/request kept in an append-only table, audit entry, difference appended, completed season locked. A judge's request changes nothing.
* *Immutability:* ledger, corrections and eligibility decisions are append-only; nothing is ever deleted; a completed season is final even for the database owner (only the published flag may still change).

## 3. TypeScript ↔ SQL parity
* 28 shared scoring cases (ties, SHARE/SPLIT, absence, counting policies, ineligible/inactive, zero reps, owner table) pass in both.
* **New differential test:** 150 generated scenarios (2–9 athletes, 0–3 attempts each, forced ties, rejected attempts, all counting/direction/tie/absence combinations, 0–3 administrator corrections incl. removals, a mid-season rule change, an eligibility decision) are evaluated by the TypeScript engine and replayed against the **real SQL functions**; ledger lines, per-athlete points and latest rank are compared after **five stages** (close, retry, corrections, rule change, eligibility). All agree (>500 stage comparisons). The retry stage asserts that a second close/recompute appends nothing in both.
* Mutation check: replacing `rank()` with `dense_rank()` in the SQL is caught immediately; the checked-in JSON is regenerated and diffed by a unit test, so the corpus cannot drift.
* Limit of the claim: the SQL side replays scenarios with direct inserts and the internal functions, not through every RPC; the RPC-level behaviour (authorization, idempotency, concurrency) is covered by suites 32–37 and the parallel-session checks.

## 4. The isolation allow-list change
`apps/race` (the Next.js app) depends on `@9thround/league` because the league screens live in the app; `packages/race` and the race engine do **not**. The allow-list change only adds that one package name. To make sure it hides nothing, `check-isolation.sh` now also asserts (each verified to fail when violated): (a) `@9thround/league` is imported **only** from the league routes, features and components; (b) `packages/league` imports nothing from the race engine or the app and has **no runtime dependencies**; (c) the league SQL references only `race_profiles`, `race_audit_log` and four shared helper functions (`race_log_audit_event`, `race_make_append_only`, `race_forbid_delete`, `race_is_super_admin`, `race_can_create_events`) — no event, clock, station, slot, result or ranking object; (d) no race migration mentions the league.
**Real, accepted coupling to disclose:** the league screens reuse the race app's UI kit, auth store and Supabase client factory (presentation and sign-in only), and the league SQL reuses the shared audit log, profiles and role helpers. The race engine reads nothing from the league and the league reads nothing from the engine.

## 5. Race Engine regression status (accurate)
* Unit tests: `pnpm test` — race 270/270 (all workspaces green), lint and typecheck clean, `check-isolation.sh` 0 failures, staging shell tests (2) pass.
* Database, final code: the full migration harness passed on **PostgreSQL 16.13 and 17.11**, each with the **1,447 existing race assertions** (incl. the final 50-athlete simulation and the parallel-session suites) unchanged, **287 league assertions**, the rollback rehearsal and the restore-fingerprint comparison: `ALL RACE MIGRATION TESTS PASSED` twice.
* **Existing race browser suite (`race-e2e.mjs`) — rerun on the final code:** run 1 = **88/96**, run 2 = **89/96**. The same **7 rowing / OCR / evidence-page checks fail in both runs** (they also failed on the pre-league baseline in the earlier round; I did not re-run the baseline in this review, so the equality of the 7 names with the baseline is from that earlier comparison). Run 1 additionally failed `reception: several matches show a pick list` with a 30 s click timeout (element "not stable"); it passed in run 2 and no reception file is touched by the league — I classify it as a transient timing flake, but I did not root-cause it. **I do not claim the browser suite passes.**

## 6. The 1,000-row public limit: scaling and rate-limiting requirements
What the limit is: a public season read returns at most the best 1,000 standings rows (and says if it cut: `participantCount`, `truncated`); a challenge result list is capped the same way; a single-athlete read returns one row. The cap bounds the **payload (~330 kB)**, not the **work**: the database still ranks every athlete.
Measured after the fix (local PostgreSQL 16, shared sandbox CPU, 4 closed challenges per athlete): public season / single athlete = **77 / 93 ms at 1,000 athletes, 318 / 285 ms at 5,000, 1.9 s / 1.3 s at 20,000**; challenge results 20–40 ms. (Before the fix: 1.5 s, 35 s, >8 min.)
Traffic arithmetic: a TV (15 s) plus phones (20 s polling) means N viewers ≈ N/20 requests per second. 400 viewers ≈ 20 req/s; at 300 ms per call that is 6 CPU-seconds per second — **uncached, a 5,000-athlete league falls over under ordinary gym-event traffic.** A 500-athlete league (~20 ms/call) is fine for tens of viewers even uncached.
**Requirements before any public traffic:**
1. **Edge cache** the three public reads (CDN or a thin Next.js route handler with `Cache-Control: public, s-maxage=10–15, stale-while-revalidate=60`), keyed by season/week/athlete — the DB then computes once per season per window regardless of viewers. Highest-value control.
2. **Rate limit** per IP at the edge (e.g. 30 req/min for the athlete read, 60 for season) and cap the allowed `p_slug`/`p_public_id` shapes; Supabase's API gateway does not throttle RPCs by itself. Never expose the staff RPCs to unauthenticated callers (already enforced) and keep the publicly shared link on the cached path only.
3. **Backoff in the clients** (poll 15–20 s with jitter and exponential backoff on errors; the TV already shows an offline bar).
4. If a season ever exceeds ~5,000 athletes: store a **standings snapshot** (recomputed on close/correction/eligibility change) instead of computing per read, and paginate (`offset`) rather than cutting at 1,000.
5. Load-test the real project (not this sandbox) once the migration is approved, using the staging project, with the cache in place.

## 7. Remote state — what was and was not changed
* **League task: no remote database written, no migration applied, no seed run, no Supabase setting changed, no Vercel/DNS/SMTP touched, no deployment, no pull request.** All databases used were throw-away local PostgreSQL clusters (16 and 17) created and destroyed by the harness; web servers were local and stopped.
* The new SQL files live in `supabase-race/proposed/league/` — `supabase db push` and `staging_setup.sh` read only `supabase/migrations/`.
* I scanned all 1,267 shell commands of this session for the Supabase/Vercel CLIs, the staging script, connection strings and the staging host: none was **executed** in the league task. The scan did find two unauthenticated reachability probes in an **earlier phase** (a `HEAD` to `api.supabase.com` and a `GET /` to the staging host root, no credentials, no data read or written). The 20 earlier migrations on the staging project were applied by you on your machine in that earlier phase; the league migration is not among them.
* Git: 2 league commits (`7da3e50`, `ab0a05f`) are on the remote feature branch from the previous round; the review changes are committed **locally and not pushed**.

## 8. Final migration review — `20261101000001_race_league.sql` (still PROPOSED)
**Exact effects if applied (all additive; 1,223 lines):** creates 10 tables (`race_league_seasons, _challenges, _participants, _attempts, _points_ledger, _staff, _eligibility_decisions, _correction_requests, _corrections, _appeals`), 1 identity sequence, 22 triggers (no-delete ×6, append-only ×3 tables → update/delete/truncate guards, completed-season guards ×10), 44 `race_league_*` functions, indexes, RLS enabled on every table, **all client privileges revoked**, and execute grants for 3 public reads (anon + authenticated) and 23 staff entry points (authenticated). It does **not** alter, drop or grant on any existing object, adds no policy, no extension, no schema, no type and no data. It calls only `race_make_append_only` (to install triggers on its own tables). Object counts: relations 35 → 46, functions 214 → 258 (race-prefixed 147 → 191), triggers 66 → 88; policies and enums unchanged.
**Rollback:** `20261101000001_race_league.rollback.sql` (unapplied, in the same folder) drops exactly the league tables (`cascade`, which only league objects can depend on) and functions, then verifies nothing league-shaped remains. The harness rehearses it: base → migration → rollback → **identical object counts to the base** → migration again → identical schema. Consequences to know: (a) it **destroys all league data**; take a backup/export first; (b) audit rows already written (`action like 'league.%'` in `race_audit_log`) **remain**, because that table is append-only by design; (c) it should run in one transaction, by hand, never from the migrations folder; (d) because the migration touches no existing object, a failed or reverted league has **no effect on races**.
**Activation prerequisites (unchanged, not performed):** explicit approval; move the file into `supabase/migrations/`; re-pin the counts (`EXPECTED_LOCAL` 20 → 21, `staging_checks.sql`: 45 tables, 191 race functions, 88 triggers — re-measure); rerun the full harness on PostgreSQL 16 and 17; apply to staging only; two league administrators appointed by a Super Admin; edge cache and rate limit in front of the public reads before any public link is shared.

## 9. Remaining risks and open items
| # | Risk / limitation | Mitigation / owner |
|---|---|---|
| R1 | No cache or rate limit in front of the public reads (§6) | Required before public traffic |
| R2 | Public single-athlete read ranks the whole season (≈1.3 s at 20k) | Cache; snapshot table if >5k athletes |
| R3 | An administrator may correct a result they recorded themselves, or request and apply their own correction (corrections are administrator-only by your rule) | Audit trail; consider a four-eyes rule if wanted |
| R4 | "Independent" means two distinct accounts; the system cannot prove two humans | Organisational control |
| R5 | Membership is a staff attestation, not verified; fraud risk sits with the attester and is visible in the audit log | Accepted by your rule 8; revisit when integration is approved |
| R6 | Appeals are staff-entered; the 48 h is measured on the server clock when staff enter it | As you decided; a participant-facing channel needs its own security design |
| R7 | `first_published_at` does not restart if a season is hidden and re-published | Stated; choose a different rule if needed |
| R8 | A shared athlete link is a capability to that athlete's public page | By design; public data only |
| R9 | A judge can see recorder UUIDs and rules in the overview (staff-only, not public) | Accepted |
| R10 | Rule changes mid-season re-score closed challenges (by appending, audited) until the season completes | Configurable by design |
| R11 | Existing harness has one known timing-sensitive assertion in `16_simulation.sql` and the race browser suite one transient test (§5) | Pre-existing; not root-caused here |
| R12 | Race browser suite still has 7 failing rowing/OCR/evidence checks | Pre-existing; unrelated to the league |
| R13 | Real-database behaviour under PostgREST/RLS (headers, role switching) is proven with a faithful local shim, not on a real Supabase project | Staging verification step after approval |

## 10. Decisions you have already made (kept as-is)
Staff-entered appeals · two independent administrators (now enforced) · 48-hour window (configurable `appeal_window_hours`) · synthetic participants and validated CSV only · eight-week season · provisional points policy configurable (100/90/80/75/70/65/60/55/50, then 40; absence 0).
