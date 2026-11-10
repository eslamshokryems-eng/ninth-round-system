# audit_log_permissions — H-1 / M-2 regression harness

Local-only verification of
`supabase/migrations/20261111000001_audit_log_function_execute_lockdown.sql`.

```bash
bash supabase/tests/audit_log_permissions/run.sh
```

Creates its own throwaway PostgreSQL database and drops it on exit. It never
connects to Supabase or to any remote database.

## What it tests

Two findings from the Final Challenges Security Audit, both about function
`EXECUTE` permissions rather than function logic:

- **H-1 (HIGH)** — `log_audit_event_as(uuid, text, text, uuid, jsonb, jsonb, jsonb)`
  was callable by `anon` and `authenticated`, letting any customer or even an
  unauthenticated caller write an `admin_audit_log` row attributed to another
  administrator. The migration comment claimed this was already prevented; no
  `REVOKE` existed, so the PUBLIC default stood.
- **M-2 (MEDIUM)** — `log_audit_event(text, text, uuid, jsonb, jsonb, jsonb)`
  was callable by `anon` for the same reason. Its `authenticated` exposure is
  documented and accepted upstream and must be **preserved**.

31 checks: the pre-fix exposure, clean apply, idempotent re-apply, the four
ACL requirements, execution attempts under `anon`, customer, coach, branch
manager, super-admin-as-client and `service_role`, and the state of
`admin_audit_log` after every denial.

## How fidelity is maintained

- The two audit functions are **extracted verbatim** from
  `20260815000001_audit_log.sql` at run time (`awk` from the
  `create or replace function` line to the terminating `$$;`), never copied
  into this directory. The run fails if extraction yields an implausibly
  short block, which is what would happen if that migration's DDL shape
  changed.
- The fix migration is applied **by relative path**, unmodified.
- `00_schema.sql` grants `select, insert, update, delete` to `anon` and
  `authenticated`, matching what Supabase grants on new public tables. The
  Challenges harness grants only `SELECT`, which makes its direct-write
  tests pass for the wrong reason; this harness deliberately does not repeat
  that, so a denial here is a real authorization denial.
- `service_role` is created `nologin bypassrls`, as Supabase configures it.
  `BYPASSRLS` bypasses row-level security only, **never** function `EXECUTE`
  grants — measured on an isolated cluster — which is why the migration has
  to grant `service_role` explicitly rather than rely on the PUBLIC default
  it removes.
- `PUBLIC` is tested with `has_function_privilege('public', …)`, not by
  pattern-matching `proacl`. A function with a NULL `proacl` holds the
  default grant — *EXECUTE to PUBLIC*, exactly the state H-1 was in — but
  has no `=X` entry to match, so scanning the ACL text reports a false
  negative on the one case that matters.

## A/B check

```bash
APPLY_FIX=0 SCRATCH_DB=audit_ab bash supabase/tests/audit_log_permissions/run.sh
```

Withholds the fix migration and leaves everything else identical. Expect
**17 passed, 12 failed**: the ACL and denial assertions fail, five forged
`admin_audit_log` rows appear (`change_role`, `delete_user`, `disable_user`),
and the row count goes to 10 instead of 4. The `service_role` path and the
`authenticated` + membership paths pass either way, which is what shows the
fix does not break them.

## Known limitation

Tests (10) and (11) — "membership registration/renewal still works" — are
exercised through `harness_invoker_logs_audit()`, a `SECURITY INVOKER`
function that calls `log_audit_event` as the caller, which is the exact
dependency the `authenticated` grant exists for and the only thing this
migration could break.

The real `register_membership()` / `renew_membership()` are **not** executed
here. Their final shape is assembled across five migrations of `ALTER`s over
`members`, `memberships`, `membership_types` and `membership_payments`, and a
hand-rebuilt approximation would risk failing for schema reasons unrelated to
the grant under test. Instead, `run.sh` asserts statically against
`20260917000001_membership_sold_by.sql` that those functions really are
`security invoker` and really do call `log_audit_event`, which is the property
the proxy stands in for. Covering the full membership flow end to end would
need a reception-side harness, which does not exist yet.
