# Staging seed scripts (THE NINTH) — idempotent, NOT executed anywhere yet

Four scripts that create the **first staging event** and its **staff roster**, using the real RPCs and real RLS (as the Super Admin), so every grant lands in the audit log exactly as it will in production.
They are for the **staging** project only (they refuse any event slug that does not end in `-staging` or `-dryrun`). They have been dry-run only against the throw-away test database (`supabase-race/tests/harness/seed_dryrun.sh`, part of `run.sh`).

| Script | Does | Writes? |
|---|---|---|
| `00_preflight.sql` | checks the actor, the roster file and every roster email *before* anything is changed | no (read-only) |
| `01_event.sql` | creates the event if the slug does not exist (`race_create_event`), opens registration, sets venue/fee | yes, once |
| `02_staff.sql` | grants the roster's roles (`race_staff`), never deletes, re-activates inactive grants | yes, once |
| `03_verify_seed.sql` | read-only report + assertions: event configuration, roster == active staff, one judge per station | no |

Running a script a second time changes **nothing** (zero new rows, zero new audit rows).

## Inputs (never committed)

* **Roster file** — a CSV outside git (`roster.csv` is git-ignored here). Format `role,email,station`; see `roster.example.csv` (fake `.invalid` addresses). Roles: `EVENT_MANAGER`, `MASTER_CONTROL`, `RECEPTION`, `JUDGE` (station 1–9), `STATION_SCREEN` (station 1–9).
* **Accounts first**: every roster email (and the Super Admin) must already exist as an Auth user (dashboard → Authentication → Users) — a `race_profiles` row is created automatically with no authority. The Super Admin flag comes from `bootstrap/promote_super_admin.sql`.
* **Database connection**: `RACE_DATABASE_URL` in the operator's shell (from the vault) — never in a file.

## Run order (operator shell, staging only — after explicit go-ahead)

```
export ROSTER_CSV=/secure/path/roster.csv          # outside the repository
V="-v ON_ERROR_STOP=1 -v actor_email=owner@… -v event_slug=the-ninth-staging -v event_date=2026-12-18 \
   -v event_name='THE NINTH (staging)' -v event_venue='9th Round Arena' -v event_fee=750 \
   -v event_planned_start='2026-12-18 07:00:00+00' -v event_timezone=Africa/Cairo -v target_env=staging"
psql "$RACE_DATABASE_URL" $V -f supabase-race/seed/staging/00_preflight.sql
psql "$RACE_DATABASE_URL" $V -f supabase-race/seed/staging/01_event.sql
psql "$RACE_DATABASE_URL" $V -f supabase-race/seed/staging/02_staff.sql
psql "$RACE_DATABASE_URL" $V -f supabase-race/seed/staging/03_verify_seed.sql
```
`event_planned_start` and `event_fee` are optional (`''` / `0`). Each script prints what it did (`created` / `already exists` / counts) and fails loudly on anything unexpected.
