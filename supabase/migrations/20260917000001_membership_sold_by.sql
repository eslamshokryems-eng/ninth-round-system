-- Sales-person attribution on a membership — "who sold this" — separate
-- from the coach/program (who trains them). Any staff account can be
-- recorded, not just the sales_employee role (a reception or branch_manager
-- account may close a sale directly). Nullable and never backfilled —
-- historical rows stay NULL. Enforced as required going forward at the
-- application layer only (see packages/reception's use cases), the same way
-- membershipTypeId/paymentMethod are already "required" without a DB-level
-- NOT NULL — the column itself must stay nullable since existing rows have
-- no value to backfill.

alter table memberships add column sold_by uuid references profiles (id);

create index idx_memberships_sold_by on memberships (sold_by);

-- register_membership() — add p_sold_by, defaulted so every existing caller
-- (including convert_lead_to_member()'s positional call in
-- 20260821000001_sales_leads_crm.sql) keeps working unchanged. Rebuilt from
-- the 20260916000001 version (20 params, with program_type and the
-- log_audit_event('create_membership', ...) call already restored there) —
-- not an older base.
drop function if exists register_membership(
  uuid, text, text, gender, date, text, uuid, text, numeric, numeric, date, membership_payment_method, text,
  text, text, text, text, uuid, integer, program_type
);

create function register_membership(
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
  p_session_count integer default null,
  p_program_type program_type default null,
  p_sold_by uuid default null
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
    start_date, end_date, payment_method, notes, coach_id, session_count, program_type, sold_by, created_by
  )
  values (
    v_member_id, p_branch_id, p_membership_type_id, p_receipt_number, p_price, p_discount,
    p_start_date, v_end_date, p_payment_method, p_notes, p_coach_id, p_session_count, p_program_type, p_sold_by, auth.uid()
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

-- renew_membership() — same addition. Rebuilt from the 20260916000001
-- version (10 params), preserving its
-- log_audit_event('renew_membership', ...) call.
drop function if exists renew_membership(
  uuid, uuid, text, numeric, numeric, membership_payment_method, text, uuid, integer, program_type
);

create function renew_membership(
  p_member_id uuid,
  p_membership_type_id uuid,
  p_receipt_number text,
  p_price numeric,
  p_discount numeric,
  p_payment_method membership_payment_method,
  p_notes text,
  p_coach_id uuid default null,
  p_session_count integer default null,
  p_program_type program_type default null,
  p_sold_by uuid default null
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
    start_date, end_date, payment_method, notes, coach_id, session_count, program_type, sold_by, created_by
  )
  values (
    p_member_id, v_branch_id, p_membership_type_id, p_receipt_number, p_price, p_discount,
    v_start_date, v_end_date, p_payment_method, p_notes, p_coach_id, p_session_count, p_program_type, p_sold_by, auth.uid()
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

-- sell_additional_membership() — same addition. Rebuilt from the
-- 20260916000001 version (11 params). Never had audit logging (it didn't
-- exist yet when 20260815000001 added the log_audit_event calls), so none
-- is added here either — matches current production behavior.
drop function if exists sell_additional_membership(
  uuid, uuid, text, numeric, numeric, date, membership_payment_method, text, uuid, integer, program_type
);

create function sell_additional_membership(
  p_member_id uuid,
  p_membership_type_id uuid,
  p_receipt_number text,
  p_price numeric,
  p_discount numeric,
  p_start_date date,
  p_payment_method membership_payment_method,
  p_notes text,
  p_coach_id uuid default null,
  p_session_count integer default null,
  p_program_type program_type default null,
  p_sold_by uuid default null
)
returns table (membership_id uuid, membership_number text, start_date date, end_date date)
language plpgsql
security invoker
as $$
declare
  v_branch_id uuid;
  v_duration_days int;
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

  v_end_date := p_start_date + v_duration_days;

  insert into memberships (
    member_id, branch_id, membership_type_id, receipt_number, price, discount,
    start_date, end_date, payment_method, notes, coach_id, session_count, program_type, sold_by, created_by
  )
  values (
    p_member_id, v_branch_id, p_membership_type_id, p_receipt_number, p_price, p_discount,
    p_start_date, v_end_date, p_payment_method, p_notes, p_coach_id, p_session_count, p_program_type, p_sold_by, auth.uid()
  )
  returning id, memberships.membership_number into v_membership_id, v_membership_number;

  insert into membership_payments (membership_id, amount, payment_method, received_by)
  values (v_membership_id, greatest(p_price - p_discount, 0), p_payment_method, auth.uid());

  return query select v_membership_id, v_membership_number, p_start_date, v_end_date;
end;
$$;
