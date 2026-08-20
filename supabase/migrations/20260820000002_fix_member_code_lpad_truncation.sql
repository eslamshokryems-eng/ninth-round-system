-- Fix the actual root cause of "duplicate key value violates unique
-- constraint members_member_code_key" on every Add Member save.
--
-- This was NEVER a sequence problem — every diagnostic on the live
-- database confirmed member_code_seq was healthy and correctly ahead of
-- every existing member_code. The real bug was dormant since
-- 20260806000007_sequential_member_code.sql, day one of sequential member
-- codes, waiting for total registrations to simply cross 99:
--
--   lpad(nextval('member_code_seq')::text, 2, '0')
--
-- Postgres's lpad(string, length, fill) does not just pad SHORT strings —
-- once the input is LONGER than the target length, it TRUNCATES (keeping
-- only the first `length` characters). So the moment nextval() returns
-- 100, lpad('100', 2, '0') doesn't return "100" — it returns "10",
-- colliding with the real member already holding code "10". Every value
-- from 100 onward truncates the same way (101→"10", 110→"11", 199→"19",
-- ...), guaranteeing a collision for every single registration attempt
-- once the club has more than 99 members, which is exactly what was
-- observed in production. Verified locally: reproduced this exact
-- failure by seeding data past 99 and confirming lpad('100',2,'0')='10',
-- then confirmed this fix inserts 100, 101, 102, ... 115 cleanly with no
-- collisions, and that 1-2 digit numbers still zero-pad correctly (e.g.
-- 7 → "07").
--
-- Fix: compute the target width as whichever is larger, the number's own
-- digit count or 2 — so it only ever pads UP, never truncates. Needs a
-- real function (not a bare column-default expression) so nextval() is
-- called exactly once per insert instead of twice.

create or replace function next_member_code()
returns text
language plpgsql
as $$
declare
  v_num int := nextval('member_code_seq');
begin
  return lpad(v_num::text, greatest(length(v_num::text), 2), '0');
end;
$$;

alter table members alter column member_code drop default;
alter table members alter column member_code set default next_member_code();
