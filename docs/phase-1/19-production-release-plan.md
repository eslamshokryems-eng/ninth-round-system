# Challenges — production release plan (NOT executed)

Status: **plan only. Nothing in this document has been applied to production.**
Evidence date: 2026-11-11. Everything under "Findings" was gathered with read-only calls
(migration list, catalog queries on functions/policies/columns — no business rows were read).

## 0. Where things stand

| Item | State |
|---|---|
| Live web app (`app.9throundegypt.com`, Vercel `ninth-round-system-web`) | Running commit `527f705` (pre-Challenges). Staff device sign-in works (confirmed by the owner after the 2026-11-11 redeploy). |
| Live database (Supabase `9th-round-dev`, `yjuzjvlmyszutuqpwenn`) | 38 migrations recorded, **no Challenges objects**, no `is_service_role`, no device-hardening functions. Six migrations were applied on 2026-11-11 from another session. |
| Isolated staging (Supabase `9th-round-challenges`, `qpfbkgooaroknmhkylsu`) | All 63 migrations applied, demo cast seeded. Real Auth, PostgREST, RLS, device verification, designation, submit and reject were exercised against it. |
| Production branch `claude/9th-round-platform-architecture-1id262` | At merge commit `1536ee9` (contains Challenges). **Any push to it redeploys Challenges to production.** |

## 1. Findings that shape the plan

1. **RLS is identical.** All 52 tables with policies have exactly the policies the repo's migrations before
   `20261105` produce (hash comparison of every policy). The shared helper functions
   (`is_admin`, `is_super_admin`, `is_branch_staff`, `auth_role`, `log_audit_event(_as)`,
   `protect_privileged_profile_columns`, `enforce_lead_assignment_rules`, …) are byte-identical
   (whitespace-normalised) to the repo. So the before/after Reception-Sales comparison in
   `docs/phase-1/18-reception-sales-regression.md` is a faithful model of production.
2. **Migration history does not match reality.** Objects from `20260917000001`, `20260917000002`,
   `20260920000002`, `20260922000001` (device tables), `20261020000001` (lead guard) exist in production but
   are **not recorded**; they were applied by hand. `20260913000001` and `20260914000001` were applied today but are
   recorded as `20261111004051` / `20261111004124`. A plain `supabase db push` on production would try to
   re-run the unrecorded ones. **Never run `db push` unfiltered against production.**
3. **Two functions differ from the repo** (both predate Challenges):
   `delete_receipt` is the simple `20260926` version, not the `20260927` "full undo" version the deployed code
   expects; `get_sales_transactions` differs (to be diffed). Old overloads of `register_membership`,
   `renew_membership` and `sell_additional_membership` (without `p_sold_by`) still exist next to the new ones.
   These are existing drift, not caused by Challenges; they need their own decision.
4. **Production grants:** `EXECUTE` on the audit/auth helpers is open to PUBLIC, anon, authenticated and service_role.
   Migration `20261111` closes `log_audit_event_as` (anon/authenticated) and `log_audit_event` (anon). Verified on staging:
   the staff and device routes (service role) keep working.
5. **Vercel Preview shares the production database.** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   and `SUPABASE_SERVICE_ROLE_KEY` are set for both `production` and `preview`. Every preview build (including
   branch pushes) talks to the live database. `DEVICE_VERIFICATION_PEPPER` is set for both (present, value not read);
   `RESEND_API_KEY` / `RESEND_FROM_EMAIL` are production-only, so a preview cannot email device codes.
6. **Staging proved a real defect the local stack hid** (fixed, `ed4c547`): the coach list was empty for a
   super admin on a GLOBAL competition. Also a migration defect (enum value used in the same transaction, `55P04`),
   fixed by `20261106000000`. Lesson: real-infrastructure rehearsal is required, not optional.
7. **No point-in-time recovery on the free plan.** A logical backup taken by hand is the only restore path.

## 2. Gates (every one must pass before the next phase)

**Gate A — backup & baseline** (owner's machine, Supabase CLI):
`supabase db dump` (schema) and `supabase db dump --data-only`, stored off-machine; record row counts of
`members, memberships, membership_payments, check_ins, profiles, leads, admin_audit_log`.

**Gate B — rehearsal on an exact replica.** Reset the staging project to production's actual schema
(restore the schema dump), then apply only the Challenges chain, in order, as single transactions:
`20261105000001 … 20261117000001` (15 files, incl. `20261106000000`). Then run:
the Reception/Sales before/after harness (adapted to run through SQL on the staging project), the Challenges
acceptance test, and the browser run of all four roles. Pass criteria: the only differences from
"before" are the 11 intended ones listed in doc 18; every other check identical.

**Gate C — reconcile history without DDL.** `supabase migration repair` on production, metadata only:
mark `applied` the unrecorded migrations whose objects were verified present; revert the two today-timestamps and mark
`20260913000001` / `20260914000001` applied. Do **not** mark `20260927000001` applied until its function is actually applied
(separate, small, separately approved change).

**Gate D — approval.** Explicit owner approval, a quiet window (Egypt early morning), the owner reachable.

## 3. Execution order (after all gates)

1. **Database first, application second.** The pre-Challenges code ignores new objects, so applying the DB first is safe;
   the reverse order is what broke staff sign-in on 2026-11-11.
2. Apply the Challenges chain one migration at a time. **Pause after `20261107` and after `20261111`** (these redefine shared
   helpers/grants) and run read-only smoke checks plus one real staff sign-in from a new device.
3. Confirm `DEVICE_VERIFICATION_PEPPER` exists for production (names only; never print values).
4. Deploy the application from the production branch. Keep the previous production deployment as the instant-rollback target
   (on the Hobby plan Vercel only rolls back to the immediately previous deployment, which is the right one here).
5. Verify: staff sign-in from a new device (Reception, Sales, Coach, Manager, Super Admin), member sign-in, the
   Competitions screens, and Reception/Sales read-only smoke. Create **no** test data in production without approval.
6. Monitor Vercel runtime errors and Supabase auth/edge logs for 24 h.

## 4. Rollback

* **Application:** Vercel instant rollback to the previous production deployment (no DB change).
* **Database (shared objects only):** `supabase/rollback/challenges_shared_functions_rollback.sql` restores the
  production definitions of the six shared functions and the production grants. **Tested:** all 63 migrations applied
  locally, rollback run, function hashes and ACL sets identical to the pre-release state. Challenges tables/functions are isolated
  and may stay in place; the old code does not call them.
* **Last resort:** restore from the Gate A dump.
* **Triggers for rollback:** any 5xx on `/api/auth/device/*`, any staff sign-in failure, any unexplained change in
  Reception/Sales behaviour, runtime-error spike.

## 5. Decisions needed from the owner

1. Approve Gate B (rehearsal on the staging project, reset to production's schema). Needs the dump from Gate A.
2. Who runs production DB steps: the owner with the CLI, or Claude through the Supabase tool **per step with explicit approval**.
3. Fix or ignore the Preview-uses-production-database setting (recommended: give preview branch-scoped variables that point at staging).
4. Whether to fix the pre-existing drift (`delete_receipt` full-undo, `get_sales_transactions`, old overloads) in the same window or separately.
5. Release window.

## 6. Known limitations

Not built: per-IP rate limiting, more than one recipient for device codes, Supabase MFA (the device gate is a UI gate,
not a data boundary). The browser runs on staging used the real Supabase Auth/PostgREST, but not Realtime or Storage (not used
by Challenges). The two pre-existing function differences are unresolved.
