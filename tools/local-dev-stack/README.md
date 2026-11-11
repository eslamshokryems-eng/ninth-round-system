# Local dev stack (no Docker, no Supabase project)

Runs the **real** web app against the **real** migrations on a local PostgreSQL 16 server.
Nothing here touches Supabase, Vercel or any remote database, and none of it has security value.

| File | Purpose |
|---|---|
| `00_supabase_shim.sql` | Minimal `auth`/`storage` schemas and the `anon`/`authenticated`/`service_role` roles the migrations depend on |
| `apply.sh` | Drops and rebuilds `ninth_round_local` from every file in `supabase/migrations/` (unmodified, in order) + the demo seed |
| `10_seed_demo.sql` | 1 super admin, 1 branch manager, 2 coaches, 12 members, 2 branches. All passwords: `demo1234` |
| `20_acceptance_test.sql`, `acceptance.sh` | The 10-step end-to-end workflow, driven through the real RPCs as the real roles, 45 assertions |
| `gateway.mjs` | Stand-in for GoTrue + PostgREST. Every request runs in a transaction as the real client role with `request.jwt.claims` set, so RLS and `SECURITY DEFINER` RPCs behave as in production |
| `mail-sink.mjs` | Stand-in for Resend (`POST /emails`), so the real device-verification send path runs locally. The app reaches it through `RESEND_API_URL` (ignored in production builds); the browser checks read the code from `GET /last` |
| `device-verification-tests.mjs` | 48 checks against the REAL `/api/auth/device/*` routes: 40 parallel wrong guesses, parallel correct submissions, expiry, replay, issuance limits, lockout, HMAC, fail-closed |
| `browser/` | Playwright checks that drive the real UI: `read-checks.mjs` (26), `journey.mjs` (31), `workflows.mjs` (97), `remote-browser-check.mjs` (8: signs in and loads screens with the gateway port walled off from the browser, as in a remote preview), `manual-validation.mjs` (46: the full 14-step lifecycle across four roles, with screenshots `mv-*.png`). Each needs a freshly seeded DB: run `acceptance.sh` first |

```bash
pg_ctlcluster 16 main start
bash tools/local-dev-stack/acceptance.sh                  # rebuild + seed + acceptance test
node tools/local-dev-stack/mail-sink.mjs &                # :54325  (device-verification codes land here)
node tools/local-dev-stack/gateway.mjs &                  # :54321
cp the three values it prints into apps/web/.env.local    # NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
# ...and add, to the same file:
#   DEVICE_VERIFICATION_PEPPER=$(openssl rand -hex 32)       # required: without it the device routes fail closed
#   RESEND_API_KEY=local-dev-sink  RESEND_FROM_EMAIL='9th Round Local <noreply@9thround.local>'
#   RESEND_API_URL=http://127.0.0.1:54325
# ...and, so a REMOTE browser (a preview) can sign in, set these three INSTEAD of a 127.0.0.1 Supabase URL:
#   NEXT_PUBLIC_SUPABASE_URL=same-origin      # the browser calls the app's own address
#   SUPABASE_INTERNAL_URL=http://127.0.0.1:54321   # server-side code talks to the gateway directly
#   LOCAL_GATEWAY_URL=http://127.0.0.1:54321       # next.config.mjs relays /auth/v1 and /rest/v1 to it
# (a 127.0.0.1 URL makes the login page fail in your browser: that address means YOUR machine.)
pnpm --filter @9thround/web dev                           # :3000
node tools/local-dev-stack/browser/journey.mjs            # write journey (needs a freshly seeded DB)
node tools/local-dev-stack/browser/workflows.mjs          # seasons, weight range, GLOBAL/MULTI, rules, rejection, corrections, isolation
```

Sign in at `/login` with the email in the *Employee ID* field. Staff accounts hit the new-device
gate. The 6-digit code is "emailed" to the local mail sink: read it with
`curl -s http://127.0.0.1:54325/last` (field `code`), or open `/tmp/ninth-mail-sink.json`.
(The earlier workaround of brute-forcing the stored hash no longer works, by design: the hash is now a
keyed HMAC.) A member (`member01@9thround.local`) has no device gate.

Known gateway limits: PostgREST features the app does not use are not implemented
(`or=`, `count=exact`, upserts beyond `on_conflict`, etc.). A 400 with
"the local gateway does not …" is a gateway gap, not an app defect.
