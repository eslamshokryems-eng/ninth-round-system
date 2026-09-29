# THE NINTH — database migration tests

```bash
supabase/tests/race/run.sh
```

Needs only PostgreSQL 15+ server binaries (`initdb`, `pg_ctl`, `psql`) and Node 20+. No Docker, no Supabase project, no network. It never touches a real database.

What it does:

1. Starts a throwaway Postgres cluster and applies `supabase-shim.sql`, a minimal stand-in for Supabase's `auth`/`storage` schemas and the `anon`/`authenticated`/`service_role` roles (with Supabase's default grants, so RLS is the security boundary exactly as in production).
2. Applies every existing gym migration, then fingerprints all non-race objects (`fingerprint.sql`).
3. Applies the `*_race_*` migrations.
4. Re-fingerprints and diffs: any change to an existing object fails the run. It lists the intentional additive touches.
5. Runs `helpers.sql`, loads the JS timing twin (`docs/race/scripts/timing-validation.mjs --csv`), and runs `tests/*.sql` in order. Every assertion raises on failure.
6. Runs `supabase/rollback/20260928_race_phase3_down.sql` with race data present, and checks the fingerprint equals the pre-race state.
7. Re-applies the race migrations after rollback.

`KEEP=1 run.sh` leaves the cluster running for debugging (prints the socket directory and port).
