# 18 — THE NINTH League: league role management, public edge cache & rate limiting, security audit

Status: **implemented and tested locally. Nothing is deployed, configured or applied.** The migration (`supabase-race/proposed/league/20261101000001_race_league.sql`) is still PROPOSED and unapplied; no remote database, Supabase setting, Vercel project, DNS, SMTP or secret has been touched; no role has been granted to anyone.
**Not public-launch ready** — see §6 for exactly what is still missing.

---
## 1. League role management

### What exists
*Where:* `/race/league/admin/<seasonId>` → tab **Staff & roles**. *Data:* the overview RPC (`race_league_admin_overview`) lists the season's staff with a name and a **masked** e-mail hint (`a***@example.com`). *Operations:* two database functions, both `SECURITY DEFINER`, both re-checking the caller:

| Operation | Function | Who may call it |
|---|---|---|
| Look an account up by e-mail | `race_league_find_account(p_email)` | **Super Admin only** |
| Appoint / remove one account in one role of one season | `race_league_set_staff(p_season, p_profile, p_role, p_active, p_reason)` | **Super Admin** for `LEAGUE_ADMIN`; a season's league administrator for `JUDGE` / `REVIEWER` |

### Why this is the safe mechanism (and why there is no service-role key)
The repository's identity directory is `race_profiles`, filled by an existing trigger from `auth.users` (id, e-mail, name). A Super Admin can already read it under RLS. `race_league_find_account` reads it (plus `auth.users.email_confirmed_at` / `banned_until` for the account's state) **inside the database**, so:
* the e-mail the person types is only a **search key**; the database returns the account **id**, and every later operation is by that id — a typed or forged address proves nothing and grants nothing;
* the service-role key is **not used, not defined and not needed** (the existing runbook forbids it in Vercel/browser; `check-isolation.sh` fails if browser code references it);
* there is no Next.js server action or API route for this: the project's server-side boundary is the database RPC, with the caller's own session.

### Rules enforced by the database (each has a negative test)
* Only a Super Admin appoints or removes a **league administrator**. A league administrator cannot appoint another (or themselves); a plain account, a judge, a reviewer or an anonymous caller cannot promote themselves to anything.
* The target must exist in the directory, be active, not suspended, and — for an administrator — have a **confirmed e-mail address**. Missing account / season, invented role, missing reason → refused with a typed error.
* A **reason is mandatory** and, with actor, target, role and season, is written to the existing audit log (`league.staff.appoint` / `.remove`). Lookups are audited too (`league.account.lookup`: who looked, whether something was found — **never the e-mail address**).
* **Idempotent**: repeating a request returns `changed:false`, writes no second audit entry and creates no second row.
* **Concurrency**: both operations lock the season row. Proven with two real parallel sessions: from a live season with three administrators, two simultaneous removals → exactly one succeeds, the other is refused, two remain (removing the lock makes that test fail).
* **Two independent administrators**: a season cannot be **activated or published** with fewer than two distinct active `LEAGUE_ADMIN` accounts (a Super Admin's implicit access does not count), and a live (active or published) season can never be dropped below two by a removal. A refused removal leaves every row untouched.
* A completed season's staff is final. A removed administrator loses access at once.

### The screen
Shows the administrator count against the requirement, every staff row (name, masked hint, role, status), and — **for a Super Admin only** — "Look up account" (e-mail → found / not found / unconfirmed / inactive), role + reason, **Appoint**, and **Remove…** with a separate confirmation and reason. Loading, validation and error states come from the database's typed errors; success is shown only after the server confirmed it, and a refused action leaves the displayed state truthful (re-read from the server). Everyone else sees the list read-only.
*Limit:* because only a Super Admin can look accounts up, a season's league administrator cannot appoint judges from the screen (the database allows it by id; the lookup does not). Decide whether that is acceptable.

### What this does NOT do
**No role is granted by this work, to anyone.** The intended identities (`eslamshokry.ems@gmail.com`, `triogym.10@gmail.com`) appear only here, as the intended administrators. After approval and activation: both people sign in once (so the directory contains them), a Super Admin creates the season, looks each address up, confirms the displayed account, and appoints each with a reason. The e-mails are not in any code, fixture or test (fixtures use `@example.test`).

---
## 2. Public edge cache

### Why a new layer was needed
Before this work the phone/TV pages called the three public database functions **directly from the browser** — there was nothing to cache or limit. They now call a same-origin **public API** (`/race/league/api/...`); the browser no longer sends public reads to Supabase.

### Architecture
```
browser/TV ──GET──▶ Vercel CDN (shared cache, s-maxage) ──miss──▶ Next.js route handler (Node)
                                                                   │ validate → rate limit → in-process cache (single-flight)
                                                                   ▼
                                                    POST /rest/v1/rpc/race_league_public_* (anon key only) ──▶ database allow-list
                                                                   ▼
                                                    server-side allow-list sanitiser ──▶ JSON
```
| Route | Database function | Edge TTL |
|---|---|---|
| `GET /race/league/api/season/<slug>` | `race_league_public_season` | `LEAGUE_CACHE_TTL_SECONDS` (default 15, 5–120) |
| `GET …/season/<slug>/week/<1-8>` | `race_league_public_challenge_results` | same |
| `GET …/season/<slug>/athlete/<publicId>` | `race_league_public_participant` | same |

* **Cache key (edge):** the URL path. **No query string is ever accepted** (400, uncacheable), the slug must be lower-case and unencoded (non-canonical spellings are 400), `week` is 1–8, `publicId` is 8–32 `[a-z0-9]`. So there is exactly one URL per resource and cache-busting (`?x=1`, `/Season-A`, `/p%69lot`) cannot create entries or reach the database. In-process keys: `s|slug`, `r|slug|week`, `a|slug|publicId`.
* **What is cacheable:** only the three routes above, only `200` and the short-lived `404` "not available". Responses carry `Cache-Control: public, max-age=0, s-maxage=<ttl>` (browsers revalidate; shared caches keep it). A `404` (unpublished = missing = unknown, byte-identical) is cached `LEAGUE_CACHE_NEGATIVE_TTL_SECONDS` (default 5). **Every refusal and failure (400/405/429/502/503) is `no-store`.** No `Set-Cookie`, no `Vary` on anything the caller controls; the handler ignores `Cookie` and `Authorization` entirely (tested: they neither reach the database nor change the body), and sends the **public anon key only**.
* **Never cached:** the admin and judge pages' data (they call the database with the staff member's own session, not this API), authentication, unpublished seasons (the function answers `available:false` — no data exists to cache), private participant records (not in the allow-list), the demo fixtures (development only). *Note:* the admin/TV/phone page **shells** are static HTML with no data; a CDN may cache them — that is by design.
* **Allow-list twice:** the database function returns an explicit field list; the API rebuilds every object from the allow-listed keys and primitive types only (`PUBLIC_*_KEYS`) and rejects (502) anything malformed. A field added later to the database cannot leak into a cache.
* **In-process cache:** a short (default 3 s, `LEAGUE_ORIGIN_CACHE_SECONDS`, never above the edge TTL) per-instance cache with **single-flight**: 25 simultaneous misses → 1 database call. Errors are never stored.

### Consistency window and corrections
There is **no active invalidation** — consistency is time-based and documented:
* After an approved correction, an appeal-driven correction, an eligibility decision, a rule change or a close, the database is correct immediately. A public viewer sees it within **at most ≈ 3 s (origin) + `s-maxage` 15 s (edge) ≈ 18 s**, plus the client poll interval (15 s TV, 20 s phone) ⇒ **worst case ≈ 40 s** from the commit to a refreshed screen.
* Stale data never lives past `s-maxage`; there is no `stale-while-revalidate` and no `stale-if-error`, so a database outage is not masked by old standings beyond the window (the page shows the last good data plus an "offline" bar, as before).
* For an urgent purge (e.g. a wrongly published result): hide the season (`set_published(false)`) — the next origin read returns "not available" — and purge the path in the Vercel dashboard; both take effect within the window anyway.

### Honest limitations
* **A response header is not an edge cache.** Vercel's CDN does cache function responses that carry `s-maxage` — that is Vercel's documented behaviour, but it **cannot be verified locally**. After the first preview deploy, verify with `curl -I` twice and check `x-vercel-cache: HIT` (and `X-League-Cache`). Until then, only the per-instance cache is proven.
* **Direct calls to Supabase are closed by a database-side gate (see §2b)** — they used to be a bypass. What remains outside the cache is only what the gate lets through: nothing.
* No server-side participant **search** endpoint exists; search filters the already-fetched list in the browser, so there is nothing further to protect.

### 2b. The database gate (closing the direct-Supabase bypass)
The public anon key is public by design, so the three public functions were callable straight at Supabase's REST endpoint, bypassing the cache and the limiter. They are now **gated**:
* A Super Admin stores a secret with `race_league_set_public_gate(secret)` (24–200 characters). The database keeps **only its SHA-256 hash** (table `race_league_public_gate`, one row, RLS on, no client privilege); the call is audited without the secret.
* `race_league_public_season / _challenge_results / _participant` first call `race_league_gate_ok()`: it compares the hash of the request's `x-league-gate` header (PostgREST exposes request headers as the `request.headers` setting) with the stored hash. **No match — or no gate configured, or no/malformed header — returns `{"available": false}` before any work is done** (a direct call on a 3,000-athlete season answers inside 300 ms in a test), the same body as an unpublished season, so nothing is revealed.
* The same secret is the server-side variable `LEAGUE_PUBLIC_GATE_SECRET`; the API sends it in `x-league-gate` on every upstream call. In production the API **refuses to serve (503) if it is missing or shorter than 24 characters**; it is never returned in a response or logged. Rotation: set a new secret in the database and in the Vercel environment (the old one stops working at once; a short blip between the two changes is expected).
* So a client that only has the anon key can no longer read the league, cannot bypass the limiter, and cannot make the database do expensive work.
*Residual:* the secret lives in the Vercel server environment (and as a hash in the database); whoever can read the project's environment can call the database directly. The header relies on Supabase's API gateway forwarding custom request headers to PostgREST — standard, but **only verifiable on a real project** (staging step: a direct `curl` with the anon key and no header must return `{"available":false}`, and the site must still render).

---
## 3. Rate limiting

### Implementation (`packages/league/server`, no dependency added)
* A **distributed fixed-window counter** on a Redis-compatible **REST** endpoint (Upstash Redis, or Vercel KV which is Upstash underneath): one pipelined request `INCR key; EXPIRE key window NX`, 800 ms timeout. Plain `fetch`; no SDK.
* Applied **per caller and per route kind** on cache misses reaching the origin: defaults **60 / min** (season), **60 / min** (week results), **30 / min** (athlete) — `LEAGUE_RATELIMIT_*_PER_WINDOW`, `LEAGUE_RATELIMIT_WINDOW_SECONDS`.
* **Refusal:** `429 Too Many Requests`, `Retry-After: <seconds to the window end>`, `Cache-Control: no-store`. The browser adapter turns it into a typed retry error; the polling hook waits at least that long, then backs off exponentially (×2 up to ×8) with jitter.
* **Caller identity:** the address is read **only** from the header a verified proxy sets (`x-vercel-forwarded-for`, then `x-real-ip`) **and only when `LEAGUE_TRUSTED_PROXY=vercel`**. With anything else, every caller shares one bucket (so spoofing `X-Forwarded-For` cannot mint fresh budgets — tested). The address is hashed (HMAC-SHA-256 with `LEAGUE_RATELIMIT_SALT`, 8 bytes) before it becomes a key; **no raw address is stored, sent to the limiter or logged**; log lines never contain client data.
* **Fail safe, never open:** if the backend errors, times out, or answers nonsense, a **stricter per-instance limiter (¼ of the limit, minimum 1)** decides, the response header says `degraded`, and a redacted fault line is logged. **If the limiter is not configured in production** (no backend, no salt, incomplete credentials, no Supabase variables) the API answers **503 `protection_not_configured`** and serves nothing — it can never run unprotected by accident. `LEAGUE_RATELIMIT_BACKEND=memory` is an explicit per-instance choice (header `…;instance`); it is **not** global protection.

### Multi-instance (Vercel) behaviour
* **Appropriate for multi-instance deployment when the `upstash-rest` backend is configured:** every serverless instance increments the same counter in the shared Redis-compatible store, so the budget is global. Proven by a test that runs two independent API instances against one shared REST backend (5 requests from one caller alternating between the instances → `200,200,200,429,429`).
* **Not global with `LEAGUE_RATELIMIT_BACKEND=memory`:** the same test shows each instance keeps its own budget (the caller gets the full budget on each). That mode is for local runs or a single-instance private pilot only.
* The in-process cache and the degraded-mode fallback limiter are per instance by design (burst absorption); they are not relied on for global protection.
* The Redis adapter was exercised against a protocol-faithful local fake and fake `fetch` failures — **not against a real Upstash/Vercel KV instance** (no remote service may be touched). Verify on staging.

### Limits you must know
* Edge-cache **hits never reach the function**, so they are not counted: the limiter protects the *miss* path, the cache protects the database from the *hit* path. Per-viewer throttling of cache hits is a CDN/WAF feature (see alternatives).
* Fixed windows allow up to 2× the limit across a window boundary.
* One shared bucket when no trusted proxy is declared (conservative, but one abuser can exhaust it for everyone — configure the proxy setting).
* The distributed counter lives in a third-party Redis; if it is down you get the degraded (stricter, per-instance) mode, not an outage.

### Cost, setup, alternatives (nothing was configured or purchased)
| Option | Cost | Setup | Notes |
|---|---|---|---|
| **Upstash Redis (REST)** — default adapter | has a free tier and pay-per-request pricing — *check current pricing*; usage is 2 commands per origin miss, so with a 15 s edge cache a league needs a few hundred thousand commands a month at most | create a database, copy REST URL + token into Vercel server-side env | global, no code change |
| Vercel KV (Marketplace, Upstash-backed) | billed through Vercel | same variable names via the integration | same protocol |
| **Vercel WAF / Firewall rate-limit rule** | depends on the Vercel plan | dashboard rule on `/race/league/api/*` | throttles **before** the cache too, no code; complements this limiter |
| Cloudflare (or similar) in front | free tier exists | DNS change — **not** in scope | also caches and rate limits at the edge |
| `LEAGUE_RATELIMIT_BACKEND=memory` | none | env only | per instance only — acceptable for a small private pilot, **not** for public launch |

---
## 4. Environment variables (server-side only; names only — values live in the host's vault)

| Variable | Purpose | Default |
|---|---|---|
| `LEAGUE_CACHE_TTL_SECONDS` | edge `s-maxage` (the consistency window) | 15 (5–120) |
| `LEAGUE_ORIGIN_CACHE_SECONDS` | per-instance cache / single-flight window | 3 (0–30, ≤ TTL) |
| `LEAGUE_CACHE_NEGATIVE_TTL_SECONDS` | cache of "not available" | 5 (1–30) |
| `LEAGUE_RATELIMIT_BACKEND` | `upstash-rest` \| `memory` | none ⇒ **503 in production** |
| `LEAGUE_RATELIMIT_REST_URL`, `LEAGUE_RATELIMIT_REST_TOKEN` | the Redis REST endpoint (**secret** token) | — |
| `LEAGUE_RATELIMIT_SALT` | ≥ 16 chars, hashes client addresses (**secret**) | required in production |
| `LEAGUE_PUBLIC_GATE_SECRET` | ≥ 24 chars; sent to the database as `x-league-gate`; must equal the secret a Super Admin stored with `race_league_set_public_gate` (**secret**) | required in production |
| `LEAGUE_TRUSTED_PROXY` | `vercel` to trust the platform's client-address header | `none` (one shared bucket) |
| `LEAGUE_RATELIMIT_WINDOW_SECONDS`, `…_SEASON_PER_WINDOW`, `…_RESULTS_PER_WINDOW`, `…_ATHLETE_PER_WINDOW` | limits | 60 s, 60, 60, 30 |

Existing: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (also read server-side by the API), `NEXT_PUBLIC_LEAGUE_SEASON`. These new names must be added to the Vercel environment matrix in `13-production-infrastructure-checklist-and-runbook.md` §1 when the project is approved — **no value is set anywhere today**. The service-role key remains undefined everywhere.

---
## 5. Security audit of the league boundary (this session)

| Area | Result | Evidence |
|---|---|---|
| RLS | 11 tables, RLS on, **no policy, no client privilege** (select/insert/update/delete/truncate/references/trigger, `anon` and `authenticated`); ledger sequence locked | `32`, `37` |
| RPCs / grants | `anon` executes exactly the 3 public reads; 27 functions executable by `authenticated`, each re-checks role/season; 19 internal helpers (incl. scoring, correction core, admin count, rules mapper) not executable by any client; all `SECURITY DEFINER` pin `search_path` | `32`, `37`, `39` |
| Triggers | completed-season lock on every write path (even for the owner), append-only ledger / corrections / eligibility decisions, no deletes | `32`, `36`, `37` |
| Role assignment / revocation | Super-Admin-only for administrators, reason + audit, idempotent, serialised, two-administrator floor, no self-promotion | `39` (+ parallel-session check) |
| Public reads | **gated** (only the API's secret header is answered), allow-list in the database and again in the API; unpublished = missing = identical; cross-season keys never mix; cookies/Authorization ignored | `34`, `server.test.ts`, browser check |
| Unpublished season | no data returned or cached (`available:false`, 404, 5 s) | `34`, `server.test.ts` |
| Result approval / correction | self-review refused; corrections admin-only with reason, previous/new/actor/time, audit; judge requests change nothing; completed season locked | `32`, `36`, differential test |
| Point-ledger integrity | single scoring path under a lock, append-only, exactly-once under parallel close/recompute, TS ≡ SQL on 150 scenarios | `35`+shell, `38` |
| Attempt idempotency | one request id × 10 parallel → 1 attempt; limit holds under 8 parallel | shell |
| Appeals | 48 h window, staff-entered, conflict-of-interest (recorded/corrected/removed), never touches scores, text admin-only | `36` |
| CSV import | formula characters, size, row, binary, duplicate and unverified-membership rows refused (client and server) | `league.test.ts`, `32`, `36` |
| Rate-limit bypass | header spoofing, query/case/percent cache-busting, backend outage, hung backend, unconfigured production, **direct database calls (gate)**, two instances sharing/not sharing a budget — all tested | `server.test.ts`, `34`, `37`, browser check |
| Cache poisoning | key derived only from validated path; no request header influences body or key; upstream response sanitised; errors never stored | `server.test.ts` |
| Cross-season access | refused on every write and read path | `37` |
| Unauthorized administrator actions | refused; the same checks run in TypeScript and SQL | `39`, `league-roles.test.ts` |

**Findings fixed in this session:** none beyond those in §1–§3 (new surface was built with its tests). **Residual risks:** whoever can read the Vercel environment holds the gate secret (§2b), the CDN behaviour and the gateway's header forwarding unverifiable locally, shared-bucket collateral without a trusted proxy, edge cache hits not counted, Redis as a third-party dependency, an administrator may still correct a result they recorded (by your rule), membership is an attestation.
