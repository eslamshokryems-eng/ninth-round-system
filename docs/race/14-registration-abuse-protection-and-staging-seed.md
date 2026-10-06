# Registration abuse protection (§11) + staging seed scripts (§12) — report

Scope as approved: **§11 database-side abuse protection only (no Turnstile)** and **§12 idempotent staging seed scripts exactly as specified**. Nothing else changed: no race logic, scoring or timing; no Supabase project created or linked; no Vercel/DNS; nothing deployed; no credentials requested or committed. The seed scripts were **not executed against any real project** — only against the throw-away test database with fake `.invalid` accounts.

## 1. §11 — what was built

Migration `20260930000007_race_registration_abuse_protection.sql` (18th migration).

| Piece | Behaviour |
|---|---|
| `race_register_athlete()` | **Same signature, result and grants.** Now calls `race_registration_guard()` first, then the unchanged `race_register_core()`. |
| Limits (defaults) | per client IP **8 / 10 min** and **30 / hour**; per event **120 / minute**. Singleton settings row; per-event overrides in `race_registration_limit_overrides`. |
| `race_set_registration_limits(event, per_ip_10min, per_ip_hour, per_event_minute, enabled, reason)` | Event Manager (or Super Admin) of that event only; reason mandatory; values range-checked; audited as `race.registration.limits`. |
| Exemptions | `race_staff_register_athlete()` never calls the guard; an authenticated member of the event's operations staff using the public form is skipped. A signed-in non-staff account is limited like anyone. |
| IP source | PostgREST `request.headers`; configurable header and hop (default: **last** `x-forwarded-for` entry, so a client-prepended address cannot create a new identity). No IP known (direct DB session) → per-IP limits skipped, event ceiling still applies. |
| Privacy | The IP is **never stored**. Only `sha256(salt:ip)` (64 hex) in `race_registration_attempts`; the salt is in `race_registration_settings`, unreadable by every API role. |
| Counting | A registration that **completes** consumes one unit. A refused/duplicate/invalid call raises → the whole transaction rolls back, bookkeeping included → it consumes nothing and a refusal never extends a lock-out. |
| Concurrency | Transaction-scoped advisory locks per event then per IP (fixed order, no deadlock) → limits are exact under parallel sessions. |
| Housekeeping | Rows older than 2 h for the event are pruned by the guard. The three new tables have RLS on and no client privilege. |

Client: `RACE_RATE_LIMITED` gets a friendly message in `packages/race/domain/race-error.ts` (+ unit assertion). No other app change.

## 2. §11 — tests and results

New suite `tests/28_registration_abuse.sql` (**79 assertions**) against the real public RPC with PostgREST-style headers, plus three new concurrency storms, plus an updated structure count (30 → 33 race tables: the three new ones).

| Requirement | Evidence (all PASS) |
|---|---|
| Normal registration | succeeds from a PostgREST caller; one completed registration = one counted attempt; contract unchanged (same result columns, still callable by anon) |
| Per-IP limits | 3/10 min: 3 accepted, 4th `RACE_RATE_LIMITED`, **nothing created**, no quota consumed by the refusal, another IP unaffected, retry still refused, allowed again after 11 min; hourly limit 4: 5th refused, still refused at +30 min, allowed after the hour |
| Per-event limits | 4/min across 4 different IPs → 5th refused even from a new IP or a caller with no IP; open again after a minute |
| Hashed-IP behaviour | stored value equals `sha256(salt:ip)` computed independently; raw address appears nowhere in the table; every value is 64-hex; same IP → same hash, different IP → different hash, different salt → different hash; no dotted-quad stored anywhere |
| IP source / spoofing | prepending addresses to `x-forwarded-for` does not evade (counted against the real last hop; spoofed addresses never recorded); hop position configurable; no-IP callers skip per-IP limits but not the event ceiling |
| Staff exemption | Reception door-registers 6 athletes in a row under 1/1/1; event staff using the public form not limited and not counted; a signed-in stranger is limited; a Judge still cannot register athletes (exemption is not a new permission) |
| Idempotency / quota | duplicate person re-submitted ×2 → `RACE_ALREADY_REGISTERED`, **no quota used**; invalid input (`RACE_INVALID_NAME`) consumes none; remaining quota intact then exact refusal; setting the same limits twice → same state and ONE override row; the settings seed re-applies without a second row; disabled override → nothing refused, nothing recorded |
| Permissions | anon cannot read attempts/settings/salt or call the guard/IP reader/limit setter; not even the Event Manager can read the salt/attempts through the API; reason mandatory; out-of-range refused; every change audited; Reception, Judge, Master Control and another event's manager are refused |
| Concurrency (real parallel sessions) | **30 simultaneous from one IP, limit 8 → exactly 8 accepted, 22 `RACE_RATE_LIMITED`, exactly 8 counted, race numbers N001–N008 gapless**; **40 simultaneous from 40 IPs, ceiling 10/min → exactly 10 accepted, 30 refused, 10 counted**; **one person ×12 at once → 1 registration, 11 clean duplicates, exactly 1 unit of quota** |

The existing 40-simultaneous registration storm, the 51-athlete registrations of the Phase 12 simulation and every earlier suite pass unchanged (no IP present → only the generous 120/min event ceiling applies).

## 3. §12 — seed scripts

`supabase-race/seed/staging/`: `00_preflight.sql`, `01_event.sql`, `02_staff.sql`, `03_verify_seed.sql`, `README.md`, `roster.example.csv`, `.gitignore` (the real `roster.csv` never enters git). Run order, inputs and variables are in the README and runbook §13. Safety rails: staging only (`target_env=staging`, slug must end `-staging` or `-dryrun`), actor must be an active Super Admin, every roster email must already have an Auth user, nothing is ever deleted.

Dry run `tests/harness/seed_dryrun.sh` (step 5d of `run.sh`; `ONLY_SEED=1` runs it alone), against the throw-away database with 16 fake accounts and the **real** `bootstrap/promote_super_admin.sql`:

| Check | Result |
|---|---|
| Preflight is read-only and refuses | a production-looking slug, `target_env=production`, a non-Super-Admin actor, an unknown email, a judge without a station, a station on a desk role — PASS |
| First run | event created through the real RPC, registration opened, fee/venue set, **15 grants through real RLS, all audited**, verification OK (9 judges covering 9 stations) — PASS |
| **Second run** | **no-op: 0 new events, 0 new staff rows, 0 new audit rows**, same fee — PASS |
| Drift | a deactivated roster member and an extra grant fail verification; a deactivated grant is re-activated; the scripts never delete — PASS |

## 4. Full regression

| Gate | Result |
|---|---|
| `supabase-race/tests/harness/run.sh` (full) | **1,325 assertions** (1,246 + 79 new), all concurrency storms (incl. 3 new), final end-to-end simulation `MODEL AGREES: 8720 independent checks, 0 mismatches`, seed dry run 4/4, restore/fingerprint — `ALL RACE MIGRATION TESTS PASSED` |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | clean / pass / pass (264 race package unit tests) |
| `check-isolation.sh` | pass (gym files identical to `527f705`; no secrets/.env) |
| Postgres version | **still run on 16 only** — the §3A gate (run the harness on the exact version Supabase offers, 15 or 17) is **not yet done**; it is part of infrastructure execution and still blocks project creation |

## 5. Decisions / follow-ups for you

1. **Venue Wi-Fi shares one IP**: athletes self-registering on-site would share the 8/10 min limit. Prefer Reception registration on the day, or raise that event's limits with `race_set_registration_limits` before doors open (documented in runbook §11).
2. **Real client-IP header** must be confirmed on the staging project (probe in runbook §11/§5); a one-line settings UPDATE adjusts it — no migration.
3. Known limit (accepted design): probing with invalid/duplicate data is not counted (creates no data); IP rotation slows but does not stop an attacker; the duplicate-person check and "unpaid cannot take a start slot" remain the integrity layer.

## 6. Status

§11 and §12 complete and tested. **Stopped** — infrastructure execution has not begun: no Supabase project created or linked, no migration pushed, no Vercel/DNS, no deployment, no credentials requested. Waiting for your explicit "approved: infrastructure execution" (plus the roster, event facts, domains and SMTP sender listed in the runbook).
