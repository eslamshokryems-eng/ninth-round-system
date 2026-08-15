# Audit Log & Advanced Permissions

Production-safety layers 1 and 3 of the 9th Round platform: a
tamper-resistant audit trail of privileged actions, and a scalable
permission system layered on top of the existing 5-role model. Built as
an **extension** of what already existed, not a parallel system — see
"What already existed" below.

## What already existed

`admin_audit_log` (`supabase/migrations/20260801000007_notifications_and_audit.sql`)
was created on day one but never actually written to or read from
anywhere in the app — dead infrastructure. Its shape was already
correct (`admin_id`/`action`/`target_table`/`target_id`/`before`/`after`/
`created_at` map directly onto `user_id`/`action`/`entity_type`/
`entity_id`/`previous_value`/`new_value`/`timestamp`), so this work
extends that table (new columns, tightened RLS, real writers) rather than
creating a second `audit_logs` table.

The 5-role model (`packages/identity`'s `Role`/`UserRoleName`) already
matched the requested SUPER ADMIN / MANAGER / RECEPTION / SALES / COACH
split exactly (`super_admin` / `branch_manager` / `reception` /
`sales_employee` / `coach`) — no new roles were created.

## Audit Log

### Schema

`admin_audit_log`, extended (`supabase/migrations/20260815000001_audit_log.sql`):

| Column | Meaning |
|---|---|
| `id` | primary key |
| `admin_id` | actor's profile id (nullable — see "auth events" below) |
| `actor_role`, `actor_full_name` | denormalized snapshot at the time of the event, so a later role change or rename doesn't rewrite history |
| `action` | e.g. `create_member`, `renew_membership`, `disable_user` |
| `target_table` | entity type, e.g. `member`, `membership`, `staff` |
| `target_id` | entity id |
| `before`, `after` | jsonb snapshots |
| `metadata` | jsonb — free-form extra context (e.g. `changed_fields`, a failed login's attempted identifier) |
| `created_at` | timestamp |

### Append-only, for real

The previous state let any `branch_manager`/`super_admin`'s own session
`INSERT` an arbitrary row directly (`with check (is_admin())`, no
constraint on `admin_id` or `created_at`) — a weaker guarantee than
append-only. That policy is gone. There is no `INSERT`/`UPDATE`/`DELETE`
policy for `authenticated`/`anon` on `admin_audit_log` at all. Every
write goes through one of three `SECURITY DEFINER` functions:

- **`log_audit_event(...)`** — actor is always the caller's own
  `auth.uid()`. Granted to `authenticated` (needed so
  `register_membership()`/`renew_membership()` can call it). An
  authenticated client could call it directly with an arbitrary
  action/entity — the one thing they cannot forge is *who did it*, since
  `admin_id` is never client-supplied.
- **`log_audit_event_as(p_actor_id, ...)`** — same, but the actor is
  passed explicitly. Not granted to any role; reachable only from a
  service-role connection (the staff Route Handlers). Exists because
  those routes use the service-role key (no `auth.uid()`), but already
  know the real acting admin's id from `verify-staff-admin.ts`.
- **`log_auth_event(p_action, p_identifier)`** — login/failed
  login/logout only (the action is allowlisted inside the function, not
  trusted from the caller). Callable by `anon`, since a failed login has
  no session yet.

### What's logged, and how

| Category | Mechanism |
|---|---|
| Members (create/update) | `AFTER INSERT/UPDATE` trigger on `members` |
| Memberships (create, renew) | Explicit `log_audit_event()` call inside `register_membership()`/`renew_membership()` — a generic trigger can't distinguish "new registration" from "renewal" (both are a plain `INSERT`), so this business meaning has to come from the function that knows it |
| Memberships (update, cancel) | `AFTER UPDATE` trigger on `memberships` — generic `update_membership`, or `cancel_membership` if `status` transitions to `cancelled`; `metadata.changed_fields` lists which columns changed |
| Payments | `AFTER INSERT` trigger on `membership_payments` |
| Check-ins | `AFTER INSERT` trigger on `check_ins`, action forced to `check_in` |
| Staff (create) | Explicit `log_audit_event_as()` call in `/api/staff/create-account` |
| Staff (role change, activate/deactivate) | `AFTER UPDATE` trigger on `profiles` (`log_profile_change()`) when done through an authenticated session (e.g. Manage Staff's "Change Role"); explicit `log_audit_event_as()` when done via a service-role route (Add Employee, Set Active Status) — the trigger stays silent when `auth.uid()` is null so the same event isn't logged twice with two different (one correct, one unknown) actors |
| Password reset (admin-initiated) | Explicit call in `/api/staff/set-password` |
| Login / failed login / logout | `log_auth_event()`, called from `SupabaseAuthPort` |
| Permission changes | Explicit call inside `set_role_permission()`/`set_user_permission_override()`/`clear_user_permission_override()` |

### Explicitly not built (and why)

Several requested actions describe operations that don't exist anywhere
in this app today: **Update/Refund/Void Payment**, **Void/Reprint
Receipt** (receipts *are* `membership_payments` rows here — there's no
separate receipts table), **Correct/Delete Check-in**, **Deactivate/
Reactivate Member** (as distinct from a staff account). `membership_payments`
and `check_ins` have never had `UPDATE`/`DELETE` grants — append-only by
the original design, predating this work. Inventing those business
operations to have something to log would be scope creep ("do not change
existing business logic unless explicitly required"); the logging
plumbing (`log_table_change()`) already supports `UPDATE`/`DELETE` the
moment such a feature is ever built — it just needs a trigger attached.

### Access control

`SELECT` on `admin_audit_log` requires `has_permission('audit_logs.view')`
— seeded to Super Admin only, matching the permission matrix (not
`branch_manager`). The Audit Log page (`/audit-log`) is Super Admin-only
at the UI level too — nav item hidden, page-level guard for direct-URL
access, same pattern as every other role-gated page in this app.

## Security gaps found during this work (fixed, not just reported)

Auditing the existing RLS before adding anything surfaced two real gaps:

1. **Coach could read financial data.** `membership_payments`/`expenses`/
   `other_sales`'s `SELECT` policies used bare `is_branch_staff()`, whose
   role list includes `coach` (needed so coaches can read
   members/memberships/shifts). No UI ever surfaced this for a coach
   account, but the database itself did not enforce it — exactly the
   "hiding a button is not security" gap this request asked to be tested
   for. Fixed by adding an explicit role check to those three policies.
   Verified: coach blocked, reception/branch_manager access unchanged.

2. **Self-privilege-escalation.** `profiles`' `"update own profile"`
   policy (`using (auth.uid() = id)`) had no `WITH CHECK` — and per
   Postgres's documented behavior, an `UPDATE` policy with no `WITH
   CHECK` reuses `USING` for the check too. Any signed-in account could
   have issued `update profiles set role = 'super_admin' where id =
   auth.uid()` directly against the API and self-promoted; the app UI
   never offered this, but the database did not stop it. Fixed with a
   `BEFORE UPDATE` trigger (`protect_privileged_profile_columns()`) that
   blocks a non-admin from changing their own `role`, `branch_id`, or
   `employee_code` — declarative RLS can't express an OLD-vs-NEW column
   comparison on its own, hence the trigger. Verified: self-promotion
   blocked; legitimate self-edits (name, heartbeat) and admin-driven role
   changes both still work.

Both are covered by `pglite` regression tests (see "Verification" below).

## Staff activate / deactivate

Two layers, deliberately, not one:

1. **`profiles.is_active`** — fast to query for the Manage Staff list,
   and feeds `auth_role()`/`is_branch_staff()` (both now require
   `is_active`): the instant an account is disabled, every RLS-gated
   read/write it could do stops working, before/regardless of whether its
   session has expired.
2. **Supabase Auth's `ban_duration`**, set via the Admin API from
   `/api/staff/set-active-status`. This is what makes *signing in* itself
   fail cleanly with a real error — `is_active` alone can't do that,
   since Supabase Auth has no knowledge of an app-level column.

Never a delete: a disabled account's existing payments, memberships,
check-ins, and audit log entries keep referencing its unchanged profile
id — matches "don't destroy a departed staff member's historical
identity."

## Advanced Permissions

### Schema

- **`permissions`** — the catalog (`members.view`, `payments.refund`,
  `audit_logs.view`, 26 keys total, matching the request's list).
- **`role_permissions`** — a role's default grants. Seeded to match
  actual current behavior as closely as sensible (see "Scope" below).
- **`user_permission_overrides`** — grants or revokes one permission for
  one specific account, overriding its role default.
- **`has_permission(p_permission_key)`** — `super_admin` unconditionally
  true; otherwise a per-user override (if one exists) wins; otherwise the
  role default.

Writes go through `set_role_permission()`/`set_user_permission_override()`/
`clear_user_permission_override()`, all `SECURITY DEFINER`, all re-check
`is_super_admin()` themselves (not trusted from the caller), and all log
to the audit trail.

### Scope — what this catalog actually gates today

The catalog is fully wired to the **Audit Log** page's own access check
(`has_permission('audit_logs.view')`) and is the system of record shown
and edited on the new **Permissions** admin page. It is **not**
retrofitted onto every pre-existing RLS policy in this pass — those
policies (`is_branch_staff()`/`auth_role()` checks across members,
memberships, payments, HR, etc.) already enforce real, tested,
database-level restrictions and continue to do so unchanged. Routing all
of them through `has_permission()` instead is a materially larger,
higher-blast-radius change on a live production system than this pass
makes unilaterally.

One concrete consequence: the requested matrix lists MANAGER as
`payments.view` only (not create), but `branch_manager` currently *can*
insert payments at the database level (pre-existing, unchanged
behavior). The seed data reflects current reality, not the aspirational
matrix, so the Permissions page never shows something as "not granted"
that the database would actually still allow. **Recommended follow-up**
(not done here, would need its own review + staging test): retrofit the
membership_payments/memberships/staff RLS policies to consult
`has_permission()` directly, so the catalog becomes the actual
enforcement mechanism everywhere, not just for the two new features.

### UI + database, both

The Permissions page (`/permissions`, Super Admin only) is one half; the
`has_permission()`-gated RLS policy is the other. Per the request's own
framing — hiding a button is not security — every enforcement point this
work adds is checked in both places, and the two security gaps found
above are exactly instances of a UI-level restriction the database
didn't actually back up.

## Verification

All of the above — every new table, function, trigger, and policy — is
verified against a real Postgres engine (`pglite`), not just reviewed by
eye: the full pre-existing regression suite still passes (member/
membership/HR/coach-assignment/employee-login checks, unchanged), plus
new checks covering append-only enforcement (even `super_admin` can't
`INSERT`/`UPDATE` `admin_audit_log` directly), the coach financial-data
fix, the self-promotion fix (blocked) alongside a same-request regression
check (legitimate self-edits and admin-driven role changes still work),
disable/re-enable end-to-end (including that a disabled account is
actually blocked from writing, and that re-enabling restores it), and the
permission override/role-default precedence rules.

## What's intentionally out of scope for this pass

- No self-service "set your own first password" flow (an admin always
  runs Set Password) — unchanged from before this work.
- No mobile UI for anything in this document — Audit Log and Permissions
  are Reception-web-only, matching how HR and Manage Staff were scoped.
- No retrofit of legacy RLS policies onto `has_permission()` — see
  "Scope" above.
- No SYSTEM / "important configuration changes" logging — there is no
  system-settings feature in the app yet to change; `settings.manage` is
  seeded into the permission catalog for when one exists.
