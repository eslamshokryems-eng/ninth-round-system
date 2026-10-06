# THE NINTH — production infrastructure checklist & deployment runbook

**Status: PLAN ONLY. Nothing in this document has been run.** No Supabase project exists, nothing is connected, no credentials were requested, nothing is deployed. Race logic, scoring and timing are frozen at the state accepted in Phase 12 (`docs/race/12-final-end-to-end-validation.md`).

Every step below is gated: **I do not start step 0 of §3 until you say so explicitly**, and I will stop again after staging (§3 → §6) and before production (§8).

---

## 0. Decisions I need from you (before any infrastructure step)

| # | Decision | Why / default |
|---|---|---|
| 1 | **Supabase organisation & owner account** for THE NINTH (must not be the gym's) | Separate project, keys, Auth users, billing. |
| 2 | **Plan / tier** | Use a paid tier for production: the race needs a project that never auto-pauses, daily backups and ideally Point-in-Time Recovery (confirm current plan terms in the dashboard). Staging may be the smallest tier. |
| 3 | **Region** | Closest to the venue (Cairo → pick the nearest EU/Middle-East region offered). Latency is not a correctness issue (server time is authoritative) but affects judge UX. |
| 4 | **Postgres major version** | `config.toml` says 15; my test database ran PostgreSQL 16. Pick the project's version, and I re-run the full harness on that exact major version (§5, step D) before staging. |
| 5 | **Vercel team/account** and the **domain** (e.g. `race.<your-domain>`), staging subdomain too | Own Vercel project, separate from the gym web app. |
| 6 | **Event facts for the first staging event** | slug, date, planned start, venue name, fee. |
| 7 | **Staff roster** (emails) for staging rehearsal: 1 Event Manager, 1 Master Control, 1–2 Reception, 9 Judges, up to 9 Station Screens | Accounts are created by invitation, no self-sign-up. |
| 8 | **SMTP sender** for Auth emails | Supabase's default mailer is rate-limited; use your own sender for the event. |
| 9 | **Abuse protection for public registration** (Turnstile/CAPTCHA or edge rate limiting) | The public form has none today (Phase 4 / checkpoint residual risk a). Required before the registration link is public. *(A code change — needs your explicit approval as it is not part of the frozen scope.)* |

---

## 1. Environment variables — the complete list

THE NINTH's browser code reads **exactly two** variables. Everything else is operator-side and never reaches Vercel or the browser.

| Variable | Where it is set | Browser-visible | Value | Notes |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel project (Production **and** Preview, separate values per environment) + local `apps/race/.env.local` | yes (by design) | `https://<race-project-ref>.supabase.co` | Inlined at **build** time → changing it needs a redeploy. Never the gym project's URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same | yes (by design; RLS is the boundary) | the project's anon/public key | Inlined at build. |
| `SUPABASE_SERVICE_ROLE_KEY` | **nowhere in Vercel.** Operator password manager only; used only by one-off admin scripts if ever | **never** | service-role key | Bypasses RLS. `turbo.json` lists it in `globalEnv` (hashing only) — do **not** define it on the Vercel project. `check-isolation.sh` fails the build if it appears in browser code. |
| `RACE_DATABASE_URL` | operator's shell only (never committed, never Vercel) | never | direct (non-pooled) Postgres connection string of the race project | Used for `psql` verification and the one-time bootstrap. |
| `SUPABASE_ACCESS_TOKEN` | operator's shell only | never | personal access token for the Supabase CLI | Only for `supabase link/db push`. Revoke after the deployment window. |
| `SUPABASE_DB_PASSWORD` | operator's shell only | never | the database password | Prompted by `supabase db push` (or exported for the session). |

Rules: no `.env*` file other than `*.example` is committed (checked by `check-isolation.sh`); secrets are never pasted into chat, tickets or the repo; staging and production use **different** projects, keys and Vercel environments.

Future (only if approved in §0 #9): the CAPTCHA/rate-limit provider's site key (public) and secret (server-only) — to be added to this table then.

---

## 2. Pre-flight gate (nothing created yet)

- [ ] Phase 12 accepted ✔ (this message).
- [ ] `git` branch `claude/ninth-race-system-bo9jaj` merged / chosen as the deployment ref (your call; I do not open a PR unless asked).
- [ ] §0 decisions answered.
- [ ] Accounts exist and 2FA is on: Supabase owner, Vercel owner, DNS provider.
- [ ] Password manager vault "THE NINTH" prepared (staging + production entries).
- [ ] Gym isolation re-checked on the deployment ref: `bash supabase-race/tests/check-isolation.sh` all PASS (gym files identical to `527f705`).
- [ ] Full local harness green on the **chosen Postgres major version**: `bash supabase-race/tests/harness/run.sh` (§5 D).

---

## 3. Supabase setup sequence (staging first, then production — repeat the whole list per project)

> Every command is run by the operator from `supabase-race/`. The CLI must print the *race* project ref before anything is pushed. If it prints any other ref → stop.

**A. Create the project**
1. Dashboard → New project in the **THE NINTH organisation** (named `the-ninth-staging`, later `the-ninth-prod`), chosen region and Postgres version, strong DB password (generate in the password manager).
2. Record in the vault: project ref, URL, anon key, service-role key, DB password, direct connection string. **Do not paste them in chat.**

**B. Auth settings** (Dashboard → Authentication) — `config.toml` documents intent only; these must be set by hand:
3. Sign-ups **disabled** (Providers → Email → *Allow new users to sign up* off); email **confirmation required**; password policy (≥ 12 chars); JWT expiry 3600 s.
4. URL configuration: Site URL = the race site (`https://race.<domain>` / staging URL); additional redirect URL `…/race/login`.
5. SMTP: your own sender (§0 #8); test an invite email.
6. MFA enabled for the Super Admin account.

**C. Schema** (CLI, from `supabase-race/`)
7. `supabase login` (uses `SUPABASE_ACCESS_TOKEN`) → `supabase link --project-ref <THE-NINTH-REF>` → confirm the printed ref.
8. `supabase db push` — applies **all 17 migrations** in order (`20260928000000_race_foundation` … `20260930000006_race_tally_deterministic_order`). They are forward-only and tracked in *this* project's migration history. *(The earlier checkpoint text said "11 migrations"; the current number is 17.)*
9. `supabase migration list` → 17 applied, none pending.

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

## 10. What I will do / not do, and where I stop

**Allowed after you approve each gate:** write helper scripts and reviewed SQL (staff/event bootstrap with placeholders), walk you through the CLI/Vercel steps, interpret verify/harness/OCR outputs, and prepare the rehearsal sheets. **I will not**: create or connect any Supabase/Vercel project, ask for or store any key/token/password, run anything against hosted infrastructure, apply migrations anywhere but the throw-away test database, change race logic/scoring/timing, or add features (including the CAPTCHA) without a separate explicit approval.

**Stopped.** Waiting for your explicit approval and the §0 answers before touching any production (or staging) infrastructure.
