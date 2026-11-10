# Device verification — review of the local workaround and a production-ready approach

Status: **findings F1–F3 and the local-development channel are now FIXED and tested** (milestone 3, section 0).
Sections 1–2 are the original review and are kept as written so the before/after is auditable. Nothing here
changes production configuration; deploying the fix needs the new migration and one new environment variable
(`DEVICE_VERIFICATION_PEPPER`), listed in section 0.

## 0. What was implemented (milestone 3)

Migration `supabase/migrations/20261116000001_device_verification_hardening.sql` and the two route handlers.

| Finding | Fix | Evidence |
|---|---|---|
| F2 race | `begin_device_code_attempt()` checks expiry, attempts left and the failure lockout, and increments `attempts`, as ONE step under a per-user advisory lock. The stored hash is returned only when the attempt was granted, so the number of guesses that can ever be compared is bounded by `max_attempts`. | Before: 40 parallel wrong guesses -> **29** evaluated. After, through the real routes: **5 evaluated** in each of 3 rounds (`tools/local-dev-stack/device-verification-tests.mjs`); in raw SQL with 40 separate sessions, exactly 5 granted in each of 3 rounds (`supabase/tests/device_verification/run.sh`). A naive read-then-write control in the same harness evaluated **40 of 40**, so the test can detect the bug. |
| Replay | `complete_device_code_attempt()` consumes the code with `WHERE consumed_at IS NULL AND expires_at > now()`. | 40 simultaneous correct submissions -> exactly **1** success. A used, expired or superseded code can never verify. |
| F1 hashing | The server stores `HMAC-SHA256(pepper, user:codeId:code)`. The pepper is a server environment variable, never in the database. With no pepper (or one under 32 characters) the routes **fail closed**, with no unkeyed fallback. | The old 10^6 SHA-256 brute force no longer recovers the code; hash is bound to user, code id and pepper. |
| F3 issuance | `issue_device_verification_code()`: 60 s cooldown, 3 codes/hour, 10/day, a new code supersedes the old one, and 15 failed guesses across codes in an hour lock issuance AND attempts (the lockout ages out after the hour). All under the same lock. | 40 simultaneous requests issue exactly 1 code; the 4th code in an hour is refused; the lockout is audited as `device_verification_locked`. |
| Local dev | `RESEND_API_URL` (ignored in production builds) points the sender at `tools/local-dev-stack/mail-sink.mjs`; the browser checks read the code from the sink like an administrator reads an inbox. | The brute-force workaround is gone. |

A second, subtler race was found by the HTTP-level test while building this: the first version consumed a
code as soon as the limit was reached, which could destroy a correct attempt still in flight (6+ parallel
correct submissions all came back "replayed"). A code is now retired only after every granted attempt has
reported its outcome (`attempts_completed`). There is a deterministic regression test for that interleaving.

**To deploy:** apply the migration; set `DEVICE_VERIFICATION_PEPPER` (`openssl rand -hex 32`) on the server;
codes issued before the deploy were hashed unkeyed and simply expire (5 minutes). Not done here: per-IP
rate limiting (needs a shared store or the edge/WAF), multiple recipient addresses (F5), and Supabase MFA
for protecting the data itself (F4) remain recommendations.

Scope: the new-device gate introduced by `20260922000001_device_verification.sql` and implemented by
`apps/web/app/api/auth/device/{request-code,verify-code,check}/route.ts`,
`apps/web/src/lib/device-verification-crypto.ts` and the gate in `apps/web/app/(reception)/layout.tsx`.

## 1. What the local workaround does, and why it exists

A staff sign-in from an unrecognised browser is stopped by a 6-digit code that the server **emails to a
single administrator address** (`security_settings.device_verification_admin_email`) through Resend. A
developer machine has no Resend key and no route to the provider, so the code can never arrive.

The browser checks in `tools/local-dev-stack/browser/common.mjs` therefore read the code's hash from
`device_verification_codes` and recover the six digits by trying all 1,000,000 candidates against the
stored SHA-256. That takes milliseconds because the hash is **unsalted** and the space is only 10^6.

This is a local-only shortcut. It exploits nothing an outsider could reach: it needs read access to the
database. But the fact that it works at all is worth taking seriously, see §2.

## 2. Findings from reading the implementation

| # | Finding | Severity | Evidence |
|---|---|---|---|
| F1 | **A code is recoverable from its stored hash.** `hashSecret` is a bare SHA-256 over six digits. Anyone who can read `device_verification_codes` (a backup, a read-only replica, a leaked service-role key) can recover any *live* code instantly. | Low–medium. The window is the 5-minute TTL, and someone who can read the table can already insert a `trusted_devices` row, so it mainly matters for backups and logs. | `device-verification-crypto.ts`; reproduced by the local workaround |
| F2 | **The attempt counter is read-then-write, not atomic.** `verify-code` reads `attempts`, compares, then writes `attempts + 1`. N parallel requests all read the same value, so one code can receive far more than `max_attempts` (5) guesses. | **Medium (confirmed).** With a 10^6 space and a fresh code every 60 s, a parallel burst is the realistic online attack. | `verify-code/route.ts`, the select-then-update around `pending.attempts`. **Measured locally:** 40 parallel wrong guesses against one code with `max_attempts = 5` resulted in **29 guesses evaluated and logged** (36 × HTTP 400, 4 × 429). The local gateway serialises requests through `psql`, so a real deployment's concurrency would differ, but the limit is demonstrably not enforced under parallel load. |
| F3 | **No cap on the number of codes issued.** The only throttle is a 60-second cooldown between codes (`OTP_RESEND_COOLDOWN_MS`), so a signed-in user can mint ~1,440 codes/day, each with 5 guesses. | Low–medium, and compounds F2. | `request-code/route.ts` |
| F4 | **Device trust is a UI gate, not a data boundary.** The gate lives in the Reception layout. Every Supabase REST/RPC call made with a valid session works without it. | **Informational but important.** | During the milestone-2 tests, `rpcAs()` called the REST API as the branch manager with no device check and every authorised call succeeded. |
| F5 | **One recipient is a single point of failure and trust.** All staff codes go to one mailbox; whoever reads it can approve any new device. | Operational. | `security_settings` holds one address |
| F6 | The trusted-device cookie is sound. 256-bit random token, stored only as a hash, `httpOnly`, `secure`, `sameSite=lax`, 30-day expiry, revocable. A high-entropy secret does not need a salt. | Good. | `verify-code/route.ts` |

F4 is not a defect: it is how the design works, and it is stated here so nobody mistakes the gate for
protection of the data. The data boundary is RLS plus the `SECURITY DEFINER` RPCs, which is where this
project's recent security work went.

## 3. Recommended production-ready approach (items 1–3 now implemented, see section 0)

Smallest change that closes F1–F3, in priority order. All of it is additive and server-side.

1. **Make the attempt counter atomic (F2).** Increment before comparing, in a single statement:
   `update device_verification_codes set attempts = attempts + 1 where id = $1 and consumed_at is null and attempts < max_attempts returning attempts, code_hash`.
   Compare only if a row came back. Zero rows means locked out. Better still, move the whole
   check into one `SECURITY DEFINER` function so the compare and the counter cannot be separated.
2. **Keyed, per-code hashing (F1).** Store `HMAC-SHA256(server_pepper, user_id || ':' || code_id || ':' || code)`
   instead of `SHA256(code)`. The pepper lives in the server environment (not in the database), so a
   leaked table or backup no longer yields codes. Keep `hashesMatch` (constant-time).
3. **Bound code issuance (F3).** Cap at, say, 3 codes per user per hour and 10 per day, count failures
   across codes, and write a `device_verification_locked` audit event plus an alert to the
   administrator when the cap is hit. Optionally rate-limit by IP at the edge as well.
4. **More than one recipient (F5).** Allow a short list of administrator addresses, or route to the
   super admin who owns the employee's branch, so one unavailable mailbox does not lock a branch out.
5. **Do not rely on this gate for data protection (F4).** If a hard second factor is required for the
   *data*, enforce it where the data is: Supabase Auth MFA (TOTP) at `aal2`, checked in RLS via the
   `aal` claim, so a stolen password alone cannot call the REST API from anywhere.

Verification for each: a regression test that fires N parallel wrong guesses and asserts at most
`max_attempts` were evaluated (F2), a test that a dumped `code_hash` cannot be matched without the pepper
(F1), and an issuance-cap test (F3). Run them on a disposable database, as with the other suites.

## 4. A clean local development path (implemented: the mail sink, see section 0)

Once F1 is fixed the brute-force workaround stops working, by design, so the local flow needs a real
channel. Recommended, in order of preference:

- **A local mail sink.** Let the sender read its API base URL from an env var (for example
  `RESEND_API_URL`, defaulting to `https://api.resend.com`) and run a ~30-line fake endpoint in
  `tools/local-dev-stack/` that stores the message body. Browser checks read the code from the sink,
  exactly as an administrator would read it from email. This exercises the real send path.
- **Or a development-only log sink**, enabled only when *both* `NODE_ENV !== "production"` and an
  explicit `DEVICE_VERIFICATION_DEV_LOG=1` are set, that prints the code to the server log. It must
  be impossible to enable in a production build.

Neither is implemented here: both touch application code outside this milestone's scope.

## 5. What was deliberately not done

- No change to the routes, the crypto helper, the migration, `security_settings` or any environment
  variable. No production or staging access.
- The local seed sets `device_verification_admin_email` to `security@9thround.local` **in the local
  database only**, so staff accounts on a fresh local database are not locked out of the app.
