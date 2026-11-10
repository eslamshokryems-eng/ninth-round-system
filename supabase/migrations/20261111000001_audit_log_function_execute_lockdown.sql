-- ---------------------------------------------------------------------------
-- Security fix H-1 (HIGH) and M-2 (MEDIUM): EXECUTE permissions on the two
-- audit-log entry points.
--
-- ===========================================================================
-- H-1 — log_audit_event_as() was callable by anon and authenticated
-- ===========================================================================
-- 20260815000001_audit_log.sql:142-147 states the control outright:
--
--     "Deliberately NOT granted to `authenticated` or `anon` — only a
--      service-role connection (which bypasses grants entirely, same as it
--      already does for every `.from("profiles").update(...)` those routes
--      perform) can reach it. This is what prevents a client from forging
--      an entry attributed to someone else, the gap log_audit_event()
--      above explicitly does not close."
--
-- That control was never implemented. No REVOKE for this function exists
-- anywhere in the repository, and PostgreSQL grants EXECUTE on a new
-- function to PUBLIC by default, so its ACL was simply NULL (= PUBLIC).
-- The function is SECURITY DEFINER, so its INSERT bypasses both the
-- caller's table grants and admin_audit_log's RLS (which deliberately has
-- no INSERT policy). Reproduced during the audit: an ordinary customer AND
-- an unauthenticated anon caller each wrote an admin_audit_log row
-- attributed to the super admin, with a client-supplied p_actor_id and
-- actions reading 'delete_user' and 'disable_user'. That destroys
-- non-repudiation of the audit trail and allows framing an administrator.
--
-- It also invalidates the accepted-risk note at :120-130, which concludes
-- that the worst case for log_audit_event() is "a user adding noise
-- entries correctly attributed to their own account, not framing someone
-- else". Framing someone else was available through this function.
--
-- THE PREMISE OF THAT COMMENT IS ALSO WRONG, and it matters here.
-- service_role does NOT bypass grants. In PostgreSQL only a superuser
-- bypasses privilege checks; Supabase's service_role is a non-superuser
-- with BYPASSRLS, and BYPASSRLS bypasses ROW-LEVEL SECURITY only, never
-- function EXECUTE grants. Measured on an isolated local cluster with a
-- genuine `nologin bypassrls` non-superuser role:
--
--     revoke execute on function probe2() from public;
--     has_function_privilege('svc_bypass','probe2()','EXECUTE')  ->  f
--     set role svc_bypass; select probe2();  ->  ERROR: permission denied
--
-- So service_role reaches log_audit_event_as() today ONLY through the
-- PUBLIC default, and revoking PUBLIC without an explicit grant would
-- break it. An explicit grant to service_role is therefore required, not
-- optional — and it is the verified architecture, not an assumption:
-- log_audit_event_as() has 9 call sites across 7 route handlers, every one
-- of them on a client built as createClient(url, SERVICE_ROLE_KEY):
--
--     apps/web/app/api/staff/create-account/route.ts
--     apps/web/app/api/staff/set-password/route.ts
--     apps/web/app/api/staff/set-active-status/route.ts
--     apps/web/app/api/auth/device/request-code/route.ts
--     apps/web/app/api/auth/device/verify-code/route.ts
--     apps/web/app/api/auth/device/devices/revoke/route.ts
--     apps/web/app/api/auth/device/devices/revoke-all/route.ts
--
-- Each verifies the acting admin's own session (verify-staff-admin.ts /
-- verify-authenticated-user.ts) BEFORE the service-role client is built,
-- which is what makes the p_actor_id it then passes trustworthy. The
-- service-role key is read in exactly those server-side modules and never
-- reaches the browser.
--
-- ===========================================================================
-- M-2 — log_audit_event() was callable by anon
-- ===========================================================================
-- 20260815000001_audit_log.sql:131 grants EXECUTE to `authenticated` but
-- never revokes the PUBLIC default, so PUBLIC retained it and `anon` could
-- call it too. Reproduced: an unauthenticated caller wrote an
-- admin_audit_log row (admin_id NULL, since auth.uid() is NULL).
--
-- The AUTHENTICATED exposure is a different matter: it is documented and
-- explicitly accepted at :120-130, and it must be PRESERVED, because
-- register_membership() and renew_membership() are SECURITY INVOKER
-- (20260815000001:344 and :413) and call log_audit_event() in their
-- bodies, so the inner call executes as the calling user. Both are invoked
-- from the reception pages on the user's OWN session:
--
--     apps/web/app/(reception)/members/new/page.tsx          -> register_membership
--     apps/web/app/(reception)/members/[memberId]/page.tsx   -> renew_membership
--
-- Revoking `authenticated` would break membership registration and
-- renewal outright. This migration therefore revokes PUBLIC and anon only,
-- and re-asserts the authenticated grant so the intent is explicit in the
-- ACL rather than inherited.
--
-- No service_role grant is added for log_audit_event(): the only RPCs the
-- service-role client calls are log_audit_event_as(), next_employee_code()
-- and prepare_staff_deletion(), and the last is SECURITY DEFINER so its
-- own inner log_audit_event() call runs as the function owner, needing no
-- grant. Granting service_role speculatively is exactly what this task
-- was told not to do.
--
-- ===========================================================================
-- Scope and method
-- ===========================================================================
-- Permissions and one comment ONLY. Neither function is dropped,
-- recreated, or altered in body or signature — so nothing about what the
-- audit trail records changes, and no dependent trigger or RPC is
-- invalidated. Both signatures are written out in full and fully
-- qualified. Revoking from PUBLIC leaves the owner's (postgres) implicit
-- privileges untouched. Additive only; no historical migration is edited,
-- renamed or reordered. Re-runnable: REVOKE and GRANT are both idempotent.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- H-1: lock log_audit_event_as() to the trusted server-side path only.
-- ---------------------------------------------------------------------------
revoke execute on function public.log_audit_event_as(uuid, text, text, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

grant execute on function public.log_audit_event_as(uuid, text, text, uuid, jsonb, jsonb, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- M-2: close the anonymous path into log_audit_event(), keep the
-- authenticated one that membership registration and renewal depend on.
-- ---------------------------------------------------------------------------
revoke execute on function public.log_audit_event(text, text, uuid, jsonb, jsonb, jsonb)
  from public, anon;

grant execute on function public.log_audit_event(text, text, uuid, jsonb, jsonb, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Replace the inaccurate guarantee with what the ACL now actually says.
-- ---------------------------------------------------------------------------
comment on function public.log_audit_event_as(uuid, text, text, uuid, jsonb, jsonb, jsonb) is
  'Writes an audit entry attributed to p_actor_id rather than to auth.uid(). EXECUTE is granted to service_role ONLY: revoked from PUBLIC, anon and authenticated by 20261111000001, which is what actually prevents a client from forging an entry attributed to another administrator. Note that service_role does NOT bypass grants (BYPASSRLS covers row-level security only), so that explicit grant is what keeps the staff and device route handlers working. Callers must verify the acting admin''s own session before building the service-role client, as apps/web/app/api/staff/* and apps/web/app/api/auth/device/* do.';

comment on function public.log_audit_event(text, text, uuid, jsonb, jsonb, jsonb) is
  'Writes an audit entry always attributed to the caller''s own auth.uid(). EXECUTE is granted to authenticated, because register_membership() and renew_membership() are SECURITY INVOKER and call this in their bodies; revoked from PUBLIC and anon by 20261111000001. Residual risk, unchanged and still accepted: an authenticated client may call this directly with an arbitrary action/entity, but cannot attribute the entry to anyone but themselves.';
