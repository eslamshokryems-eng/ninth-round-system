-- Optional coach + session count on a membership registration/renewal
-- (Add Member / Renew), per the request: "add coach if I need when I add
-- member, and number of sessions if I add coach." Tied to the specific
-- membership row (a new renewal can have a different coach/session count
-- than the previous period), not the member overall — matches how
-- memberships is already an append-only period log
-- (20260806000002's design note). `session_count` is recorded as a plain
-- number only — no usage/decrement tracking, deliberately, matching the
-- scope of this request; a real session-usage log is a larger follow-up
-- feature, not silently included here.
--
-- No FK-level "must actually be a coach" constraint: Postgres FKs can't
-- express "references profiles WHERE role = 'coach'" (that would need a
-- partial-unique-index trick or a trigger), and the UI only ever offers
-- coach-role accounts to pick from — the same app-layer-trusts-the-UI
-- posture already used elsewhere for soft policy choices, not hard
-- invariants.
alter table memberships add column coach_id uuid references profiles (id);
alter table memberships add column session_count integer check (session_count is null or session_count > 0);

-- Same "or replace doesn't work for a changed argument list" issue as
-- 20260806000008's register_membership() change — drop the old signature
-- explicitly first. See that migration's own comment for the full
-- explanation; verified against pglite here too.
drop function if exists register_membership(
  uuid, text, text, gender, date, text, uuid, text, numeric, numeric, date, membership_payment_method, text,
  text, text, text, text
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

  return query select v_member_id, v_membership_id, v_membership_number, v_qr_code;
end;
$$;

drop function if exists renew_membership(
  uuid, uuid, text, numeric, numeric, membership_payment_method, text
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

  return query select v_membership_id, v_membership_number, v_start_date, v_end_date;
end;
$$;
