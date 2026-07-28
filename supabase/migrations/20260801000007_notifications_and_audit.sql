-- Phase 1 — push notification tokens, in-app notification center, admin audit log.

create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  expo_push_token text not null unique,
  device_type text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_push_tokens_profile on push_tokens (profile_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  type notification_type not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_profile on notifications (profile_id, created_at desc);

create table admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references profiles (id),
  action text not null,
  target_table text not null,
  target_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table push_tokens enable row level security;
alter table notifications enable row level security;
alter table admin_audit_log enable row level security;

create policy "own tokens" on push_tokens for all using (profile_id = auth.uid());
create policy "admins all" on push_tokens for all using ((auth.jwt() ->> 'role') = 'admin');

create policy "own notifications" on notifications for select using (profile_id = auth.uid());
create policy "mark own notifications read" on notifications for update using (profile_id = auth.uid());
create policy "admins all" on notifications for all using ((auth.jwt() ->> 'role') = 'admin');
-- Inserts are performed only by the notifications-send Edge Function via the
-- service-role key (bypasses RLS) — see supabase/functions/notifications-send/README.md.

create policy "admins read audit log" on admin_audit_log for select
  using ((auth.jwt() ->> 'role') = 'admin');
create policy "admins insert audit log" on admin_audit_log for insert
  with check ((auth.jwt() ->> 'role') = 'admin');
