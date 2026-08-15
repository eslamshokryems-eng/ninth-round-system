-- Production-safety layer 1/3: Audit Log.
--
-- Extends the existing `admin_audit_log` table (created in
-- 20260801000007_notifications_and_audit.sql) rather than creating a
-- second, parallel logging system — that table was already schema-correct
-- (admin_id/action/target_table/target_id/before/after/created_at map
-- directly onto user_id/action/entity_type/entity_id/previous_value/
-- new_value/timestamp) but was never actually written to or read from
-- anywhere in the app. This migration is what turns it into a real,
-- append-only audit trail.
--
-- Design:
--   - Every write goes through log_audit_event() / log_audit_event_as() /
--     log_auth_event() (all SECURITY DEFINER). There is deliberately no
--     INSERT policy for `authenticated`/`anon` on admin_audit_log at all —
--     the previous policy ("with check (is_admin())") let any
--     branch_manager/super_admin's own authenticated session INSERT an
--     arbitrary row directly (any admin_id, any created_at, any content),
--     which is a weaker guarantee than "append-only". Removing that policy
--     and routing every write through a function is what actually enforces
--     append-only, not just "no UPDATE/DELETE policy".
--   - Table-level mutations (members/membership_payments/check_ins/
--     memberships) are captured by a generic trigger, log_table_change(),
--     so app code that writes those tables doesn't need to remember to
--     log anything — it can't forget.
--   - register_membership()/renew_membership() get one explicit
--     log_audit_event() call each for the *membership* row, since a
--     generic trigger can't tell "new registration" from "renewal" apart
--     (both are a plain INSERT into `memberships`) — that distinction is
--     exactly the kind of business-meaning only the calling function
--     knows. The `members` row insert inside register_membership() is
--     still covered by the members-table trigger — no double-logging.
--   - Auth events (login/failed login/logout) aren't table mutations, so
--     they're logged via one narrow, action-allowlisted RPC
--     (log_auth_event()) callable pre-auth (`anon`) since a failed login
--     has no session yet — same trust posture as resolve_login_email()
--     (20260812000001_employee_login.sql).
--
-- What is NOT built here (documented, not silently skipped): Update
-- Payment / Refund / Void Payment / Void Receipt / Correct-or-delete
-- Check-in / Deactivate-or-reactivate Member all describe operations that
-- do not exist anywhere in this app today — membership_payments and
-- check_ins have never had UPDATE/DELETE grants (append-only by original
-- design), and members has no active/inactive concept. Inventing those
-- business operations is out of scope for an audit-log pass ("do not
-- change existing business logic unless explicitly required"); the
-- logging plumbing (log_table_change) already supports UPDATE/DELETE the
-- moment such a feature is ever added — it would just need a trigger
-- attached and, if the operation needs to be gated at all, an RLS policy
-- to allow it in the first place.

-- ---------------------------------------------------------------------------
-- Extend admin_audit_log
-- ---------------------------------------------------------------------------

alter table admin_audit_log alter column admin_id drop not null;
alter table admin_audit_log add column actor_role text;
alter table admin_audit_log add column actor_full_name text;
alter table admin_audit_log add column metadata jsonb not null default '{}'::jsonb;

create index idx_admin_audit_log_action on admin_audit_log (action, created_at desc);
create index idx_admin_audit_log_target on admin_audit_log (target_table, target_id);
create index idx_admin_audit_log_created_at on admin_audit_log (created_at desc);

drop policy "admins read audit log" on admin_audit_log;
drop policy "super_admin-only actions are still logged by admin" on admin_audit_log;

-- Tightened from is_admin() (branch_manager or super_admin) to
-- is_super_admin() only, matching the explicit permission matrix this
-- audit log is being built against ("view audit logs" is listed only
-- under SUPER ADMIN, not MANAGER). Safe to tighten: no UI page reads this
-- table yet, so nothing currently relies on branch_manager access.
create policy "super_admin reads audit log" on admin_audit_log for select
  using (is_super_admin());

-- No insert/update/delete policy for authenticated/anon — see the
-- file-header note. Every write is through a SECURITY DEFINER function.

-- ---------------------------------------------------------------------------
-- log_audit_event() — the general-purpose logging entry point. Actor is
-- always the *caller's own* auth.uid(); there is no way for an
-- authenticated client to attribute an entry to someone else (see
-- log_audit_event_as() below for the one legitimate exception).
-- ---------------------------------------------------------------------------

create or replace function log_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_previous_value jsonb default null,
  p_new_value jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_actor_name text;
  v_log_id uuid;
begin
  select role::text, full_name into v_actor_role, v_actor_name
  from public.profiles where id = auth.uid();

  insert into public.admin_audit_log
    (admin_id, actor_role, actor_full_name, action, target_table, target_id, before, after, metadata)
  values
    (auth.uid(), v_actor_role, v_actor_name, p_action, p_entity_type, p_entity_id, p_previous_value, p_new_value, p_metadata)
  returning id into v_log_id;

  return v_log_id;
end;
$$;

-- Needed so register_membership()/renew_membership() (security invoker —
-- run with the calling user's own privileges) can call this. Triggers
-- don't need a separate grant to call a function; this grant is purely
-- for those two direct `perform log_audit_event(...)` call sites.
--
-- Residual risk, accepted and documented rather than silently ignored: any
-- authenticated client could also call this function directly with an
-- arbitrary action/entity_type/previous_value/new_value. The one thing
-- they cannot forge is *who did it* — admin_id is always their own
-- auth.uid(), never client-supplied — so the worst case is a user adding
-- noise entries correctly attributed to their own account, not framing
-- someone else or hiding their own actions. Closing this completely would
-- require moving all logged writes behind a service-role-only boundary,
-- which is a much larger change than this pass's scope.
grant execute on function log_audit_event(text, text, uuid, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- log_audit_event_as() — same as above, but the actor is passed in
-- explicitly instead of read from auth.uid(). Exists solely for the
-- staff-creation Route Handlers (apps/web/app/api/staff/*), which use the
-- service-role key — a connection with no request.jwt.claim.sub, so
-- auth.uid() would be null even though the acting admin's identity is
-- already known (verified via verify-staff-admin.ts before the
-- service-role client is ever built).
--
-- Deliberately NOT granted to `authenticated` or `anon` — only a
-- service-role connection (which bypasses grants entirely, same as it
-- already does for every `.from("profiles").update(...)` those routes
-- perform) can reach it. This is what prevents a client from forging an
-- entry attributed to someone else, the gap log_audit_event() above
-- explicitly does not close.
-- ---------------------------------------------------------------------------

create or replace function log_audit_event_as(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_previous_value jsonb default null,
  p_new_value jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_actor_name text;
  v_log_id uuid;
begin
  select role::text, full_name into v_actor_role, v_actor_name
  from public.profiles where id = p_actor_id;

  insert into public.admin_audit_log
    (admin_id, actor_role, actor_full_name, action, target_table, target_id, before, after, metadata)
  values
    (p_actor_id, v_actor_role, v_actor_name, p_action, p_entity_type, p_entity_id, p_previous_value, p_new_value, p_metadata)
  returning id into v_log_id;

  return v_log_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- log_auth_event() — login/failed login/logout. Callable pre-auth (a
-- failed login has no session), so the action is allowlisted inside the
-- function body rather than trusted from the caller, and the only payload
-- is a plain identifier string (an email or Employee ID someone typed —
-- not a secret, same trust level as resolve_login_email()'s input).
-- ---------------------------------------------------------------------------

create or replace function log_auth_event(p_action text, p_identifier text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_actor_name text;
begin
  if p_action not in ('login', 'failed_login', 'logout') then
    raise exception 'Invalid auth event action: %', p_action;
  end if;

  if v_actor_id is not null then
    select role::text, full_name into v_actor_role, v_actor_name
    from public.profiles where id = v_actor_id;
  end if;

  insert into public.admin_audit_log (admin_id, actor_role, actor_full_name, action, target_table, metadata)
  values (v_actor_id, v_actor_role, v_actor_name, p_action, 'auth', jsonb_build_object('identifier', p_identifier));
end;
$$;

grant execute on function log_auth_event(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- log_table_change() — generic AFTER trigger for members/membership_payments/
-- check_ins/memberships. Uses to_jsonb(NEW)->>'x' rather than NEW.x
-- throughout because this one function is attached to tables with
-- different shapes — direct field access (NEW.status) would raise "record
-- has no field" at runtime for a table lacking that column.
-- ---------------------------------------------------------------------------

create or replace function log_table_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity_type text := TG_ARGV[0];
  v_action text := TG_ARGV[1];
  v_entity_id uuid;
  v_prev jsonb;
  v_new jsonb;
  v_changed_fields text[];
begin
  if TG_OP = 'INSERT' then
    v_entity_id := (to_jsonb(NEW) ->> 'id')::uuid;
    v_prev := null;
    v_new := to_jsonb(NEW);
    v_action := coalesce(v_action, 'create_' || v_entity_type);
  elsif TG_OP = 'DELETE' then
    v_entity_id := (to_jsonb(OLD) ->> 'id')::uuid;
    v_prev := to_jsonb(OLD);
    v_new := null;
    v_action := coalesce(v_action, 'delete_' || v_entity_type);
  else
    v_entity_id := (to_jsonb(NEW) ->> 'id')::uuid;
    v_prev := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    select array_agg(n.key) into v_changed_fields
    from jsonb_each(to_jsonb(NEW)) n
    join jsonb_each(to_jsonb(OLD)) o using (key)
    where n.value is distinct from o.value;

    if v_entity_type = 'membership'
       and (to_jsonb(NEW) ->> 'status') = 'cancelled'
       and (to_jsonb(OLD) ->> 'status') is distinct from 'cancelled' then
      v_action := 'cancel_membership';
    else
      v_action := coalesce(v_action, 'update_' || v_entity_type);
    end if;
  end if;

  perform public.log_audit_event(
    v_action,
    v_entity_type,
    v_entity_id,
    v_prev,
    v_new,
    case when v_changed_fields is not null then jsonb_build_object('changed_fields', v_changed_fields) else '{}'::jsonb end
  );

  return coalesce(NEW, OLD);
end;
$$;

create trigger trg_audit_members_insert
  after insert on members
  for each row execute function log_table_change('member');
create trigger trg_audit_members_update
  after update on members
  for each row execute function log_table_change('member');

create trigger trg_audit_membership_payments_insert
  after insert on membership_payments
  for each row execute function log_table_change('payment');

-- Action name overridden to 'check_in' (not the auto-derived
-- 'create_check_in') to match the vocabulary this feature is actually
-- called by in the app and in the request this migration implements.
create trigger trg_audit_check_ins_insert
  after insert on check_ins
  for each row execute function log_table_change('check_in', 'check_in');

-- INSERT is deliberately not covered here — see file header. UPDATE
-- covers any future/direct edit to an existing membership (type, dates,
-- coach, status) generically, with the specific fields that changed
-- recorded in metadata.changed_fields.
create trigger trg_audit_memberships_update
  after update on memberships
  for each row execute function log_table_change('membership');

-- ---------------------------------------------------------------------------
-- register_membership() / renew_membership() — same signatures as
-- 20260812000002_membership_coach_assignment.sql (no params added or
-- removed), so `create or replace` is sufficient here; no drop needed.
-- Adds one explicit log_audit_event() call each for the *membership* row
-- (the members-table trigger above already covers the member row insert
-- inside register_membership() — this is not a duplicate of that).
-- ---------------------------------------------------------------------------

create or replace function register_membership(
  p_branch_id uuid,
  p_full_name text,
  p_phone text,
  p_gender gender,
  p_date_of_birth date,
  p_national_id text,
  p_membership_type_id uuid,
  p_receipt_number text,
  p_price numeric,
  p_discount numeric,
  p_start_date date,
  p_payment_method membership_payment_method,
  p_notes text,
  p_address text default null,
  p_emergency_contact_name text default null,
  p_emergency_contact_phone text default null,
  p_photo_url text default null,
  p_coach_id uuid default null,
  p_session_count integer default null
)
returns table (
  member_id uuid,
  membership_id uuid,
  membership_number text,
  member_qr_code text
)
language plpgsql
security invoker
as $$
declare
  v_member_id uuid;
  v_membership_id uuid;
  v_membership_number text;
  v_qr_code text;
  v_duration_days int;
  v_end_date date;
begin
  select duration_days into v_duration_days
  from membership_types where id = p_membership_type_id and is_active;

  if v_duration_days is null then
    raise exception 'Unknown or inactive membership type: %', p_membership_type_id;
  end if;

  v_end_date := p_start_date + v_duration_days;

  insert into members (
    branch_id, full_name, phone, gender, date_of_birth, national_id,
    address, emergency_contact_name, emergency_contact_phone, profile_image_url, created_by
  )
  values (
    p_branch_id, p_full_name, p_phone, p_gender, p_date_of_birth, p_national_id,
    p_address, p_emergency_contact_name, p_emergency_contact_phone, p_photo_url, auth.uid()
  )
  returning id, members.qr_code into v_member_id, v_qr_code;

  insert into memberships (
    member_id, branch_id, membership_type_id, receipt_number, price, discount,
    start_date, end_date, payment_method, notes, coach_id, session_count, created_by
  )
  values (
    v_member_id, p_branch_id, p_membership_type_id, p_receipt_number, p_price, p_discount,
    p_start_date, v_end_date, p_payment_method, p_notes, p_coach_id, p_session_count, auth.uid()
  )
  returning id, memberships.membership_number into v_membership_id, v_membership_number;

  insert into membership_payments (membership_id, amount, payment_method, received_by)
  values (v_membership_id, greatest(p_price - p_discount, 0), p_payment_method, auth.uid());

  perform log_audit_event(
    'create_membership', 'membership', v_membership_id, null,
    jsonb_build_object(
      'member_id', v_member_id, 'membership_number', v_membership_number,
      'coach_id', p_coach_id, 'session_count', p_session_count,
      'price', p_price, 'discount', p_discount, 'start_date', p_start_date, 'end_date', v_end_date
    ),
    '{}'::jsonb
  );

  return query select v_member_id, v_membership_id, v_membership_number, v_qr_code;
end;
$$;

create or replace function renew_membership(
  p_member_id uuid,
  p_membership_type_id uuid,
  p_receipt_number text,
  p_price numeric,
  p_discount numeric,
  p_payment_method membership_payment_method,
  p_notes text,
  p_coach_id uuid default null,
  p_session_count integer default null
)
returns table (membership_id uuid, membership_number text, start_date date, end_date date)
language plpgsql
security invoker
as $$
declare
  v_branch_id uuid;
  v_duration_days int;
  v_current_end_date date;
  v_start_date date;
  v_end_date date;
  v_membership_id uuid;
  v_membership_number text;
begin
  select branch_id into v_branch_id from members where id = p_member_id;
  if v_branch_id is null then
    raise exception 'Unknown member: %', p_member_id;
  end if;

  select duration_days into v_duration_days
  from membership_types where id = p_membership_type_id and is_active;

  if v_duration_days is null then
    raise exception 'Unknown or inactive membership type: %', p_membership_type_id;
  end if;

  select memberships.end_date into v_current_end_date
  from memberships where member_id = p_member_id and status = 'active';

  v_start_date := greatest(coalesce(v_current_end_date, current_date), current_date);
  v_end_date := v_start_date + v_duration_days;

  update memberships set status = 'expired'
  where member_id = p_member_id and status = 'active';

  insert into memberships (
    member_id, branch_id, membership_type_id, receipt_number, price, discount,
    start_date, end_date, payment_method, notes, coach_id, session_count, created_by
  )
  values (
    p_member_id, v_branch_id, p_membership_type_id, p_receipt_number, p_price, p_discount,
    v_start_date, v_end_date, p_payment_method, p_notes, p_coach_id, p_session_count, auth.uid()
  )
  returning id, memberships.membership_number into v_membership_id, v_membership_number;

  insert into membership_payments (membership_id, amount, payment_method, received_by)
  values (v_membership_id, greatest(p_price - p_discount, 0), p_payment_method, auth.uid());

  perform log_audit_event(
    'renew_membership', 'membership', v_membership_id,
    jsonb_build_object('previous_end_date', v_current_end_date),
    jsonb_build_object(
      'member_id', p_member_id, 'membership_number', v_membership_number,
      'coach_id', p_coach_id, 'session_count', p_session_count,
      'price', p_price, 'discount', p_discount, 'start_date', v_start_date, 'end_date', v_end_date
    ),
    '{}'::jsonb
  );

  return query select v_membership_id, v_membership_number, v_start_date, v_end_date;
end;
$$;

-- ---------------------------------------------------------------------------
-- Security gap found during this audit, fixed here: "branch staff read
-- payments"/"...expenses"/"...other sales" used bare is_branch_staff(),
-- whose role list includes 'coach' (needed so coaches can read
-- members/memberships/shifts at their branch) — which meant a coach could
-- also SELECT financial data (payment amounts, expenses, other sales)
-- directly via the API, even though no UI ever surfaces this for coach
-- accounts. "Hiding a button is not security": the button was already
-- hidden (Payments/Receipts nav item is branch_manager/super_admin-only),
-- but the database itself did not enforce it. Tightened to explicitly
-- exclude 'coach' on exactly these three read policies — reception and
-- sales_employee's existing access is unchanged, matching current
-- behavior for every role except this specific coach gap.
-- ---------------------------------------------------------------------------

drop policy "branch staff read payments" on membership_payments;
create policy "branch staff (not coach) read payments" on membership_payments for select
  using (
    auth_role() in ('reception', 'sales_employee', 'branch_manager', 'super_admin')
    and exists (
      select 1 from memberships ms
      where ms.id = membership_payments.membership_id and is_branch_staff(ms.branch_id)
    )
  );

drop policy "branch staff read expenses" on expenses;
create policy "branch staff (not coach) read expenses" on expenses for select
  using (auth_role() in ('reception', 'sales_employee', 'branch_manager', 'super_admin') and is_branch_staff(branch_id));

drop policy "branch staff read other sales" on other_sales;
create policy "branch staff (not coach) read other sales" on other_sales for select
  using (auth_role() in ('reception', 'sales_employee', 'branch_manager', 'super_admin') and is_branch_staff(branch_id));
