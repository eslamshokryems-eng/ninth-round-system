# supabase-race — THE NINTH's own Supabase project

This directory is the complete, independent database of **THE NINTH** (9th Round Fitness Race).
It shares **nothing** with the gym-management Supabase project (`/supabase`): separate project, database, Auth users,
Storage, API keys, environment variables and audit log. No foreign key, function, table or policy crosses the boundary.

```
supabase-race/
  config.toml          local CLI config (ports differ from the gym project)
  migrations/          ordered, standalone (apply to the NEW project only)
  bootstrap/           one-time SQL run by the database owner (no secrets in git)
  tests/harness/       throw-away-Postgres test harness (run.sh) — migrations, RLS, engine, simulation, concurrency, restore
```

Run everything locally with no Supabase project and no secrets:

    supabase-race/tests/harness/run.sh

See `docs/race/07-final-architecture-checkpoint.md` for the architecture, the role matrix, the timing model and the exact
steps to connect the new project.
