# THE NINTH — production infrastructure checklist & deployment runbook

**Status: PLAN ONLY (decisions L1–L10 locked). Nothing in this document has been run.** No Supabase project exists, nothing is connected, no credentials were requested, nothing is deployed. Race logic, scoring and timing are frozen at the state accepted in Phase 12 (`docs/race/12-final-end-to-end-validation.md`).

Every step below is gated: **I do not start step 0 of §3 until you say so explicitly**, and I will stop again after staging (§3 → §6) and before production (§8).

---

## 0. LOCKED DECISIONS (approved)

| # | Decision | Consequence in this runbook |
|---|---|---|
| L1 | THE NINTH gets a **completely separate Supabase organization / project / account** from the gym system | Own org, own owner login, own billing, own keys, own Auth user pool. The Supabase CLI is only ever linked to the race project; every `link`/`push` is preceded by a ref check (§3). |
| L2 | **Supabase Pro** (unless the platform requires a different tier) | Production on Pro (no auto-pause, daily backups; PITR add-on enabled for the event). Staging may use a second Pro project or the smallest paid compute — never a project that can pause during a rehearsal. The tier is re-confirmed on the billing page at creation time; if the platform requires another tier for a needed feature (e.g. PITR) we stop and ask. |
| L3 | **Frankfurt (eu-central-1) or the closest appropriate Supabase region to Egypt** | Chosen at project creation from the regions the dashboard actually offers; Frankfurt is the default. Latency affects judge UX only (server time is authoritative). **The same region for staging and production.** |
| L4 | **Postgres version is decided by what Supabase actually offers for that project/region — then the full Phase 12 harness is run on that exact major version; no mismatch allowed** | §3A (the compatibility gate). Note: Supabase's current docs describe Postgres **15 and 17** as the maintained lines (the changelog/docs I could see list 15.x and 17.x patch releases and 17 as the default for new/self-hosted stacks — to be confirmed on the creation screen); **16 is not one of them**. So the 15-vs-16 question is expected to resolve to 15 or 17 — and my 1,246-assertion run so far was on **16**, i.e. it does **not** yet count for the target. |
| L5 | **Vercel: a separate project for THE NINTH** | §4; own project, own env vars, own domains; never the gym web project. |
| L6 | **Registration abuse protection / rate limiting before production — focused and minimal; no redesign of registration** | §11 (design; implementation awaits the execution-step go-ahead because it is a code + migration change). |
| L7 | **Idempotent staging SQL seed scripts** (first staging event + staff roster), prepared, **not executed** | §12 (specification; script files are written after the doc is approved, run only on your explicit go-ahead). |
| L8 | **Exact environment-variable matrix** for local / staging / production | §1. |
| L9 | **Deployment and rollback commands / checklist** | §13 (with §4, §8, §9). |
| L10 | **No production credentials in source control; none requested or exposed in chat** | §1 rules: values live in the vault/Vercel/Supabase only; scripts read them from the operator's shell; `check-isolation.sh` continues to fail on any committed secret or `.env`. |

**Execution gate:** nothing in this document is run — no Supabase project is created, the CLI is not linked, no migration is pushed, no Vercel project is created, nothing is deployed — until you give an explicit **"approved: infrastructure execution"**. Each later gate (staging signed off → production) needs its own explicit approval.

### Still needed from you (not blocking this document)

| # | Item | Needed for |
|---|---|---|
| 1 | Domain names (production + staging) and who controls DNS | §4 |
| 2 | First staging event facts: slug, date, planned start, venue, fee | §12 seed |
| 3 | Staff roster emails (1 Event Manager, 1 Master Control, 1–2 Reception, 9 Judges, up to 9 Station Screens, 1 Super Admin) | §12 seed |
| 4 | SMTP sender for Auth emails | §3 B5 |
| 5 | Registration protection option (§11): A only, or A + Turnstile | §11 |
| 6 | Which person holds the Supabase owner, Vercel owner and DNS accounts (2FA on) | §2 |

---

## 1. Environment-variable matrix (exact)

THE NINTH's browser code reads **exactly two** variables. Everything else is operator-side and never reaches Vercel or the browser. **No value below is ever committed or pasted in chat.**

### 1.1 Matrix

| Variable | Local dev | Staging | Production | Stored in | Browser-visible |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/race/.env.local` → **staging** project URL (or a local Supabase stack; never prod) | Vercel → *Preview* env (staging branch/domain) → staging project URL | Vercel → *Production* env → production project URL | `.env.local` (gitignored) / Vercel | yes (public by design) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key | staging anon key | production anon key | same | yes (RLS is the boundary) |
| `RACE_DATABASE_URL` | operator shell → staging direct connection string (for `psql` verify/seed) | operator shell → staging | operator shell → production | **shell only** (exported for the session, from the vault) | never |
| `SUPABASE_ACCESS_TOKEN` | operator shell (CLI login) | same | same | shell only; **revoke after each deployment window** | never |
| `SUPABASE_DB_PASSWORD` | — | operator shell (prompted by `supabase db push`) | operator shell | shell/vault only | never |
| `SUPABASE_SERVICE_ROLE_KEY` | not set | not set | not set | **not defined anywhere** in Vercel or `.env*`; vault only, used only by an admin script if one is ever needed and approved | **never** (`turbo.json` `globalEnv` only hashes it; `check-isolation.sh` fails if browser code references it) |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | — | Vercel Preview (site: public; secret: server-only) | Vercel Production | Vercel | site key yes; secret **never** — **only if option A+Turnstile is chosen in §11** |

Rules: staging and production use **different projects, keys and Vercel environments** (a Preview deployment can never read production values; production values are scoped to the *Production* environment only); `NEXT_PUBLIC_*` values are inlined at **build** time, so any change needs a redeploy; a local `.env.local` never points at production; `.env.example` stays the only committed template.

### 1.2 Pre-deployment variable check (run before every deploy)

```
# in the Vercel project: only these names may exist
vercel env ls          # expected: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (+ TURNSTILE_* if chosen) — nothing else
bash supabase-race/tests/check-isolation.sh     # no .env, no JWT-shaped string, no service-role key in browser code
```
Also confirm by eye that the URL's project ref in the Production environment is the **production** ref and the Preview one is the **staging** ref.

---

## 2. Pre-flight gate (nothing created yet)

- [x] Phase 12 accepted; Phase 13 plan approved; decisions L1–L10 locked.
- [ ] Domain / DNS owner identified (§0 table).
- [ ] Accounts exist with 2FA: Supabase owner (race org), Vercel owner (race team/project), DNS.
- [ ] Password-manager vault "THE NINTH" prepared (staging + production entries).
- [ ] Deployment ref chosen (branch/tag) — I do not open a PR unless asked.
- [ ] `bash supabase-race/tests/check-isolation.sh` all PASS on that ref (gym files identical to `527f705`).
- [ ] **Postgres compatibility gate (§3A) passed** on the exact version Supabase offers for the selected project/region.
- [ ] Registration abuse protection (§11) implemented, harness-tested and approved.
- [ ] Staging seed scripts (§12) written, dry-run against a throw-away database, approved.

---

## 3A. Postgres compatibility gate (must pass BEFORE the project is created)

**Why:** the Phase 12 proof ran on PostgreSQL **16** (the version installed in my sandbox). Supabase's current documentation describes **15 and 17** as the maintained versions (the changelog/docs I could see list 15.x and 17.x patch releases and 17 as the default for new/self-hosted stacks — to be confirmed on the creation screen); `supabase-race/supabase/config.toml` says `major_version = 15`. A proof on 16 is evidence, not proof for 15 or 17 (planner behaviour, `pg_trigger`/catalog details used by `verify_deployment.sql`, advisory-lock and `clock_timestamp` semantics, extension availability).

**Procedure (no infrastructure involved — local, throw-away):**
1. **Verify what Supabase offers** — at project-creation time, in the dashboard: *New project → Region (Frankfurt, or the closest offered to Egypt) → Advanced / Postgres version*. Record the exact **major.minor** shown (and the Supabase image tag if shown). Cross-check the current Supabase docs/changelog on that day. *(I cannot see your dashboard; this is a one-minute check for you, or I do it with you at the execution step.)* The creation screen is the source of truth; the choice is "the newest major Supabase offers for that region unless it is flagged beta".
2. **Get binaries for that exact major** on a throw-away machine: preferred = the Supabase Postgres image of the same tag (`docker run supabase/postgres:<tag>`); otherwise the PGDG packages of the same major (`postgresql-<major>`).
3. **Pin the harness to that version.** `run.sh` currently picks the highest installed `/usr/lib/postgresql/*/bin`; I add a tiny, test-only `PGBIN=/path/to/bin` override (no race logic involved) so the version is explicit and printed in the first line of the run.
4. **Run the full Phase 12 harness on it:** `PGBIN=… bash supabase-race/tests/harness/run.sh` → must print `ALL RACE MIGRATION TESTS PASSED`, the **same assertion count** (1,246 at the Phase 12 baseline, plus any added by §11), all concurrency storms, and `MODEL AGREES … 0 mismatches`. Repeat the final simulation **≥ 6 times** (`ONLY_FINAL=1`, random slot orders) — all 0 mismatches.
5. Also run `verify/verify_deployment.sql` against that harness database (the harness does this in its step 3b).
6. **Decision rule:**
   * all green on the offered version → **proceed**; set `config.toml` `major_version` to that version in the same commit as the evidence;
   * **any** failure, mismatch or count difference → **STOP**: do not create the project; send me the log; a fix is a separate, approved change (and is re-tested on both the old and new version).
   * If Supabase offers both 15 and 17: choose the **newest GA** one; do not pick by convenience.
7. **Evidence** (committed under `docs/race/evidence/` without secrets): `postgres --version`, harness summary, the six simulation summaries, date. The Postgres version of the project is then **frozen** until after the event (no major upgrade in the change-freeze window).

After project creation, confirm the real version: `select version();` on the project must equal the version the gate passed on.

---

## 3. Supabase setup sequence (staging first, then production — repeat the whole list per project)

> Every command is run by the operator from `supabase-race/`. The CLI must print the *race* project ref before anything is pushed. If it prints any other ref → stop.

**A. Create the project**
1. Dashboard → New project in the **THE NINTH organization (a separate Supabase account/org from the gym — L1)**, named `the-ninth-staging` / `the-ninth-prod`; **plan: Pro (L2)**; **region: Frankfurt or the closest offered to Egypt (L3), identical for staging and production**; **Postgres version = the one that passed §3A (L4)**; strong DB password generated in the password manager.
2. Record in the vault: project ref, URL, anon key, service-role key, DB password, direct connection string. **Do not paste them in chat.**

**B. Auth settings** (Dashboard → Authentication) — `config.toml` documents intent only; these must be set by hand:
3. Sign-ups **disabled** (Providers → Email → *Allow new users to sign up* off); email **confirmation required**; password policy (≥ 12 chars); JWT expiry 3600 s.
4. URL configuration: Site URL = the race site (`https://race.<domain>` / staging URL); additional redirect URL `…/race/login`.
5. SMTP: your own sender (§0 #8); test an invite email.
6. MFA enabled for the Super Admin account.

**C. Schema** (CLI, from `supabase-race/`)
7. `supabase login` (uses `SUPABASE_ACCESS_TOKEN`) → `supabase link --project-ref <THE-NINTH-REF>` → confirm the printed ref.
8. `supabase db push` — applies **all migrations in `supabase-race/supabase/migrations/`** (17 at the Phase 12 baseline, 18 if §11 adds one; `supabase migration list` is the authority) in order (`20260928000000_race_foundation` … `20260930000006_race_tally_deterministic_order`). They are forward-only and tracked in *this* project's migration history. *(The earlier checkpoint text said "11 migrations"; the current number is 17.)*
9. `supabase migration list` → every local migration applied, none pending; `select version();` equals the version that passed §3A.

**D. Verify the database** (read-only)
10. `psql "$RACE_DATABASE_URL" -f supabase-race/verify/verify_deployment.sql` → only `OK …` lines, no `VERIFY FAIL`. Archive the output (screenshot/log) in the vault.
11. Realtime: confirm `race_clock` is in the `supabase_realtime` publication (the migration adds it): `select tablename from pg_publication_tables where pubname='supabase_realtime';` → exactly `race_clock` among `public.*`.
12. Storage: dashboard shows 4 buckets — `race-evidence` (private, 10 MiB, jpeg/png/webp), `race-athlete-photos` (private, 5 MiB), `race-event-assets` (public, 10 MiB), `race-documents` (private, 20 MiB).

**E. First Super Admin and event** (SQL, once)
13. Dashboard → Authentication → Users → *Add user* (dedicated owner email, confirmed).
14. `psql "$RACE_DATABASE_URL" -v email="'<owner email>'" -f supabase-race/bootstrap/promote_super_admin.sql` → prints `OK: … is now a THE NINTH Super Admin`.
15. Add the staff Auth users (invite). Each gets a `race_profiles` row automatically with **no authority**.
16. As the Super Admin (SQL editor with their JWT, or through the app once a UI exists — there is **no event-creation or staff-role UI yet**, by design of the frozen scope), create the event and roles:
    `select race_create_event('<slug>', date '<yyyy-mm-dd>', 'THE NINTH', 'Africa/Cairo', timestamptz '<planned start>');`
    then the Event Manager inserts `race_staff` rows (`event_id, profile_id, role, station_id` — judges and station screens carry their `station_id`). Every grant is audited.
    *If you prefer, I prepare these as a reviewed SQL script with placeholders; you run it.*

**F. Backups**
17. Confirm daily backups are on; enable PITR for production; note the retention window. Before race day take a manual backup/dump and record the timestamp (§8).

---

## 4. Vercel setup sequence

1. **New Vercel project** (own name, e.g. `the-ninth-race`), imported from the repository. It must **not** be the gym web project.
2. Settings → General: **Root Directory** `apps/race`; enable *Include source files outside of the Root Directory* (it imports `packages/race`); Framework preset **Next.js**; Node.js **20.x** (repo engines `>=20`; local checks ran on 22 — pick 20 or 22 and keep staging = production).
3. Build & install commands (monorepo, pnpm 9 per `packageManager`):
   - Install: `cd ../.. && pnpm install --frozen-lockfile`
   - Build: `cd ../.. && pnpm turbo run build --filter=@9thround/race-web`
   - Output: default (`.next`). The `prebuild` script copies the OCR engine into `public/race-ocr` (≈ 23 MB: worker, WebAssembly core, English model) — the build must show `[race-web] OCR engine files copied to public/race-ocr`.
4. **Ignored Build Step** (so gym-only commits never redeploy the race site): `git diff HEAD^ HEAD --quiet -- apps/race packages/race pnpm-lock.yaml package.json turbo.json`.
5. Environment variables (§1): `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Preview/staging values on Preview, production values on Production only. **No other variables.**
6. Domains: staging domain → Preview/branch deployment; production domain → Production. HTTPS only (required for camera access on phones and for service of the WASM OCR engine).
7. First deployment to **staging only**. Do not promote anything to production until §6–§7 pass.
8. Rollback: Vercel → Deployments → *Promote previous* (instant); the database is forward-only (§9).

---

## 5. Deployment verification (run on staging; repeat on production before opening)

**A. Database** — §3 steps 9–12 pass; `verify_deployment.sql` output archived.

**B. API / RLS from outside** (anon key only, `curl`):
- `GET /rest/v1/race_registrations?select=*` → empty/denied (anon cannot read personal data); same for `race_audit_log`, `race_performance_events`, `race_staff`.
- `POST /rest/v1/rpc/race_register_athlete` works for a valid public registration; `race_leaderboard` is readable; `race_advance_core`, `race_write_snapshot` etc. → *permission denied*.
- Storage: anonymous download of `race-evidence/...` refused; `race-event-assets` public read OK.

**C. App smoke** (real browser, https):
- `/race` loads → redirects from `/`; registration form validates and registers an athlete; `/race/e/<slug>/me` shows the athlete.
- `/race/login` → wrong password message; each staff role logs in and sees only its console (Reception, Judge station *n*, Station Screen, Master Control, Admin/Results/Evidence).
- `/race-ocr/worker.min.js` and `/race-ocr/lang/eng.traineddata.gz` return 200 with sane content types; `.wasm` served as `application/wasm`; the judge Station 09 console warms the engine without console errors.
- Judge on a phone can capture a test photo → it appears under the private bucket; Reception cannot upload; evidence is not publicly readable.

**D. Re-run the engine proof on the exact Postgres major version** (local/throw-away, **not** against Supabase): `bash supabase-race/tests/harness/run.sh` on that version (the harness builds its own database and moves its own clock; it uses test-only helpers that must never exist on a real project). Must end `ALL RACE MIGRATION TESTS PASSED` with `MODEL AGREES … 0 mismatches`.

**E. Real-clock dry run on staging** — a small event through START → pause → resume → skip → finish with a real wall clock (the staging rehearsal in §6).

**F. Sign-off record** — a dated checklist with who verified, outputs attached (verify log, harness summary, screenshots).

---

## 6. Real-device / real-network rehearsal (staging, real phones, real venue network)

**Goal:** prove on real hardware what the simulation could not: Supabase Auth/Realtime/Storage, phone browsers and cameras, venue Wi-Fi/4G, and human operators. Nothing is "simulated" here: real clock, real people.

**Kit:** ≥ 2 iPhones + ≥ 2 Android phones (current + one 2–3 years old), 1–2 tablets (Master Control, Station Screen), a laptop (Reception), one rowing machine with a real display, the venue router + one phone hotspot; screen/voice recorder for evidence.

**Roster for a mini-event** (≥ 8 volunteers, 2 heats of 3–4 athletes is enough): Super Admin, Event Manager, Master Control, Reception, 9 Judges (can be fewer people covering several stations), Station Screens.

**Scenarios and pass criteria** (each one is a pass/fail row in the sign-off sheet):

| # | Scenario | Pass criteria |
|---|---|---|
| R1 | Registration from athletes' own phones (iOS Safari, Android Chrome, in-app browsers) | registered, token page works, no layout overflow |
| R2 | Reception check-in of all arrivals at the same moment (≥ 6 devices pressing together) | each athlete exactly once; queue order = arrival order |
| R3 | START EVENT → 60 s countdown → first athlete starts at **exactly** the displayed instant on **every** screen | station screens, judges, master all show the same remaining time (±1 s of display rounding) |
| R4 | A full 3:00 + 0:30 + 3:30 cycle at every station | no early start; work ends at 3:00 on all screens; transition exactly 0:30 |
| R5 | Judge scores continuously for 3 minutes (taps ≥ 60) | every tap recorded once; live tally correct; judge sees result locked at 3:00 |
| R6 | **Judge phone loses network** (airplane mode) for 60 s during WORK, re-enable | queue badge shows pending; on reconnect actions replayed; those inside the window accepted, late ones → Master review; none lost, none doubled |
| R7 | **Offline across the 3:00 boundary** (go offline, tap, come back 2 s after the end) | late action goes to **Master review**, never silently counted |
| R8 | **Master tablet disconnects** for 2–5 min and reconnects | state identical to the always-connected screen; no action needed to "catch up" |
| R9 | **Every device off for 5 min** (kill the router), then restore | race time continues correctly; all screens show the correct athlete/phase on reconnect; starts materialise with recorded lag |
| R10 | Emergency pause (×2) with devices reading while paused | everyone shows PAUSED; race time frozen; resume restores exactly |
| R11 | **Device clock wrong** (set a phone 3 minutes fast/slow) | screens and actions follow *server* time; nothing accepted/rejected differently |
| R12 | Phone lock / background tab / low-power mode for 30–60 s | on return the screen re-syncs; no stale countdown |
| R13 | Slow network (throttle to ~1 Mbit/s or poor 4G) | actions still arrive (latency only); no duplicates |
| R14 | SKIP and DNF during the event | nobody else shifts; results/ranking exclude as designed |
| R15 | Station 09: 10 real photos of the real rowing display (see §7) | capture → read → judge confirms; retake works; Master correction audited |
| R16 | Results: compute rankings, publish, open the public results page on a phone | per-category tables correct; ties preserved |
| R17 | Audit export: pull the audit/ledger for the event | every R-scenario above is reconstructable (pauses, skip, offline replays, reviews, corrections) |
| R18 | Role abuse attempts by the Event Manager/volunteers (Reception tries to skip, Judge opens another station, Station Screen tries to score) | all refused with the role message |

**Record:** device model/OS/browser per role, venue network, timestamps, video of the Master and one Station Screen, a list of any deviation. **Fail rule:** any lost/duplicated/mis-timed action, any unexplained state difference between devices, or any role leak is a **NO-GO** until root-caused (and, if it is race logic, it comes back to me as a bug report before any change).

---

## 7. Real-photo OCR validation procedure (closes "REAL-WORLD OCR VALIDATION = PENDING")

**Why:** the reader (tesseract.js on the judge's phone) has only been tested on synthetic images. The *workflow* is safe (a judge confirms every reading; a bad read falls back to retake / Master correction), but its **accuracy on your real monitor under real lighting** is unknown.

**Collect (staging rehearsal day or earlier):**
1. ≥ **30 photos** of the real rowing-machine display, taken **the way a judge will** (judge's own phone, camera screen from the app/handset, normal distance), covering: different distances (short, ~500, 800–1,100, 1,300+), glare/reflection, dim and bright lighting, slight angles, at least 3 deliberately poor photos (blurry/obstructed), and each machine model that will be used. No athlete faces; crop if necessary.
2. Two people independently read the number from each photo; disagreements are removed or settled by a third. File names only (`IMG_001.jpg`…), photos stored in the vault/drive — **never committed to git**.

**Truth file** `truth.csv` (one line per photo; `none` = genuinely unreadable):
```
file,distance_m
IMG_001.jpg,842
IMG_002.jpg,1090
IMG_017.jpg,none
```

**Run** (needs the repo + `playwright` + built OCR assets; `NODE_PATH=$(npm root -g)` if playwright is global; `CHROMIUM_PATH` optional):
```
node docs/race/scripts/ocr-photo-validation.mjs <photos-dir> <truth.csv> --out ocr-report.json
```
It runs the **same pipeline as the phone** (Otsu binarisation → tesseract.js LSTM from `public/race-ocr` → `parseRowingDistance` → `classifyOcr`) and prints, per photo, truth vs read vs confidence vs class (SUCCEEDED / LOW_CONFIDENCE / FAILED).

**Acceptance (all required):**
- **0 confident-wrong readings** — a wrong number classified SUCCEEDED (the dangerous case a tired judge taps through).
- **0** unreadable photos read with confidence.
- ≥ **90 %** of readable photos read exactly (the rest must land in LOW_CONFIDENCE/FAILED, i.e. the judge is warned).
- Verdict line `REAL-WORLD OCR VALIDATION = PASSED` (exit code 0).

**If it fails or accuracy is low:** do **not** change anything silently. Send me `ocr-report.json`; the known lead from the synthetic self-check is that page-segmentation mode matters (the shipped AUTO read isolated large digits poorly while sparse-text mode read them well, a third mode produced confident errors). Any reader change is a *separate, approved* change, re-validated on the same photo set plus the full harness. Until PASSED, run Station 09 knowing the fallback: FAILED/LOW → retake → Master Control manual correction (fully audited).

**Then:** repeat a short version (10 photos) **on the production phones/handsets on race morning** and attach the report to the sign-off.

---

## 8. Production go-live checklist (only after staging is signed off)

- [ ] Staging: §3–§6 all passed; §7 PASSED; sign-off sheet complete.
- [ ] Abuse protection for public registration in place (§0 #9) *or* registration is invitation-only for this event.
- [ ] Production project created from scratch by the **same** sequence (§3), production keys only in the production Vercel environment.
- [ ] `verify_deployment.sql` clean on production; archived.
- [ ] Super Admin has MFA; staff accounts created; **roles assigned only for the real event**; test data absent from production.
- [ ] Backups: daily backups on; PITR on; **manual backup taken the evening before** and its timestamp recorded; restore procedure read by the operator (restore into a *new* project, never over the live one).
- [ ] Change freeze from T-48 h: no migrations, no deploys, no dashboard setting changes (Auth, storage, realtime).
- [ ] Race-morning checks (60 min before first heat): `verify_deployment.sql` OK · login for each role · one judge test action on a clearly named dry-run event (`…-dryrun`; production holds no other test data; cancel it with an audit reason afterwards) · OCR 10-photo check on the real phones · time-sync sanity (server time vs phone display) · venue network + hotspot fallback tested.
- [ ] On-site roles and escalation: who presses START, who owns the laptop for Reception, who is the technical lead, who decides pause/no-go.

## 9. Rollback & incident rules

- **App**: Vercel *Promote previous deployment* (seconds). The app has no hidden state; the database is the system of record.
- **Database**: migrations are forward-only. A defect found *before* the event → fix forward with a new, reviewed migration tested on the harness and staging first. A defect found *during* the event → **do not hot-patch**; use the system's own tools (pause, correction with reason, Master review) and record it; fix after.
- **Data loss / corruption**: restore from PITR/backup into a **new** project, verify, repoint (re-deploy with new `NEXT_PUBLIC_*`) — never overwrite the live one without an explicit decision.
- **Secrets exposure**: rotate the exposed key in the dashboard immediately (anon/service-role), update Vercel, redeploy.
- **Never**: connect the gym project, reuse gym keys, share a Vercel project or an Auth user pool between the two systems.

## 11. Registration abuse protection (L6) — focused and minimal

**Today:** the public form calls the registration RPC directly from the browser with the anon key; there is no rate limit or CAPTCHA (Phase 4 / checkpoint residual risk). **Scope rule:** protect that one entry point; do not change what registration collects, how race numbers/payment/duplicates work, or any race logic.

**Layer A — required (database-side, cannot be bypassed by calling the API directly):**
* A small `race_registration_attempts` table (append-only: `ip_hash`, `event_id`, `outcome`, `created_at`) and a check at the very top of the public registration RPC:
  * per client IP (from PostgREST's `request.headers` → `x-forwarded-for`, stored **hashed with a per-project salt**, never raw): max **N** attempts per **10 min** (default 8) and **M** per hour (default 30);
  * per event, a global ceiling per minute (default 60) as a flood brake;
  * over the limit → refused with `RACE_RATE_LIMITED` (HTTP-friendly message in the form); successful and refused attempts are counted; old rows pruned by the next call.
* Limits are **per-event settings with safe defaults** so race-day staff registering many athletes from the venue network are not blocked: staff registration (`race_staff_register_athlete`) is **not** limited by IP.
* Honest limits: an attacker rotating IPs is slowed, not stopped; the existing duplicate-person check, the registration cap/closing, and payment-confirmation-before-heat rules remain the real integrity layer (an unpaid registration cannot take a start slot).

**Layer B — optional, recommended before *advertising* the link (your choice, §0 item 5):** Cloudflare Turnstile (free, privacy-friendly). Because the browser talks to Supabase directly, a CAPTCHA only helps if verified server-side: a thin Next.js route handler verifies the Turnstile token with the secret, then calls the RPC. To keep it unbypassable the RPC would also have to require a short-lived server-signed pass — **that is a larger change**; recommendation: ship **Layer A now**, add Layer B only if abuse is actually observed or the link goes to a large public audience.

**Delivery:** one new migration (table + check; RPC changes limited to the guard call), unit/harness tests (limit hit, limit reset, staff not limited, hashed IP only, no personal data stored, concurrency: 40 simultaneous submissions from one IP → exactly the allowed number accepted), full harness + Phase 12 simulation re-run (the simulation registers through the public RPC, so its limits must be configured for the test event), runbook §5 B gains a rate-limit probe. **Implementation starts only after the execution-step go-ahead.**

## 12. Idempotent staging seed scripts (L7) — specification, NOT executed

Location (to be written after this document is approved): `supabase-race/seed/staging/` — **no secrets, no real emails** in git (emails come from a gitignored/off-repo roster file passed with `psql -v`).

| File | Does | Idempotency |
|---|---|---|
| `00_preflight.sql` | read-only: asserts it is run on the **staging** project (a `race_events`-free or staging-flagged check + `select current_database()`/project marker you confirm), migrations present, `race_profiles` rows exist for every roster email; prints what is missing | pure SELECT |
| `01_event.sql` | creates the first staging event via the real RPC `race_create_event(slug, date, name, tz, planned_start)` **only if the slug does not exist**; sets registration fee/status via the existing RPCs; assigns the event's rules default | `if not exists (slug)` guard; re-run prints `already exists` and changes nothing |
| `02_staff.sql` | inserts `race_staff` rows for the roster (Event Manager, Master Control, Reception, 9 Judges with `station_id` 1–9, Station Screens) from `:roster_csv` | `insert … on conflict do nothing`/re-activate; never deletes; each grant is audited by the existing trigger |
| `03_verify_seed.sql` | read-only report: event, status, one row per staff member with role/station, counts (must equal the roster), no extra privileges, no Super Admin flags besides the owner | pure SELECT |

How they run (documented, not executed): `psql "$RACE_DATABASE_URL" -v ON_ERROR_STOP=1 -v roster_csv=… -f …` after `select set_config('request.jwt.claim.sub', '<super-admin-profile-uuid>', true)` + `set local role authenticated` so the **real RPCs and RLS** apply and the audit log records the Super Admin, exactly as in production. A dry run against a throw-away database built by the harness (with fake roster emails) is part of the approval of the scripts; running them twice must produce identical state and **zero** new rows the second time.

## 13. Deployment & rollback commands (exact; to be run only at the execution step)

**Staging deployment (operator shell; values from the vault, never typed into chat):**
```
# 0. gate evidence is committed (§3A); isolation check is green
bash supabase-race/tests/check-isolation.sh

# 1. Supabase (race project only)
export SUPABASE_ACCESS_TOKEN=…        # from vault; revoke after the window
cd supabase-race
supabase login
supabase link --project-ref "$STAGING_REF"       # the CLI must echo the STAGING ref — if not, stop
supabase migration list                           # remote empty, local = N migrations
supabase db push                                  # applies N migrations
supabase migration list                           # all applied
export RACE_DATABASE_URL=…                        # staging direct connection string, from vault
psql "$RACE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "select version()"            # equals the §3A version
psql "$RACE_DATABASE_URL" -v ON_ERROR_STOP=1 -f verify/verify_deployment.sql  # only OK lines
psql "$RACE_DATABASE_URL" -v ON_ERROR_STOP=1 -v email="'<owner email>'" -f bootstrap/promote_super_admin.sql
# seed (§12) — after approval:  00_preflight → 01_event → 02_staff → 03_verify_seed

# 2. Vercel (race project only)
vercel link --project the-ninth-race --yes
vercel env ls                                     # only the §1 names
vercel deploy                                     # preview/staging build (never --prod here)
curl -sI https://<staging-domain>/race            # 200/307 as expected
```
**Production** repeats the same list with `$PROD_REF`, the production vault entries, `vercel deploy --prod` (only after the staging sign-off and the go-live checklist §8), and the manual backup first.

**Rollback matrix**

| Layer | Trigger | Command / action | Notes |
|---|---|---|---|
| App (Vercel) | bad deploy, wrong env, UI regression | `vercel rollback <previous-deployment-url>` (or dashboard → *Promote previous*) | seconds; no data impact; re-run §5 C |
| App config | wrong `NEXT_PUBLIC_*` | fix in Vercel env → redeploy (values are inlined at build) | check the ref in the URL |
| Database, *before* the event | defect in a migration | **fix forward**: new reviewed migration, harness on the §3A version, staging first | migrations are forward-only; never edit an applied one |
| Database, *during* the event | wrong score/state | **no hot-patch**: pause, use corrections with reason / Master review, record; fix after | system tools are the audited path |
| Database, corruption/loss | — | restore PITR/backup **into a new project**, run `verify_deployment.sql`, repoint (new URL/keys → Vercel env → redeploy) | never overwrite the live project |
| Secrets | key exposed | rotate in the dashboard → update Vercel → redeploy → revoke CLI token | |
| Whole cutover | production go-live fails checks | do not open registration; keep the production URL unpublished; fall back to staging only if it is a faithful copy | decided by the technical lead |

## 14. What I will do / not do, and where I stop

**Allowed after you approve each gate:** write helper scripts and reviewed SQL (staff/event bootstrap with placeholders), walk you through the CLI/Vercel steps, interpret verify/harness/OCR outputs, and prepare the rehearsal sheets. **I will not**: create or connect any Supabase/Vercel project, ask for or store any key/token/password, run anything against hosted infrastructure, apply migrations anywhere but the throw-away test database, change race logic/scoring/timing, or add features (including the CAPTCHA) without a separate explicit approval.

**Stopped.** Waiting for your explicit **"approved: infrastructure execution"** (and the 'still needed' items in §0) before touching any staging or production infrastructure, creating any project, linking the CLI, pushing migrations, deploying, or implementing §11/§12.
