# PostgreSQL 17.11 compatibility validation — THE NINTH

**Result: PASS.** Compatibility validation only. Nothing was pushed to the real Supabase project, the CLI was not linked, nothing was configured on Vercel/DNS/SMTP/production, and the Supabase project was not touched.

## 1. The exact PostgreSQL used

`PostgreSQL 17.11 on x86_64-pc-linux-gnu, compiled by gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0, 64-bit` — built from the **upstream release tag `REL_17_11`** (commit `083ac033419f690758508e08c1736089384bbee8`, "Stamp 17.11."), the same version as the staging target. The harness prints this line at the start of every run and **fails if the server is not exactly 17.11** (`EXPECT_PG_VERSION`).

Why a source build: this sandbox has no PostgreSQL 17 package (Ubuntu 24.04 ships 16; the PostgreSQL download hosts and Docker Hub are blocked by the egress policy, and distribution/npm builds stop at 17.10). The source was fetched from GitHub. Build options, chosen to match a normal Supabase-style server: `--with-openssl --with-icu --with-readline --with-zlib --with-libxml --with-libxslt`, plus all of `contrib`. **Disclosure:** my first build omitted libxml; on it every suite passed (1,325 assertions, simulation 0 mismatches) and only the restore-fingerprint step failed with "unsupported XML feature". That was a gap in my build options, not a behavioural difference; I rebuilt with XML support and **re-ran everything from scratch** — the results below are from the rebuilt server only.

Not identical to Supabase's managed server: it is Supabase's own packaging (extensions, `pg_cron`, `supautils`, logical-replication settings, their kernel/ICU). The harness uses a Supabase *shim*, not their image, so Auth/Realtime/Storage/PostgREST are still untested here — those are covered by the staging checks in the runbook (§5).

## 2. Results

| Requirement | Result |
|---|---|
| Same full assertion suite (suites 00–28, incl. role matrix, tally tie-order, registration abuse protection, rowing evidence, rankings…) | **PASS — 1,325 assertions**, 0 failures. The set of 1,394 `PASS` lines is **identical** to the PostgreSQL 16 run of the same commit (a diff of the two logs differs in one number only: a timing-dependent pause total in a storm, 4,294 vs 4,175 ms, both asserted equal to the exact sum of the pauses) |
| Same independent rulebook model, 51-athlete / 6-heat final simulation inside the full run | **`MODEL AGREES: 8729 independent checks, 0 mismatches`** |
| Final simulation repeated ≥ 6 consecutive times (stop on first difference) | **6 / 6 PASS, 0 mismatches each** — run 1: 8,737 checks · run 2: 8,709 · run 3: 8,745 · run 4: 8,712 · run 5: 8,715 · run 6: 8,727 (check counts vary with the randomised check-in/slot order; all 0 mismatches) |
| Registration abuse protection tests (suite 28, 79 assertions) | **PASS** |
| Phase 14 concurrency storms | **PASS** — 30 simultaneous from one IP → exactly 8 accepted / 22 refused / 8 counted / race numbers N001–N008 gapless; 40 IPs with an event ceiling of 10/min → exactly 10 accepted / 30 refused; one person ×12 at once → 1 registration, 11 duplicates, 1 unit of quota; 8 identical corrections → exactly 1 applied |
| All other concurrency storms (check-in ×50, START ×12, pauses/resumes, SKIP vs auto-start, publish ×8, rankings ×10, 30-session duplicate judge action, 320 actions racing the 3:00 lock, OCR upload/confirm/review ×8…) | **PASS** |
| Seed-script dry run | **PASS 4/4** — preflight refusals, first run (15 audited grants through real RLS), **second run a no-op** (0 new events/staff/audit rows), drift detection |
| `verify_deployment.sql` (harness step 3b), isolation, restore & fingerprint (row counts and every function body identical after dump/restore, audit history restored) | **PASS** |
| Behavioural differences vs PostgreSQL 16 | **None found** |

Verdict line: **`ALL RACE MIGRATION TESTS PASSED`** on PostgreSQL 17.11.

## 3. PostgreSQL 17–specific issues

* **None affecting behaviour.** The only visible difference: one harness-shim warning about `wal_level` now quotes the setting name (`"wal_level"`), cosmetic and present on 16 as well.
* Observed during the run, no action needed: the harness database uses the libc `C.UTF-8` collation (as before); ICU is compiled in but not used by the tests. Supabase projects default to the same libc-style behaviour for these tables (no collation-sensitive ordering is part of the race rules — rankings sort on numbers and race numbers).

## 4. Changes made

* Test tooling only: `run.sh` gained `PGBIN` (pin the PostgreSQL under test), prints `select version()` first, and `EXPECT_PG_VERSION` (fail if the server version differs).
* `supabase-race/supabase/config.toml`: `major_version` 15 → **17** (matches the staging project; this is the repository's local Supabase CLI config — nothing was applied anywhere).
* Runbook §3A marked **PASSED on 17.11**.
* No migration, race logic, scoring, timing or app code changed.

## 5. Status

Compatibility gate **PASSED** (PostgreSQL 17.11). Stopped — waiting for your approval before the next infrastructure step (nothing has been linked, pushed, deployed or configured).
