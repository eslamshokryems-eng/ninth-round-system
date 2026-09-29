# THE NINTH — final architecture checkpoint (before production connection)

**Status: complete. Nothing has been applied to any Supabase project — old or new. Waiting for your explicit approval.**

Everything below was produced and verified on a throw-away local Postgres and a mocked-Supabase browser run. No credentials were needed, requested or committed.

---

## 0. What changed since the Phase 6 report

| Decision | What was done |
|---|---|
| Separate Supabase project | All race SQL now lives in `supabase-race/` (its own Supabase CLI project). The migrations apply to a database that contains **zero** gym objects. |
| Separate auth / roles | New `race_profiles` (own accounts) + per-event `race_staff` roles. No gym `profiles`, `branches`, permission catalog. |
| Separate audit | New `race_audit_log` (append-only, own writer function). The gym `admin_audit_log` is no longer touched. |
| Separate storage | New migration with 4 race buckets and policies. |
| Separate app + env | New Next.js app `apps/race` with its own Supabase client and env vars. Race pages, components and types were **moved out** of the gym app and gym packages. |
| Engine must not depend on devices | Engine rewritten around **official time + catch-up** (§F). Proven by a blackout run that ends in a state *identical* to a 5-second-tick run. |
| DNF / SKIP / pause / correction decisions | Locked as specified (§F). DNF → `NOT_REACHED`; pause note optional. |
| Manual heat that never starts | New `race_close_heat_without_start` (Event Manager or Master Control, reason required, audited). |

The gym system is byte-identical to its pre-race state (§J).

---

## A. Architecture

```
                     ┌────────────────────────────── GYM MANAGEMENT (untouched) ──────────────────────────────┐
                     │  apps/web · apps/mobile · packages/*                                                    │
                     │  Supabase project  G  (own DB · Auth users · Storage · keys · env vars)                 │
                     └─────────────────────────────────────────────────────────────────────────────────────────┘
                                          ✕  no shared code at runtime · no shared DB · no foreign keys
                                          ✕  no shared users · no shared storage · no shared audit log

┌───────────────────────────────────────────── THE NINTH ─────────────────────────────────────────────┐
│                                                                                                      │
│  Browsers                        apps/race (Next.js, own deployment)                                 │
│  ─ athletes (anon)  ──────────►  /race/e/…  register · my page (private link)                        │
│  ─ Reception        ──────────►  /race/reception/…   check-in · queue                                │
│  ─ Master / EM      ──────────►  /race/control/…     clock · pause · skip · corrections · heats      │
│  ─ Super Admin/EM   ──────────►  /race/admin/…       registrations · payments                        │
│            │  NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY  (THE NINTH's own — never the gym's)              │
│            ▼                                                                                         │
│  Supabase project  N  (dedicated account/email)                                                      │
│  ├─ Auth      race staff accounts (email+password) — signups disabled, created by Super Admin        │
│  ├─ Postgres  race_* tables · RLS everywhere · SECURITY DEFINER RPCs · append-only ledgers           │
│  │            race_profiles · race_staff (per-event roles) · race_audit_log (own history)            │
│  │            ENGINE = pure arithmetic on: START EVENT time + pauses + configured durations          │
│  │                     + slot plan  → any RPC / read settles ("catches up") the recorded state       │
│  └─ Storage   race-evidence · race-athlete-photos · race-event-assets · race-documents               │
│                                                                                                      │
│  SUPABASE_SERVICE_ROLE_KEY: server-side admin scripts only. Never in a browser. Not used by the app. │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Repository layout (one repo, two independent systems):

```
supabase/          gym project (unchanged)            apps/web, apps/mobile, packages/*   gym (unchanged)
supabase-race/     THE NINTH project (CLI-compatible) apps/race                           THE NINTH web app
  supabase/{config.toml, migrations/}                 packages/race                       THE NINTH domain + use cases + own DB types/client
  bootstrap/  verify/  tests/harness/  tests/check-isolation.sh
```

`packages/race` no longer imports **any** other workspace package (its ~40-line Result/UseCase kernel is vendored).

## B. Supabase projects and environments

| | Gym (existing) | THE NINTH staging | THE NINTH production |
|---|---|---|---|
| Supabase project | existing, untouched | **new**, dedicated account/email | **new**, dedicated account/email |
| Database / Auth / Storage | its own | its own | its own |
| Web deployment | existing gym site | `apps/race` (staging) | `apps/race` (production) |
| Env vars | gym's | staging trio (§D) | production trio (§D) |
| Receives migrations | never from this work | first, after your approval | only after staging passes and you approve again |

Recommended: create **staging first**, run §K there, then repeat for production. Both are independent of the gym project.

## C. Migration list (`supabase-race/supabase/migrations`, 11 files, 5,221 lines)

| # | File | Contents |
|---|---|---|
| 1 | `20260928000000_race_foundation` | extensions, `race_gender`, **`race_profiles`**, auth-user trigger (no authority by default), strict helpers (`race_auth_active`, `race_is_super_admin`, `race_can_create_events`), `race_set_account_flags`, **`race_audit_log`** + writer |
| 2 | `20260928000001_race_config` | enums, templates, events (no branch), categories, stations, rules |
| 3 | `20260928000002_race_people_heats` | athletes, heats, registrations, payments, staff, devices, judge applications |
| 4 | `20260928000003_race_day_ledger` | clock, pauses, check-ins, start slots, station results, performance events, reviews, OCR, corrections, rankings; append-only machinery |
| 5 | `20260928000004_race_access` | event-scoped role helpers, timing functions, guard triggers, audit wiring, grants, RLS, foundation RPCs |
| 6 | `20260928000005_race_seed` | station/category/rule templates |
| 7 | `20260929000002_race_registration` | public registration, race numbers, manual payments |
| 8 | `20260929000003_race_checkin_queue` | check-in, queue, slot plan, heat anchoring |
| 9 | `20260929000004_race_queue_corrections` | check-in correction ledger, DNS override, later-heat move, **replaying slot binder** |
| 10 | `20260929000005_race_engine` | **official time**, START EVENT, pause/resume, catch-up engine, skip, DNF, close-heat, next heat, control state |
| 11 | `20260929000006_race_storage` | 4 buckets + storage policies |

Not carried over: the gym null-guard security fix (it is a gym migration) — see §J.

## D. Environment variables

| Variable | Where | Exposed to browser | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/race` deployment + local `.env.local` | yes (public by design) | THE NINTH project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same | yes (public by design; RLS is the boundary) | THE NINTH anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | admin scripts / server only | **never** | not read by the web app at all; bypasses RLS |
| `RACE_DATABASE_URL` | operator's shell only, for the bootstrap/verify `psql` | never | direct connection string |

`apps/race/.env.example` documents them; no `.env*` file is committed; `check-isolation.sh` fails the build if a JWT-shaped string or `.env` file is committed or the service-role key appears in browser code.

## E. Role / permission matrix (enforced in the database)

Accounts: **Super Admin** and "may create events" are global flags on `race_profiles` (only a Super Admin can change them, through an audited RPC; nobody can self-serve). Every other role is **per event** in `race_staff`. Athletes have no account and no administrative access. *Station Screen* is a device role (read-only station display), not a person.

| Action | Super Admin | Event Manager | Master Control | Reception | Judge | Station Screen | Athlete / anon | Other event's manager |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Create event | ✔ | ✔ if granted | – | – | – | – | – | ✔ if granted (own new event) |
| Assign staff / roles | ✔ | ✔ (not EVENT_MANAGER) | – | – | – | – | – | – |
| Change account flags | ✔ | – | – | – | – | – | – | – |
| Register athletes (staff) / confirm payment | ✔ | ✔ | – | ✔ | – | – | public self-registration only | – |
| Refund / waive / cancel registration | ✔ | ✔ | – | – | – | – | – | – |
| Assign / move heats, lock heats | ✔ | ✔ | – | – | – | – | – | – |
| Read athlete contact data, queue | ✔ | ✔ | ✔ | ✔ | – | – | own page via private link | – |
| Check an athlete in | ✔ | ✔ | – | ✔ | – | – | – | – |
| **Correct a check-in** | ✔ | – | ✔ | – | – | – | – | – |
| **Override DNS / move to later heat** | ✔ | ✔ | – | – | – | – | – | – |
| START EVENT · pause · resume · skip · DNF · close heat · start next heat · control dashboard | ✔ | ✔ | ✔ | – | – | – | – | – |
| Read station/race state (advance/refresh) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | – | – |
| Read audit log | ✔ (all) | ✔ (own event) | – | – | – | – | – | – |
| Upload evidence photos | ✔ | ✔ | ✔ | – | ✔ | – | – | – |
| Read evidence | ✔ | ✔ | ✔ | – | uploader | – | – | – |
| Athlete photos (upload/read) | ✔ | ✔ | ✔ | ✔ | – | – | – | – |
| Event assets / documents (write) | ✔ | ✔ | – | – | – | – | – | – |
| Event assets (read) | public | | | | | | public | |

The matrix is asserted by `18_accounts_and_roles` (predicates for every account, `anon` returns *false, never NULL*), `05_race_roles`, `14_engine`, `15_queue_corrections`, `19_storage`.
A person who has accounts in both systems has two unrelated identities: different project, password, session, JWT and permissions.

## F. Final race timing model

Constants (per event, frozen at lock): start interval **3:30**, work **3:00**, transition/scoring window **0:30**, 9 stations, heat gap ≥ interval (default **10:00**, measured from the last athlete's start), first athlete at **+0:60** after START EVENT, slot bound **60 s** before its start, voice cue 10 s before, check-in closes 15:00 before the heat.

**Authoritative state is a function, not a process.** Race time is
`race_ms(t) = (t − started_at) − Σ closed pauses − (paused ? t − paused_at : 0)` and everything else is arithmetic on it:

| Quantity | Formula |
|---|---|
| Heat anchor | first: 0:60; next AUTO: `prev.anchor + (N−1)·I + G`; a MANUAL heat waits for START HEAT (or is closed) |
| Slot start | `anchor + slot_index · I` |
| Station *n* window | `[slot_start + (n−1)·I , +work)`, scoring window `+transition`; **no grace period** |
| Athlete finish | `slot_start + 8·I + work` |
| Overflow capacity | `floor(G / I) − 1` (=1 at defaults) slot per heat, only if it starts in the future and ends ≥ 1 interval before the next heat |
| Official instant of anything | `race_wall_at(event, race_ms) = started_at + race_ms + pauses that ended before that race moment` |

**Catch-up, not ticking.** The database records (slot bound/started, station ACTIVE/SCORING/LOCKED, athlete/heat/event finished) are a *cache* of that arithmetic. Every state-changing RPC first "catches up" (`race_advance_core`, idempotent, replays each decision at *its own* race moment), and the dashboard read does the same. Consequences, all tested:

* Recorded start/lock/bind/finish times are the **official instants**, never "when a device noticed" (`lag_ms` is audited but never used).
* If every browser, judge device and station screen is offline for any length of time, the first device that returns gets the correct, settled state.
* No `pg_cron`, no Edge timer, no browser tick is needed or used. (`race_advance` still exists as an optional nudge; the Master Control screen does not call it.)

**Locked decisions.** Correct check-in: Master only, before the athlete starts, original kept and superseded, corrected athlete inherits the original arrival timestamp. SKIP: allowed until the Station 01 work window ends, slot stays empty, nobody moves up, reason required, audited. DNF: completed stations stay valid, unreached stations become `NOT_REACHED`, rows never deleted, excluded from official rankings. Emergency pause: no reason needed (optional note), audited, arithmetic exact to the millisecond. Manual heat: `CLOSE HEAT WITHOUT START` (Event Manager/Master, reason, audit) so it can never block completion; athletes become DNS; a waiting AUTO heat behind it is scheduled immediately. Late overflow: one extra slot per heat; a second late athlete gets NO SLOT AVAILABLE; an Event Manager may move them to a later heat only if a safe slot exists; assigned athletes are never moved or delayed.

## G. Final 50-athlete simulation report

Scenario (`race_sim.scenario_50`, built through the real RPCs): 6 heats (9,9,9,9,9,5); heat 5 is MANUAL and never started; all pre-race check-ins in one pass; **#5** never arrives (DNS) · **#14** arrives late mid-heat · **#27** skipped at the start line · **#30** DNF · **#48** late → heat 6's only overflow slot · **#49** late → NO SLOT · **five pause/resume cycles** (2:00, 5:00, 0:20, 0:45, 0:10) · heat 5 **closed without start** at 2:30:00.

Two runs of the *same* script:
* **Dense** — engine settled every 5 s of race time (2,400+ ticks), all four timing invariants checked after every tick.
* **Blackout** — *zero* ticks: Master Control, every Judge and every Station Screen "disconnected" for up to 20 minutes at a time (first: the first 19:59 of the race); the clock only jumps between operator actions; devices "reconnect" at awkward instants (19:59.0, half a second after a station lock, the very end).

| Result | Dense | Blackout |
|---|---|---|
| Started / finished / DNF / DNS | 38 / 37 / 1 / 12 | 38 / 37 / 1 / 12 |
| Slots | 42 = 38 started + 1 skipped + 3 burned; 1 overflow | identical |
| Official finish | 3:22:00 (last start 2:50:30 + 31:00 + 0:30) | identical |
| Pause total | 8:15, exactly the sum of the pauses | identical |
| **State digest** (every athlete, slot, window, lock time, status, heat, event) | `D` | **`D` — identical** |

What the simulation proves (each is an assertion):

| Claim | Proof |
|---|---|
| no duplicate slots | no athlete holds two slots; 0 duplicate check-ins; 0 duplicate station results |
| no overlapping athletes | invariant I1 after every tick (incl. the 0:30 hand-over); 336 live windows, all distinct per station |
| no changed start times | `planned_start = anchor + slot·3:30` for all 38 starts, despite skip, DNS, cancellation, late arrivals |
| no extra work time | every one of the 336 windows is exactly 3:00 long and exactly `slot start + (n−1)·3:30` |
| no grace period | every lock at exactly `window end + 0:30`; boundary tests at 3:59.9 / 4:00.1 / 4:29.9 / 4:30.1 |
| no incorrect event completion | event stays LIVE while heat 5 is pending; finishes only after the close, at the official 3:22:00 |
| no broken pause arithmetic | `paused_total_ms` = exact sum; no overlap; 25 rapid cycles zero drift; 97-pause parallel storm |
| no duplicate check-ins | 50 simultaneous check-ins across 6 heats → 50 rows, 50 distinct timestamps; 10 simultaneous double-clicks → 1 |
| no duplicate performance events | ledger idempotency key unique + append-only (asserted). **Honest limit:** the judge RPC that writes performance events belongs to the judging phase, so the simulation cannot generate them yet |
| device outage is harmless | Blackout run equals dense run; 12 devices reconnecting at once after a 40-minute blackout → each athlete started exactly once, statuses match race time, 0 errors |

## H. Final test report

| Layer | Result |
|---|---|
| Race SQL suites (19 files) | **834 assertions pass** |
| Parallel-session concurrency | **29 checks pass** (registration, payment, check-in incl. **50 simultaneous**, binder, START ×12, engine ticks ×20 and **unlocked** ×20, pause/resume storms, skip-vs-start, correction race, **blackout reconnect ×12**, close-heat ×8) |
| Independence (database) | 8 checks pass (30 tables, all `race_*`; all 74 foreign keys point at race tables or this project's `auth.users`; no gym table/function/policy reference; RLS on every table) |
| Restorability | `pg_dump` → fresh database → identical row counts in every table and identical body for every function; audit history restored |
| Post-deployment verify script | passes on the tested DB (same script for staging/production) |
| Unit tests | `@9thround/race` **154 pass** (timeline, clock sync, use cases, mappers); every other workspace's count unchanged (identity 39, reception 82, sales 31, hr 14, …) |
| Lint / typecheck | pass, whole workspace (16 typecheck tasks) |
| Builds | gym web **builds** (36 pages, no race route); THE NINTH app **builds** |
| Browser (Chromium, mocked Supabase) | **43/43** on THE NINTH's own app (3 consecutive clean runs) |
| Negative controls (remove the safety → tests must fail) | START lock removed → 12/12 "started"; PAUSE lock removed → duplicates; dashboard without catch-up → **blackout test fails**; start stamped with tick time → **official-time test fails**; earlier: per-person and per-heat locks |
| Repository isolation check | 8 checks pass (gym files identical, no cross references, no workspace dependency, no secrets) |

Honest notes: (0) during the last stretch of work one full harness run stopped with exit 1 in the concurrency section and printed no error text; I could not identify a cause from the log. Two later complete runs on identical code both passed everything. The harness now prints where and on which command it stops, so it can never be silent again. (1) the first time the full-house browser suite ran after the split it flaked twice on a *test* wait that matched a heading instead of the result banner — fixed to wait on the result element, then 3 clean runs. (2) The blackout proof initially failed only because my time-travel simulator rewrote history inconsistently; the simulator now shifts every recorded timestamp with the clock, and the engine needed no change for that. (3) A new check found my new tables inheriting default `anon` privileges; revoked before they were ever applied anywhere.

## I. Security / RLS report

* **RLS enabled on every table** (asserted, and re-asserted by `verify_deployment.sql`); 62 policies; 70+ `SECURITY DEFINER` functions, **all** pin `search_path` (asserted).
* **No client write path to ledgers**: check-ins, slots, results, pauses, clock, payments, performance events, corrections, audit have no client INSERT/UPDATE/DELETE privilege; everything goes through authorising, server-stamping, auditing RPCs. Append-only triggers (incl. TRUNCATE) protect 8 ledgers *even from the table owner*.
* **NULL-safe guards**: helper predicates return TRUE/FALSE, never NULL; every guard is `IS NOT TRUE`. Anonymous and deactivated callers are refused (tested per role).
* **Accounts**: new users start with no authority; flags only via audited `race_set_account_flags`; a Super Admin cannot demote or deactivate themselves; `race_profiles` visible only to self/Super Admin.
* **Engine internals are not API surface** (`race_advance_core`, binder, freezer, wall-time, audit writer): revoked from `anon`/`authenticated`.
* **Storage**: evidence/photos/documents private, assets public-read; every policy authorises against the event in the *first path folder*; evidence immutable (no update/delete policy); MIME allow-lists and size limits.
* **Secrets**: only the two `NEXT_PUBLIC_*` values are read by browser code; service-role key never referenced there; no `.env`/JWT committed (checked).
* **Residual risks / to verify on the real project:** (a) public registration RPC has no rate limit or CAPTCHA (add Supabase/edge rate limiting before public launch); (b) real Auth settings (signups off, email confirmation, password policy, ideally MFA for Super Admin) must be set in the dashboard — `config.toml` documents intent only; (c) storage `owner` is set by the Storage API — tests emulate it, so §K step 8 re-checks on the real service; (d) restore test uses local `pg_dump`, not Supabase-managed backups; (e) athlete access uses a private link token (Phase 4 design) — treat links as secrets.

## J. The gym system is not connected to, or modified by, THE NINTH

* `git diff 527f705 HEAD` over **every gym path** (apps/web, apps/mobile, supabase/, packages/{database-types, supabase-client, identity, reception, sales, hr, audit, billing, training, nutrition, tracking, notifications, ai, ui, i18n, config, shared-kernel}, gym CI workflow) is **empty** — asserted by `tests/check-isolation.sh`.
* Only shared file: `pnpm-lock.yaml` gains 71 additive lines for the two new workspaces (no gym dependency changed). `turbo build` also builds `apps/race`; a race build failure would show on gym CI — say if you want it filtered out.
* Gym web app builds unchanged (36 pages, zero race routes). No gym test count changed.
* **Decision for you:** I earlier added a gym migration (`20260929000001_fix_admin_rpc_null_guards`, a real NULL-bypass fix in 5 gym admin RPCs). To keep the gym untouched it is **removed from the gym migrations** and parked as `docs/race/gym-followup/gym_fix_admin_rpc_null_guards.sql.txt`. It has never been applied anywhere. The gym owner should review and apply it separately — it is a genuine security fix.
* No migration, function, table, policy or storage object of THE NINTH exists in the gym project; no gym object exists in THE NINTH's (asserted on a database built *only* from `supabase-race`).

## K. Exact steps to connect the new project (after your approval — nothing here has been run)

1. **Create the project** in the dedicated THE NINTH account (start with *staging*). Note the project ref, URL, anon key, service-role key, DB password — keep them in your password manager; never paste them in chat or commit them.
2. **Auth settings** (dashboard): disable public sign-ups; require email confirmation; set password policy; JWT expiry 1 h; Site URL = the race site; redirect URL `…/race/login`; SMTP sender; enable MFA for the owner.
3. **Local env** (not committed): `apps/race/.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` of *this* project. Keep the service-role key out of it.
4. **Link and push** (CLI, from the race directory):
   ```
   cd supabase-race
   supabase link --project-ref <THE-NINTH-STAGING-REF>
   supabase db push          # applies the 11 migrations, tracked in THIS project's migration history
   ```
   Confirm the CLI says the ref you expect (it must never be the gym's).
5. **Verify the database**: `psql "$RACE_DATABASE_URL" -f supabase-race/verify/verify_deployment.sql` — must print only `OK …` lines.
6. **First Super Admin**: dashboard → Authentication → *Add user* (the dedicated email), then
   `psql "$RACE_DATABASE_URL" -v email="'<that email>'" -f supabase-race/bootstrap/promote_super_admin.sql`.
7. **Staff accounts**: add Auth users (Event Manager, Master Control, Reception, Judges); the Super Admin creates the event (`select race_create_event(...)`) and the Event Manager assigns event roles. *(There is no staff-role or event-creation UI yet — SQL/RPC for now.)*
8. **Storage check on the real service**: upload a test photo as a Judge (accepted), as Reception (refused), read as anonymous (refused for evidence, allowed for event assets); confirm the four buckets and limits in the dashboard.
9. **Deploy the race app** as its **own** hosting project (root `apps/race`) with the two `NEXT_PUBLIC_*` values for staging. Smoke: register an athlete, sign in as Reception, check in, sign in as Master Control, open the dashboard.
10. **Dress rehearsal on staging**: run a small real event through START → pause → skip → finish; disconnect all devices for a few minutes mid-race and reconnect.
11. **Only after staging is signed off**: repeat 1–9 for *production* with production keys, and archive the verify output.
12. Enable rate limiting / CAPTCHA for public registration before opening it to the public.

**Not built yet (later phases, unchanged by this checkpoint):** judge scoring app and performance-event RPC, station screens, offline queue, results/rankings, OCR, evidence-upload UI, staff-role and event-creation UI, payment gateway.

---

**STOP.** I will not create, link, push to, or configure any Supabase project until you explicitly approve.
