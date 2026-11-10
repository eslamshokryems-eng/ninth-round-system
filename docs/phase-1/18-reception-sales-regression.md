# Reception / Sales before-and-after regression (local, synthetic data)

Harness: `tools/local-dev-stack/regression/` (`run_diff.sh`). Two throwaway local databases are built:

* **baseline** — every repo migration *before* the Challenges set (`STOP_BEFORE=20261105`).
* **full** — baseline plus every Challenges migration.

The identical 69-check scenario runs as reception, sales, branch manager, coach, super admin, customer,
anon and service_role. Synthetic accounts only; nothing here touches any Supabase project.

Result: **69 checks per database; 58 identical, 11 differ.** The full database shows 18 successful
operations and 18 refusals (baseline: 23 and 13). Successful in BOTH databases, identically:
member registration, renewal, check-in, lead create/update/claim, lead conversion, sales
performance, branch isolation (branch-B reception sees no branch-A members), the service-role
staff path (`log_audit_event_as`, role changes), and the privilege-escalation refusals.

## The 11 differences (exact)

| Check | Baseline | Full | Meaning |
|---|---|---|---|
| recep / sales escalate own role; recep move own branch (3) | P0001 "…role, branch, or employee code." | P0001 "…role, branch, employee code, or active status." | Same refusal; message names `is_active` too (it is now protected). |
| recep / mgr / customer `log_audit_event_as` (3) | OK (forged audit row written) | 42501 permission denied | Intended fix H-1: audit-entry forgery closed. Real callers are service-role routes only. |
| anon `log_audit_event` | OK | 42501 | Intended fix M-2. Authenticated callers still allowed (membership flows depend on it). |
| anon `log_audit_event_as` | OK | 42501 | Intended fix H-1. |
| anon `is_admin()` | NULL | false | Intended fail-closed fix. |
| super sees `admin_audit_log` | 21 | 19 | The 2 missing rows are the forged ones above. |
| final audit-action tally | includes `rs_forged` x4, `rs` x1 | absent | Same reason. |

No legitimate Reception or Sales operation changed. Limits: local PostgreSQL 16 with the Supabase
shim, not the live project; the live project's real schema/data/migration history were not compared.
