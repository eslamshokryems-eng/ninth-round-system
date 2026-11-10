-- ===========================================================================
-- LOCAL DEV ONLY — the demo cast for the Challenges MVP.
--
-- Creates the accounts, branches and display names that both the browser
-- demo and 20_acceptance_test.sql use. Everything here goes through the
-- same paths the real application uses:
--   * an account is an `auth.users` row, and the profile comes from the
--     trg_on_auth_user_created trigger, exactly as a Supabase signup does;
--   * promoting an account to staff is an UPDATE of profiles.role /
--     branch_id / employee_code performed with the service-role claim set,
--     which is precisely what /api/staff/create-account does with the
--     service-role key (profiles.protect_privileged_profile_columns()
--     refuses it otherwise — that guard is live here, not bypassed);
--   * a display name is set through set_challenge_display_name() as the
--     member themselves, not by writing the table.
--
-- Passwords are a salted SHA-256 of a demo password, computed the same way
-- the local gateway verifies them. This has no security value and must
-- never be pointed at real data.
-- ===========================================================================
\set ON_ERROR_STOP on

-- The gateway's password scheme, kept in SQL so the seed and the gateway
-- cannot disagree about it: sha256(salt || ':' || password), stored as
-- 'sha256$' || salt || '$' || hex.
create or replace function pg_temp.demo_password(p_password text, p_salt text)
returns text language sql immutable as $$
  select 'sha256$' || p_salt || '$' || encode(digest(p_salt || ':' || p_password, 'sha256'), 'hex');
$$;

create or replace function pg_temp.make_account(
  p_id uuid, p_email text, p_full_name text, p_password text
) returns uuid language plpgsql as $$
begin
  insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
  values (p_id, p_email, pg_temp.demo_password(p_password, substr(md5(p_email), 1, 12)),
          jsonb_build_object('full_name', p_full_name))
  on conflict (id) do update
    set email = excluded.email,
        encrypted_password = excluded.encrypted_password,
        raw_user_meta_data = excluded.raw_user_meta_data;
  -- The trigger creates the profile on INSERT only; on a re-run, keep the
  -- name in step with the account.
  update public.profiles set full_name = p_full_name where id = p_id;
  return p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------------
insert into branches (id, name, address, phone) values
  ('11111111-1111-1111-1111-111111111111', 'Nasr City', '12 Abbas El Akkad, Nasr City, Cairo', '+20 2 1234 5678'),
  ('22222222-2222-2222-2222-222222222222', 'Maadi',     '45 Road 9, Maadi, Cairo',             '+20 2 8765 4321')
on conflict (id) do update set name = excluded.name, address = excluded.address;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
-- The founder account that 20260809000001 promoted to super_admin already
-- exists (apply.sh creates it just before that migration runs). Give it a
-- usable email, name and password rather than inventing a second super
-- admin, so the demo exercises the real bootstrap path.
update auth.users
   set email = 'admin@9thround.local',
       encrypted_password = pg_temp.demo_password('demo1234', substr(md5('admin@9thround.local'), 1, 12)),
       raw_user_meta_data = jsonb_build_object('full_name', 'Sameh Fahmy')
 where id = 'aea7db27-3aaa-4701-aed2-f1b49127bdda';
update profiles set full_name = 'Sameh Fahmy' where id = 'aea7db27-3aaa-4701-aed2-f1b49127bdda';

select pg_temp.make_account('aaaa0001-0000-4000-8000-000000000001', 'manager@9thround.local',  'Mona Darwish',  'demo1234');
select pg_temp.make_account('aaaa0002-0000-4000-8000-000000000002', 'coach.one@9thround.local','Karim Hassan',  'demo1234');
select pg_temp.make_account('aaaa0003-0000-4000-8000-000000000003', 'coach.two@9thround.local','Nour El Sayed', 'demo1234');

-- Twelve members, six per branch, with dates of birth that straddle the
-- eligibility rules the acceptance test applies (min_age 16, max_age 39),
-- so both the eligible and the ineligible path are demonstrable.
select pg_temp.make_account('bbbb0001-0000-4000-8000-000000000001', 'member01@9thround.local', 'Youssef Adel',    'demo1234');
select pg_temp.make_account('bbbb0002-0000-4000-8000-000000000002', 'member02@9thround.local', 'Farida Nabil',    'demo1234');
select pg_temp.make_account('bbbb0003-0000-4000-8000-000000000003', 'member03@9thround.local', 'Omar Khaled',     'demo1234');
select pg_temp.make_account('bbbb0004-0000-4000-8000-000000000004', 'member04@9thround.local', 'Salma Ibrahim',   'demo1234');
select pg_temp.make_account('bbbb0005-0000-4000-8000-000000000005', 'member05@9thround.local', 'Hazem Sobhy',     'demo1234');
select pg_temp.make_account('bbbb0006-0000-4000-8000-000000000006', 'member06@9thround.local', 'Nada Mostafa',    'demo1234');
select pg_temp.make_account('bbbb0007-0000-4000-8000-000000000007', 'member07@9thround.local', 'Tarek Moussa',    'demo1234');
select pg_temp.make_account('bbbb0008-0000-4000-8000-000000000008', 'member08@9thround.local', 'Reem Gaber',      'demo1234');
select pg_temp.make_account('bbbb0009-0000-4000-8000-000000000009', 'member09@9thround.local', 'Bassem Lotfy',    'demo1234');
select pg_temp.make_account('bbbb0010-0000-4000-8000-000000000010', 'member10@9thround.local', 'Hana Zaki',       'demo1234');
select pg_temp.make_account('bbbb0011-0000-4000-8000-000000000011', 'member11@9thround.local', 'Ziad Fawzy',      'demo1234');
select pg_temp.make_account('bbbb0012-0000-4000-8000-000000000012', 'member12@9thround.local', 'Laila Shawky',    'demo1234');

-- ---------------------------------------------------------------------------
-- Roles and branches. protect_privileged_profile_columns() allows this only
-- for an admin or service_role, so the claim is set for the duration — the
-- same way the app's /api/staff/* route handlers do it with the
-- service-role key. Not bypassed, not disabled.
-- ---------------------------------------------------------------------------
-- Session-level, not `set local`: psql runs each statement in its own
-- implicit transaction, so a `set local` here would be discarded before the
-- next UPDATE ran.
set request.jwt.claim.role = 'service_role';

update profiles set branch_id = null,                                   employee_code = '1001' where id = 'aea7db27-3aaa-4701-aed2-f1b49127bdda';
update profiles set role = 'branch_manager', branch_id = '11111111-1111-1111-1111-111111111111', employee_code = '2001' where id = 'aaaa0001-0000-4000-8000-000000000001';
update profiles set role = 'coach',          branch_id = '11111111-1111-1111-1111-111111111111', employee_code = '3001' where id = 'aaaa0002-0000-4000-8000-000000000002';
update profiles set role = 'coach',          branch_id = '22222222-2222-2222-2222-222222222222', employee_code = '3002' where id = 'aaaa0003-0000-4000-8000-000000000003';

-- Members: a branch and a date of birth each. Ages (as of the 2026 demo
-- date) are chosen so that member11 is under 16 and member12 is over 39 —
-- the two accounts the acceptance test uses to show an eligibility refusal.
update profiles set branch_id = '11111111-1111-1111-1111-111111111111', date_of_birth = date '1998-03-14', gender = 'male'   where id = 'bbbb0001-0000-4000-8000-000000000001';
update profiles set branch_id = '11111111-1111-1111-1111-111111111111', date_of_birth = date '2001-07-02', gender = 'female' where id = 'bbbb0002-0000-4000-8000-000000000002';
update profiles set branch_id = '11111111-1111-1111-1111-111111111111', date_of_birth = date '1995-11-23', gender = 'male'   where id = 'bbbb0003-0000-4000-8000-000000000003';
update profiles set branch_id = '11111111-1111-1111-1111-111111111111', date_of_birth = date '2003-01-09', gender = 'female' where id = 'bbbb0004-0000-4000-8000-000000000004';
update profiles set branch_id = '11111111-1111-1111-1111-111111111111', date_of_birth = date '1992-06-30', gender = 'male'   where id = 'bbbb0005-0000-4000-8000-000000000005';
update profiles set branch_id = '11111111-1111-1111-1111-111111111111', date_of_birth = date '2000-09-17', gender = 'female' where id = 'bbbb0006-0000-4000-8000-000000000006';
update profiles set branch_id = '22222222-2222-2222-2222-222222222222', date_of_birth = date '1997-04-05', gender = 'male'   where id = 'bbbb0007-0000-4000-8000-000000000007';
update profiles set branch_id = '22222222-2222-2222-2222-222222222222', date_of_birth = date '2002-12-11', gender = 'female' where id = 'bbbb0008-0000-4000-8000-000000000008';
update profiles set branch_id = '22222222-2222-2222-2222-222222222222', date_of_birth = date '1994-08-21', gender = 'male'   where id = 'bbbb0009-0000-4000-8000-000000000009';
update profiles set branch_id = '22222222-2222-2222-2222-222222222222', date_of_birth = date '1999-02-26', gender = 'female' where id = 'bbbb0010-0000-4000-8000-000000000010';
update profiles set branch_id = '22222222-2222-2222-2222-222222222222', date_of_birth = date '2012-05-19', gender = 'male'   where id = 'bbbb0011-0000-4000-8000-000000000011';
update profiles set branch_id = '22222222-2222-2222-2222-222222222222', date_of_birth = date '1979-10-08', gender = 'female' where id = 'bbbb0012-0000-4000-8000-000000000012';

reset request.jwt.claim.role;

-- ---------------------------------------------------------------------------
-- Display names, set BY EACH MEMBER through the real RPC. Deliberately not
-- an INSERT into challenge_display_names: that table has no write policy,
-- and going through the RPC is what proves the uniqueness and
-- reserved-staff-name rules are satisfied by these names.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_names text[] := array[
    'Desert Hawk','Nile Storm','Iron Pharaoh','Cairo Cobra','Sphinx Jab','Papyrus Punch',
    'Maadi Mamba','Red Sea Riptide','Pyramid Piston','Alex Lightning','Little Lion','Veteran Vulture'
  ];
  i int := 1;
begin
  for r in
    select id from public.profiles
     where id::text like 'bbbb%' order by id
  loop
    execute format('set local role authenticated');
    execute format('set local request.jwt.claim.sub = %L', r.id);
    perform public.set_challenge_display_name(v_names[i]);
    execute 'reset role';
    i := i + 1;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Device verification. A staff sign-in from an unrecognised browser is
-- gated by 20260922000001: the employee must enter a 6-digit code that the
-- server emails to the administrator address held in security_settings. On
-- a fresh database that address is empty by design (a super admin sets it
-- on the Security screen), which leaves every staff account locked out of
-- a brand-new local environment — including the super admin who would set
-- it. Setting it here is what that super admin would do first.
--
-- The code itself still has to be issued by the real route handler. No
-- email provider is configured locally, so the send fails AFTER the code
-- row is written; tools/local-dev-stack/README.md explains how to recover
-- the code from the local database for the demo.
set request.jwt.claim.role = 'service_role';
update security_settings set value = 'security@9thround.local'
 where key = 'device_verification_admin_email';
reset request.jwt.claim.role;

-- ---------------------------------------------------------------------------
-- What was created.
-- ---------------------------------------------------------------------------
select 'SEED: branches=' || (select count(*) from branches)
    || ' super_admin=' || (select count(*) from profiles where role = 'super_admin')
    || ' branch_manager=' || (select count(*) from profiles where role = 'branch_manager')
    || ' coach=' || (select count(*) from profiles where role = 'coach')
    || ' member=' || (select count(*) from profiles where role = 'member')
    || ' display_names=' || (select count(*) from challenge_display_names) as seed_summary;
