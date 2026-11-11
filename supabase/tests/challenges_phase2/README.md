# Challenges — local PostgreSQL integration test harness

A repeatable, checked-in, **local-only** test suite for all three Challenges
migrations: the Phase 1 foundation
(`supabase/migrations/20261105000001_challenges_foundation.sql`), the Phase 2
RLS/RPC layer
(`supabase/migrations/20261105000002_challenges_rls_and_rpcs.sql`), and the
Phase 3 MVP simplification
(`supabase/migrations/20261106000001_challenges_mvp_membership_independence.sql`)
that makes Challenges participation fully independent of gym membership —
customer identity (`profiles.id`, resolved via `auth.uid()`), customer-chosen
competition branch, an account-level display name, three competition scopes
(BRANCH/GLOBAL/MULTI_BRANCH), and the new public leaderboard views.

It exists because this migration's correctness depends on real PostgreSQL
behavior — RLS, grants/revokes, row locking, partial unique indexes, enum
casts/renames, aggregate availability, default privileges, how RLS evaluates
on a view — that reading the SQL text cannot verify. Earlier passes of this
work found four real bugs in Phase 2 alone (an unqualified function call
under `search_path=''`, `min(uuid)` not existing, `jsonb ->> bigint` not
existing, and an UPDATE-ordering bug that made every single correction
approval fail) that only surfaced by actually running the SQL. This harness
is how that verification is kept repeatable instead of being a one-off
scratch session that leaves nothing behind.

## What this is

- A from-scratch PostgreSQL schema (`00_schema.sql`) that reproduces just
  the pieces of this repo's real schema that Challenges' SQL references:
  `profiles` (now including `date_of_birth`, used directly for age
  eligibility), `branches`, `admin_audit_log`, the
  `user_role`/`program_type`/`membership_status` enums, an `auth.uid()`
  shim, the four pre-existing helper functions Challenges calls
  (`auth_role()`, `is_super_admin()`, `is_branch_staff()`,
  `log_audit_event()`, each copied **verbatim** from its real migration,
  cited in a comment above each one), and an `alter default privileges ...
  grant select on tables to anon, authenticated` statement that emulates
  Supabase's own project-level default grant — without it, every one of
  Phase 3's new direct table/view reads (the leaderboard views, the
  broadened RLS policies) would fail with "permission denied" even where
  RLS itself would have allowed the row, since no Challenges migration has
  ever added a table-level grant of its own. `members`/`memberships` are
  still created (Phase 1's own CREATE TABLE statements reference
  `members(id)` inline before Phase 3 retargets the FK to `profiles`), but
  nothing in this suite seeds or reads a row in either any more — Phase 3
  removed every real dependency on them.
- Seed data (`10_seed.sql`): three branches (a third, otherwise-unused one
  specifically so a MULTI_BRANCH "branch not in this challenge's list" case
  has a real branch to test against), a super_admin, two branch_managers
  (one per branch), three coaches, and four ordinary CUSTOMER profiles
  (`role = 'member'`, `branch_id = null` — matching the real schema, where
  `profiles.branch_id` is only ever populated for staff) with varying dates
  of birth, covering the adult/minor/unknown-DOB age-eligibility cases.
- Numbered `*.sql` test scripts, each covering one area, run in order
  against the same scratch database by `run.sh`.
- `run.sh`: builds the scratch database, applies the **real** migration
  files by relative path (never duplicated here — there is no copy of the
  migration SQL in this directory, so there is no drift risk), applies the
  seed, runs every test script, greps each one's output for the specific
  outcome it must produce, and prints a PASS/FAIL summary with a non-zero
  exit code on any failure.

## What this is **NOT**

**This harness is not a recreation of the production Supabase schema**, and
passing it is not equivalent to verifying this migration against Supabase.
Specifically, it does NOT reproduce or verify:

- The real `auth.uid()` / JWT-claims pipeline — this harness's `auth.uid()`
  reads a plain settable session variable (`request.jwt.claim.sub`), not a
  real signed JWT processed by PostgREST/GoTrue.
- Supabase's own exact `anon`/`authenticated`/`service_role` default grant
  configuration — this harness's `alter default privileges` statement
  (`00_schema.sql`) is a best-effort emulation of that behavior, not a
  verified match against a specific real project's actual settings.
- The full, real `profiles`/`branches` table definitions — only the columns
  these specific Challenges functions read or write are reproduced here.
- Every other migration in `supabase/migrations/` — only the four
  pre-existing helper functions Challenges calls are reproduced, copied by
  hand. If those real functions are ever changed, this harness's copies
  must be updated by hand to match, or this harness will silently test
  against stale behavior.
- Performance, index usage at scale, connection pooling (pgbouncer),
  Supabase Realtime, or any other Supabase-platform behavior.
- Anything about the actual production database's current data, content,
  or state (this harness never connects to Supabase at all).

**Still required before these migrations are ever applied to the real
Supabase project:** a manual review (not a script) confirming the real
`auth.uid()` behavior under PostgREST, the real default grants on
`anon`/`authenticated` in that specific project, and a run against a real
(or Supabase-local-dev) instance if one is available, ideally via `supabase
db reset`/branching rather than direct application to a shared database.

## Prerequisites

- A local PostgreSQL 16 server you can create a scratch database on and
  (if not already running) start. This sandbox already has
  `postgresql-16`/`postgresql-client-16` installed system packages; most
  other machines will need their own local Postgres.
- The ability to run as the Postgres superuser locally. By default `run.sh`
  assumes the same setup this harness was built and verified against: running
  as root, with a `postgres` OS user and `pg_ctlcluster`/`su postgres`
  available. If your setup differs (e.g. your own OS user already has local
  Postgres superuser access via peer/trust auth), set `PSQL_SUPERUSER=""`
  before running.

## Running it

```bash
cd supabase/tests/challenges_phase2
bash run.sh
```

Environment variables (all optional):
- `SCRATCH_DB` — scratch database name (default `challenges_phase2_harness`)
- `PG_CLUSTER_VERSION` / `PG_CLUSTER_NAME` — which local cluster to use/start
  (default `16`/`main`)
- `PSQL_SUPERUSER` — command prefix used to get a Postgres-superuser shell
  (default: `su postgres -c` when running as root with a `postgres` OS user
  present; set to `""` to just run `psql` directly as your current user)

The script always drops its own scratch database at the end (and on any
early exit, via a trap) — it never touches any other database, and never
connects to anything outside localhost.

## What each script covers

| File | Covers |
|---|---|
| `20_privileges.sql` | `recompute_challenge_points()` rejected for direct client calls (both roles); a positive control that `authenticated` really can call a real action RPC (`set_challenge_display_name`), contrasted with `anon` being denied the same call |
| `30_seasons_and_settings.sql` | `create_challenge_season`/`set_challenge_weight_range` authorization (unaffected by Phase 3) |
| `40_create_challenge.sql` | Eligibility-rule validation (membership-based rule types now rejected outright; invalid ages rejected safely), authoritative weight range, branch isolation across all **three** scopes (a branch_manager blocked from BRANCH→GLOBAL/MULTI_BRANCH escalation; `MULTI_BRANCH` requires a non-empty branch list even for super_admin) |
| `45_registration_and_branch_selection.sql` | **New: the full customer self-service registration model** — a display name is required before registering; branch choice is validated structurally against each of GLOBAL (no branch at all)/BRANCH (must match)/MULTI_BRANCH (must be in that challenge's list); duplicate registration rejected; age-only eligibility (minor rejected, missing date-of-birth rejected, adult approved) read directly from `profiles.date_of_birth` |
| `50_lifecycle_and_submission.sql` | Lifecycle gating (submission blocked outside active/completed), coach authorization (exclusively `designate_challenge_coach()` now — no automatic resolution exists), the duplicate-original-submission guard, rejected-then-resubmit, correction-after-approval |
| `60_review_and_corrections.sql` | Self-review ban on a correction, the designation-reason requirement and its audit log (now just `{reason}` — there is no more "automatic resolution" to compare an override against), atomic whole-challenge recompute across multiple participants |
| `70_cross_branch_coach_designation.sql` | `designate_challenge_coach()`'s branch checks scoped to the **participant's own chosen branch** (not a membership/staff branch) — unauthorized (wrong coach branch, wrong caller branch, even for super_admin) and authorized cases, **plus the new branchless/GLOBAL-participant carve-out** (only a super_admin may designate a coach when the participant chose no branch) |
| `80`–`82` | A genuine two-session concurrency race proving the `FOR UPDATE` lock closes the double-approval window, now set up through the real registration/designation flow rather than a direct row insert |
| `95_leaderboards_and_rls.sql` | **New: the public leaderboard views and the broadened RLS this phase introduces** — an ordinary, unrelated customer can read others' participants/ledger/display-name/branch-list rows and the three leaderboard views themselves, while a non-approved result stays hidden from that same customer (and visible to staff); a genuinely unauthenticated `anon` session sees zero rows everywhere, never a permission error |

## Last known-good run

See the implementation report from the session this harness was built/updated
in for the exact `run.sh` output. Re-run it yourself — that is the point of
this harness existing as checked-in files instead of a transcript.
