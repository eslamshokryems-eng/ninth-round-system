-- Login Verification + Trusted Device system. Purely additive: three new
-- tables, zero changes to any existing table, column, policy, or
-- function. See the read-only architecture review delivered earlier in
-- this session for the full design discussion.

-- ---------------------------------------------------------------------------
-- security_settings — key/value so it can hold more than one security
-- setting later without another migration. Currently holds exactly one
-- key: where the device-verification OTP gets emailed. Direct RLS access
-- (not proxied through an API route), same pattern already used for
-- role_permissions/Audit Log — restricted to super_admin only, both read
-- and write. Never a plain env var and never hardcoded in application
-- code, per requirement.
-- ---------------------------------------------------------------------------

create table security_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);

create trigger trg_security_settings_updated_at
  before update on security_settings
  for each row execute function set_updated_at();

alter table security_settings enable row level security;

create policy "super admin reads security settings" on security_settings for select
  using (is_super_admin());
create policy "super admin updates security settings" on security_settings for update
  using (is_super_admin())
  with check (is_super_admin());

-- Seeded empty — a super_admin sets the real destination via the new
-- Security admin page after this migration runs. Never populated with a
-- real address here.
insert into security_settings (key, value) values ('device_verification_admin_email', '');

-- ---------------------------------------------------------------------------
-- trusted_devices — a verified browser/device, tied to the authenticated
-- user (never just a browser globally). RLS enabled, zero policies:
-- unreachable by anon/authenticated, including a super_admin's own
-- browser session — every read/write goes through a service-role Route
-- Handler (apps/web/app/api/auth/device/*), the same locked-down posture
-- admin_audit_log already uses for log_audit_event_as(). Only a hash of
-- the device token is ever stored; the raw value lives only in the
-- caller's HttpOnly cookie.
-- ---------------------------------------------------------------------------

create table trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  device_token_hash text not null,
  device_name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint uq_trusted_devices_user_token unique (user_id, device_token_hash)
);

create index idx_trusted_devices_user on trusted_devices (user_id);
create index idx_trusted_devices_expires on trusted_devices (expires_at);

alter table trusted_devices enable row level security;

-- ---------------------------------------------------------------------------
-- device_verification_codes — a pending or spent one-time verification
-- code. Same locked-down posture as trusted_devices: RLS enabled, zero
-- policies, service-role-only. Only a hash of the code is ever stored.
-- ---------------------------------------------------------------------------

create table device_verification_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  code_hash text not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_device_verification_codes_user on device_verification_codes (user_id);
create index idx_device_verification_codes_pending on device_verification_codes (user_id) where consumed_at is null;

alter table device_verification_codes enable row level security;
