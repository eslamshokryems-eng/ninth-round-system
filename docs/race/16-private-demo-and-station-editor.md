# 16 — Private demo race + Station & Exercise Settings

Built on the existing race engine (no second engine). Applies to the THE NINTH Supabase project only — never the gym project.

## What exists now
| Piece | Where |
|---|---|
| Migration (columns, templates, versions, RPCs, demo workflow) | `supabase-race/supabase/migrations/20261001000001_race_station_config_and_demo.sql` |
| Admin hub (events, create demo) | `/race/admin` |
| Guided demo workflow | `/race/admin/<slug>` |
| **Station & Exercise Settings** (sidebar item) | `/race/admin/<slug>/stations` |
| Login / logout | `/race/login` (landing → "Staff & officials sign in" → `/race/admin`), **Sign out** button in the admin header |
| Authorize your email | `supabase-race/ops/provision_admin.sh` (reads `RACE_ADMIN_EMAIL`) |
| Tests | harness suites `29_station_config.sql`, `30_demo_workflow.sql`; `packages/race/application/station-config-use-cases.test.ts`; 9 new browser checks in `apps/race/scripts/race-e2e.mjs` |

## Access model (server-side, not hidden UI)
* No public signup. Accounts are created by invitation / dashboard; email confirmation and password rules stay as configured in Supabase Auth.
* The Next pages are static clients that hold no data. **Every** read/write is a SECURITY DEFINER RPC that re-checks the caller's role in the database: `race_get/preview/update/reset/copy_station_config` and all `race_demo_*` require the Event Manager (or Super Admin) of that event; `race_station_display` / `race_demo_status` require event staff; `race_create_demo_event` requires `can_create_events`. `anon` has no execute privilege on any of them. Tables (`race_exercise_templates`, `race_station_config_versions`) have no client privileges at all.
* Nothing in the repo contains your email, a password or a key. The browser uses only `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Authorize the email as Super Admin
1. Create the Auth user (Dashboard → Authentication → Users → Add user, or let the script invite it).
2. In **your** shell: `RACE_ADMIN_EMAIL=you@example.com RACE_DATABASE_URL='<race project db url>' bash supabase-race/ops/provision_admin.sh`
   (optional `RACE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to send the invitation e-mail; the key stays in your shell). The existing staging account was already promoted with `bootstrap/promote_super_admin.sql`.

## Run a test race
1. Sign in → `/race/admin` → **Create demo event** (private: unguessable slug `demo-xxxxxxxxxxxx`, free, never opened for public registration).
2. **Station & Exercise Settings** → edit, Preview, Save (reason required).
3. Guided page: **Add athletes** (1–27, labelled `DEMO Athlete NN`, heat size 3 for a small test or 9 for full heats) → **Lock heats** → **Check in all** (or the reception screen).
4. Master dashboard: START EVENT (this freezes the station configuration), pause/resume, skip, DNF. Open judge `/race/judge/<slug>/<n>` and station screens `/race/station/<slug>/<n>`.
5. Results page → rankings. **New run** copies the configuration into a fresh demo event; the previous run, its results, versions and audit trail are untouched (ledgers are append-only, nothing is deleted).

## Editor rules
* **Name vs type:** station name, exercise name, instructions and equipment are display-only. They never change scoring. Changing the **exercise type** replaces the scoring configuration of all three categories with that template's defaults and needs explicit confirmation; changing a scoring parameter (knee ratio, hold break limit) also needs confirmation.
* **Templates fully supported:** `REPS`, `PUSHUP_STYLE` (knee 3:1), `LAPS` (10 m), `HOLD` (break-limited), `REPS_TECHNIQUE` (S04/S07 only, technique /10 tie-break), `DISTANCE_OCR` (S09 only, photo + OCR + judge confirmation). **Listed but UNSUPPORTED and refused:** `TIME_FOR_DISTANCE`, `MAX_LOAD`, `CUSTOM_TEXT` (the engine ranks higher-is-better scores only).
* **Locked-rule conflicts (shown, never applied):** renumbering a station; disabling a station (every athlete passes all nine, 31 min); changing S04/S07/S09 away from their technique / rowing templates; using the technique or rowing template elsewhere. Each is refused with a `RACE_RULE_CONFLICT` message. **These need an explicit authorized rule decision before they can ever be allowed.** "Enabled/disabled for draft test events" from the request is therefore *not* implemented, because it conflicts with the locked "9 stations / 31 minutes" rule.
* **Versioning:** every change snapshots the full 9-station configuration into `race_station_config_versions` (append-only; version, reason, author, time). The rulebook templates (`race_station_templates`, `race_station_rule_templates`) are never modified — each event owns a private copy. When the event goes LIVE a trigger stores the configuration as the **frozen** version; after that the RPCs refuse (`RACE_CONFIG_LOCKED`) and the existing config guard refuses direct edits. Completed events keep the version they ran with; other events are unaffected.
* **Audit:** `race.station_config.update|reset|copy`, `race.demo.create|athletes` in `race_audit_log` with before/after, reason and changes (row-level audit triggers already cover the tables).
* **Judge / station screen / dashboard:** the judge console loads `race_station_display` (exercise name, instructions, equipment, scoring type) and derives its buttons from the **configured scoring type**, not from the station number. The station screen shows the exercise name under the station name.

## Known limits / decisions to confirm
* **Demo events are private (migration `20261001000002_race_demo_private.sql`).** `race_event_visible()` — the single gate behind every anonymous read (RLS on events, categories, stations, rules, heats, clock; `race_get_public_event`, `race_event_schedule`, `race_server_time`) — now returns true for a demo only to that event's own staff and Super Admins, at every status. Slug or id knowledge grants nothing. Also closed for demos: `race_leaderboard`, `race_results_public` (rankings), `race_now_ms`, `race_event_accepts_judges`, and public registration (`race_register_athlete`). Real events behave exactly as before. Not touched: the public `race-event-assets` storage bucket (no demo upload path exists; writes remain manager-only) and `race_get_registration(token)` (secret token, never issued for demo athletes).
* The config guard on `race_stations`/`race_station_rules` still lets the Event Manager edit them directly through RLS before the race starts (existing behaviour relied on by the older tests); such direct edits are audited and captured in the next snapshot, but carry no mandatory reason. The editor RPC is the supported path.
* Applying the migration to staging needs your explicit go-ahead: `staging_setup.sh` (updated expectations: 35 tables, 147 functions, 66 triggers; two migrations: `20261001000001_…`, `20261001000002_…`).
