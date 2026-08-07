-- New Member Registration — profile photo + QR code identity.
-- See docs/phase-1/14-reception-membership.md §14.5 for the design note.
--
-- Adds the two pieces the registration form was still missing: a
-- permanent QR identity per member (for the future Check-In system to
-- scan) and wiring for the profile photo, address, and emergency-contact
-- fields that already existed as columns on `members` (20260806000002)
-- but were never exposed through register_membership() or the form.

-- ---------------------------------------------------------------------------
-- QR identity — a separate, revocable token rather than the member's own
-- `id`: reissuing a lost/damaged card should be possible (regenerate this
-- column) without changing the member's real primary key or breaking
-- every foreign key that points at them.
-- ---------------------------------------------------------------------------

alter table members add column qr_code text unique not null default gen_random_uuid()::text;

-- ---------------------------------------------------------------------------
-- register_membership() — extended with trailing, all-optional params for
-- the fields the form collects but the RPC didn't yet accept, and now
-- also returns the new member's qr_code so the client can render it
-- immediately after save without a second round trip.
--
-- `create or replace` does NOT do an in-place replace here: Postgres
-- identifies a function by name *and* its full argument-type list, and
-- adding trailing params changes that list — so `or replace` would
-- register this as a second overload sitting alongside the original
-- 13-param version, not a replacement of it, leaving any call with
-- exactly 13 positional args ambiguous between the two ("could not choose
-- a best candidate function"). Verified against pglite. The old signature
-- is dropped explicitly first so there is exactly one
-- `register_membership()` again.
-- ---------------------------------------------------------------------------

drop function if exists register_membership(
  uuid, text, text, gender, date, text, uuid, text, numeric, numeric, date, membership_payment_method, text
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
  p_photo_url text default null
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
    start_date, end_date, payment_method, notes, created_by
  )
  values (
    v_member_id, p_branch_id, p_membership_type_id, p_receipt_number, p_price, p_discount,
    p_start_date, v_end_date, p_payment_method, p_notes, auth.uid()
  )
  returning id, memberships.membership_number into v_membership_id, v_membership_number;

  insert into membership_payments (membership_id, amount, payment_method, received_by)
  values (v_membership_id, greatest(p_price - p_discount, 0), p_payment_method, auth.uid());

  return query select v_member_id, v_membership_id, v_membership_number, v_qr_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage — a private bucket for member profile photos. Private (not
-- public) because these are real people's photos tied to a private club
-- roster, matching this app's "staff-only" posture everywhere else;
-- access is via a signed URL generated at upload time
-- (SupabaseMemberPhotoRepository), not a public path.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('member-photos', 'member-photos', false)
on conflict (id) do nothing;

create policy "staff read member photos" on storage.objects for select
  using (bucket_id = 'member-photos' and auth_role() is not null);
create policy "reception/branch_manager upload member photos" on storage.objects for insert
  with check (bucket_id = 'member-photos' and auth_role() in ('reception', 'branch_manager', 'super_admin'));
create policy "reception/branch_manager replace member photos" on storage.objects for update
  using (bucket_id = 'member-photos' and auth_role() in ('reception', 'branch_manager', 'super_admin'));
