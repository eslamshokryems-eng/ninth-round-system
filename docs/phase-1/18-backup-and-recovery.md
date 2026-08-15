# Backup & Recovery

Production-safety layer 2 of 3. This is primarily an operational
document, not code — Supabase already provides the backup mechanism a
production project needs; the job here is to explain what's available,
what to check, and how to recover safely without ever touching this
session's local database changes.

## What I could not check directly

This coding session has no credentials for the live Supabase project —
no dashboard access, no Management API key, nothing beyond the migration
files in this repo. **I cannot tell you what backup plan is currently
active, what the retention window is, or whether Point-in-Time Recovery
(PITR) is enabled**, and I have not guessed at any of it below. Everything
plan-specific in this document is Supabase's own published behavior per
tier; please confirm the actual current settings from the dashboard
yourself (steps below), since only you have access to it.

### How to check (2 minutes, no changes made)

1. Supabase Dashboard → your project → **Settings → Backups** (or
   **Database → Backups** depending on the current UI). This page shows,
   for the project as it is right now:
   - Whether the project is on Free, Pro, Team, or Enterprise.
   - The daily backup schedule and how many days of daily backups are
     retained.
   - Whether Point-in-Time Recovery is available/enabled, and its
     retention window if so.
2. Screenshot or note what it says — that's the ground truth this
   document is deliberately not assuming.

## What Supabase provides, per tier (published behavior, not this project's confirmed setting)

| Plan | Automatic backups | Typical retention | PITR |
|---|---|---|---|
| Free | None | — | Not available |
| Pro | Daily | 7 days | Available as a paid add-on |
| Team / Enterprise | Daily | Up to 14 days (Team) / configurable (Enterprise) | Available, longer retention options |

**If the project is currently on Free**: there is no automatic backup at
all today. A database problem (a bad migration, accidental data deletion,
a bug that corrupts rows) has no safety net beyond what this document's
"before any risky change" checklist below covers. This is the single
biggest production risk in this report — see the Production Readiness
Report section.

**If the project is on Pro without PITR**: daily backups exist, but
recovery can only restore to a point at most 24 hours old, and loses
everything written since the most recent daily snapshot. For a system
that's actively taking payments (as this one now is), that's a real
amount of same-day data that PITR (continuous, minute-level recovery
points) is what actually protects against losing.

### What I am explicitly not doing

- Not upgrading the plan.
- Not enabling PITR or any paid add-on.
- Not changing any billing or project configuration.

Per your instructions, those are decisions only you can make (they cost
money), so this document ends with a recommendation, not an action.

**Recommendation**: if the dashboard check above shows Free tier or Pro
without PITR, upgrading to at least Pro-with-PITR is worth doing before
this system holds much more real payment history — the cost is small
relative to what a single unrecoverable bad migration or accidental
delete would mean for a business now taking daily cash/card payments
through it. This is a recommendation for you to act on (or not) in the
Supabase dashboard directly, not something this session can or should do
on its own.

## Recovery procedure

### Before anything risky (a migration, a bulk data fix, anything touching production data)

1. **Confirm today's backup exists.** Dashboard → Backups → confirm the
   most recent automatic backup timestamp is recent (within the last 24h
   on Pro+). If it isn't, or backups aren't enabled at all (Free), treat
   the operation as unrecoverable if it goes wrong — proceed with
   correspondingly more caution, or don't proceed.
2. **Never test a restore directly on production.** Restoring overwrites
   the live database — there is no "preview" mode. If you need to
   verify a backup actually restores cleanly, do it on a separate,
   throwaway Supabase project (a new free-tier project is enough for a
   restore test), not this one.

### How to restore (if something does go wrong)

1. Dashboard → Backups → pick the backup point (a daily snapshot, or a
   specific timestamp if PITR is enabled) → **Restore**.
2. Supabase performs the restore in place on the project you're
   restoring — this **is** the production database once it completes.
   There is no separate staging copy created automatically.
3. **Recommended safer alternative for anything short of "the whole
   database is gone"**: instead of restoring the live project, spin up a
   new Supabase project, restore the backup *there*, and pull just the
   specific rows/tables you actually need back into production via a
   scoped `INSERT`/`UPDATE`. Slower, but it means a partial data problem
   (e.g. one bad bulk update) never risks losing unrelated data that
   changed correctly after the backup point.

### What to check after any restore

- **Row counts on the tables that matter most**: `members`,
  `memberships`, `membership_payments`, `check_ins`, `profiles` — do they
  look right for the point in time restored to, not obviously truncated?
- **RLS still enabled everywhere it should be.** A restore replays the
  database as it was at that point, which should include RLS state — but
  confirm `select relrowsecurity from pg_class where relname =
  'members';` (and the other core tables) still returns `true`.
- **`admin_audit_log` is intact and its own append-only guarantees still
  hold** (no `INSERT`/`UPDATE`/`DELETE` policy for `authenticated`/`anon`)
  — this table is itself part of what you'd want to trust after a
  recovery, so it's worth confirming its own protections restored
  correctly too.
- **Auth still works**: try signing in as a known test/staff account
  after the restore, before declaring it done — a restore that rolled
  back `auth.users` further than `public.profiles` (or vice versa) would
  otherwise only surface the next time someone tries to log in.
- **Migrations applied after the backup point are re-applied**, if the
  restore point predates them — `supabase db push` from a machine with
  the CLI configured against the restored project, same as any other
  migration deployment.

### Never do this

- Never run a restore against production "just to see" — always test on
  a disposable project first if you're unsure a backup is good.
- Never delete a backup manually from the dashboard without being certain
  a newer one exists and is confirmed good.
- Never treat "the app looks fine" as confirmation a restore succeeded —
  check the specific tables and row counts above; a partially-restored
  database can look fine at a glance and still be missing recent data.
