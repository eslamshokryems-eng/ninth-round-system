# Release B — Independent Preview environment: requirements and setup steps

Decision (owner): **Option 1**, a separate free Supabase account holding one test project. Nothing has been created or changed yet.
Out of scope until approved separately: any push, any Production change, any Production deployment, any use of the Challenges project.

## A. What the owner prepares (by hand, before I start)
1. **New Supabase account** with a different email you own. In it, create one **free** project:
   - name `9th-round-sales-b-test`, region `eu-west-2` (same as Production, so latency is comparable), Postgres 17 (the default);
   - a strong database password, kept only by you (I do not need it);
   - Auth → Providers → Email: **disable "Allow new users to sign up"**. Confirm-email can stay on; test users are created already confirmed.
   - Do not connect this account to Vercel or GitHub integrations.
2. **Personal access token** for that new account (Account → Access Tokens), name `release-b-test`. The account holds only the test project, so the token can reach nothing else. You enter it in the secure credential form I open (host `api.supabase.com`). It never appears in chat and I never see its value.
3. **Resend**: a new API key named `release-b-preview`, permission **Sending access** only. Plus a test inbox you own, to receive device-verification codes.
4. In **Vercel** (project of `app.9throundegypt.com`), add the variables of section C **as Preview variables restricted to the git branch `release/sales-b-local`**:
   - Do not edit the existing shared variables, and do not edit any Production variable.
   - You enter the secret values yourself, in the Vercel dashboard.
   - The non-secret ones (URL, anon key, site URL) I can add with the Vercel tool once you approve.

## B. Extra permissions I will ask for (each shown to you before I ask)
| What | Why | Cost |
|---|---|---|
| Secure credential: the Supabase token for host `api.supabase.com` | apply the schema, seed fake data, run the SQL suites through the Management API (SQL editor endpoint), in the test project only | none |
| Network: a session environment for this repo allowing exactly `api.supabase.com`, `<test-ref>.supabase.co` and the branch's preview host `*-<team>.vercel.app` (exact name once known) | the browser tests run in this sandbox and must reach the Preview and the test project; nothing else is added | none |
| Vercel: create branch-scoped Preview variables (non-secret ones), read deployments of the branch, create a temporary share link for the protected Preview | set up and open the Preview without disabling Deployment Protection | none |
| Push of `release/sales-b-local` | creates the Preview deployment | separate approval, only after the isolation checks of section E |

## C. Vercel Preview variables (branch `release/sales-b-local` only; names only)
| Variable | Value comes from | Secret |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | test project URL | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | test project anon / publishable key | no (public by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | test project service-role key | **yes**: you enter it |
| `DEVICE_VERIFICATION_PEPPER` | new random value (e.g. 48 random bytes, base64), test only | **yes**: you enter it |
| `RESEND_API_KEY` | the new test key | **yes**: you enter it |
| `RESEND_FROM_EMAIL` | the sender you already use (or Resend's test sender) | no |
| `NEXT_PUBLIC_SITE_URL` | the branch preview URL | no |

## D. Test database (fake data only)
- **Schema**, in this order:
  1. the migrations up to `527f705`;
  2. `20261020000001` (the Production assignment trigger, recreated from `prodshape_lead_assignment_trigger.sql`);
  3. Release A (`20261123000001`);
  4. Release B (`20261124000001`), applied in one transaction with `lock_timeout 5s` and `statement_timeout 30s`.
- **Check:** the catalog fingerprint (`release_b_fp.sql`, plus the Production drift fingerprint) is compared with Production's read-only fingerprint. The data is excluded from the comparison.
- **Data:** generated, nothing copied from Production.
  - Branches "Nasr City – Test" and "Maadi – Test".
  - About 60 leads with fake names and `0100000xxxx` phones: own leads per employee, unassigned leads in each branch, and a lead of the other branch.
  - Follow-ups that are overdue, due today and upcoming.
  - Two test membership types.
  - Setting: the device-verification recipient = your test inbox.
- **Accounts** (emails on the reserved domain `example.com`, which can never receive mail; random 20-character passwords kept in a local file with restricted permissions, never shown in chat):

| Role | Accounts |
|---|---|
| super_admin | 1 |
| branch_manager | 2 (one per branch) |
| sales_employee | 3 (2 in Nasr City, 1 in Maadi) |
| sales_employee, inactive | 1 (refusal tests) |
| reception | 1 (refusal tests) |

## E. Isolation checks: all must pass before the push approval is requested, and again on the deployment
1. Vercel lists the 7 variables for the branch, and the shared variables are unchanged (compared by `updatedAt`).
2. On the built deployment:
   - the client bundle contains the test project ref and **not** `yjuzjvlmyszutuqpwenn`;
   - a test account can sign in (these accounts do not exist in Production);
   - a Production account cannot sign in.
3. During every test session, Production edge logs (read-only) show no request from the Preview origin.
4. No Production key is read, copied or decrypted at any point.
5. Residual risk outside this plan: other Preview branches still use the shared Production variables. Fixing that is a separate change, which needs its own approval.

## F. Tests on the real Preview
1. **Auth:** sign in, sign out, wrong password, inactive account refused, session survives a refresh, token refresh after expiry.
2. **Device verification:**
   - a new device asks for a code and the code arrives in the test inbox;
   - a wrong code, an expired code, a replayed code and the attempt limit are each refused;
   - "Trust this device" skips the code next time.
   - How the code reaches the automated run, in order of preference: you paste the 6-digit test code when asked (it expires in minutes and opens only test data), or I read it with the Gmail connector if you allow that.
3. **Sales Workspace and permissions:** the 37 browser checks of `sales-workspace.mjs`, run against the Preview URL:
   - the employee sees only their own leads, and a contact cannot be recorded without the next step;
   - the manager sees the branch plus its unassigned leads, and an assignment requires a reason;
   - the branches are isolated, the history is kept, and the mobile layout works.
4. **Database suites on the real hosted stack (Supabase Postgres 17, PostgREST, Auth):**
   - the release B, Production-trigger and rollback checks (123), adapted to run through the SQL endpoint;
   - API probes through the real PostgREST with each role's token.
5. **Rollback rehearsal with real activity recorded:**
   - behavioural rollback: the A-era behaviour is back and every history row is kept;
   - re-enable: Release B is back exactly;
   - full removal: refused while history exists.
6. **Report:** results per check, with screenshots. Then I stop.

## G. Teardown (no Production impact)
1. Delete the branch-scoped Preview variables in Vercel.
2. Delete the branch's Preview deployments.
3. Pause or delete the test project in the separate account.
4. Revoke the Supabase token and the Resend test key.
5. Remove the session network entries and the stored credential.
6. Optionally delete the remote branch (separate approval).

## H. Cost
$0: Supabase free plan (one active project in a new account; it pauses after a week without use and can be resumed in the dashboard), Resend free tier, Vercel Preview deployments, no paid add-ons.
