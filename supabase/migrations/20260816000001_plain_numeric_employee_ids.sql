-- Employee ID format change: a plain sequential number ("1", "2", "15")
-- instead of "EMP-000001" — requested directly ("change id account for
-- employee from 1 to 100 just number"). Confirmed via AskUserQuestion:
-- every existing staff account is renumbered too, not just new ones going
-- forward — every current employee's login ID changes as of this
-- migration. Whoever runs this must tell each current employee their new
-- number afterward (their password is unaffected — only the ID half of
-- their credentials changes).
--
-- Renumbers in the same relative order the original backfill
-- (20260812000001_employee_login.sql) used — created_at — so whoever was
-- "first" is still "1", etc. This is a re-presentation of that same
-- ordering, not a new decision about who gets which number.
--
-- Safe as a single bulk UPDATE: every existing value is in "EMP-######"
-- form and every new value is a bare digit string, so there is no
-- possible collision between an old value and a new one, or against the
-- unique index on employee_code, regardless of row update order.
with numbered as (
  select id, row_number() over (order by created_at) as rn
  from profiles
  where role != 'member' and employee_code is not null
)
update profiles
set employee_code = numbered.rn::text
from numbered
where profiles.id = numbered.id;

select setval('employee_code_seq', (select count(*) from profiles where employee_code is not null) + 1, false);

create or replace function next_employee_code()
returns text
language sql
as $$
  select nextval('employee_code_seq')::text;
$$;
