-- Employee ID + two-step account creation for staff (Add Employee ->
-- separate Set Password step, per the HR "Employees" tab spec). Mirrors
-- members.member_code's sequential-code pattern
-- (20260806000007_sequential_member_code.sql) for staff instead of
-- members, under a distinct prefix ("EMP-000001") so the two are never
-- confused.
--
-- profiles gained no phone/address column before now — Add Employee needs
-- both; members already has its own separate phone/address-equivalent
-- fields on the members table, unrelated to this.
alter table profiles add column phone text;
alter table profiles add column address text;
alter table profiles add column employee_code text unique;

create sequence employee_code_seq start 1;
grant usage on sequence employee_code_seq to authenticated;

-- Backfill every existing staff profile (not `member` — members don't log
-- in via Employee ID) with a code, in signup order, before the sequence
-- starts serving new rows. This includes whichever account is reading
-- this sentence via `supabase db push` right now — its own new Employee ID
-- is whatever this backfill assigns it; check with:
--   select employee_code from profiles where id = auth.uid();
with numbered as (
  select id, row_number() over (order by created_at) as rn
  from profiles
  where role != 'member'
)
update profiles
set employee_code = 'EMP-' || lpad(numbered.rn::text, 6, '0')
from numbered
where profiles.id = numbered.id;

select setval('employee_code_seq', (select count(*) from profiles where employee_code is not null) + 1, false);

-- Consumes the next code — called once per Add Employee, from the trusted
-- server-side Route Handler (service_role client), same "consuming
-- sequence read" shape as membership_number's default, just exposed as a
-- callable function instead of a column default (Add Employee doesn't
-- insert a profiles row directly — it goes through auth.users first via
-- the Admin API, which is what actually creates the row via
-- handle_new_user()).
create or replace function next_employee_code()
returns text
language sql
as $$
  select 'EMP-' || lpad(nextval('employee_code_seq')::text, 6, '0');
$$;
grant execute on function next_employee_code() to authenticated;

-- The Employee-ID login lookup. Callable by `anon` — deliberately, since
-- the caller isn't authenticated yet at the point they're trying to log
-- in. Scoped as narrowly as reception_member_lookup()
-- (20260801000003_billing.sql): returns exactly one column (the email an
-- Employee ID maps to, so the client can hand it to the existing
-- email+password sign-in), nothing else about the account. Employee IDs
-- are not secret (spoken aloud, written on physical cards, same trust
-- level as a username) — this is the same category of exposure as any
-- "username or email" login field, not a new class of information leak.
create or replace function resolve_login_email(p_employee_code text)
returns text
language sql stable security definer
set search_path = ''
as $$
  select u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.employee_code = p_employee_code
  limit 1;
$$;
grant execute on function resolve_login_email(text) to anon, authenticated;
