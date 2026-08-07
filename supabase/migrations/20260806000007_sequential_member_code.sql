-- Sequential, human-readable member IDs.
--
-- members.member_code was originally a random 8-char hex string derived
-- from the row's own UUID (20260806000002) — unique and simple to
-- generate, but not something Reception can read aloud, write on a
-- physical card, or recognize as "the 47th member." Replaced with a plain
-- ascending number formatted "01", "02", ... (two digits minimum; it
-- naturally grows past that, e.g. "100", "1000", once membership crosses
-- those counts — this isn't a hard cap on total members, just the
-- observed range for a club this size today). Member search
-- (SupabaseMemberSearchRepository) already matches against member_code,
-- so no application change was needed for "search by ID" beyond this.

create sequence member_code_seq start 1;
-- Sequences aren't covered by table-level grants — same reason
-- membership_number_seq needed this in 20260806000003.
grant usage on sequence member_code_seq to authenticated;

-- Backfill any members created under the old random-code scheme, in
-- signup order, before the column's default starts consuming the new
-- sequence for future rows.
with numbered as (
  select id, row_number() over (order by created_at) as rn
  from members
)
update members
set member_code = lpad(numbered.rn::text, 2, '0')
from numbered
where members.id = numbered.id;

select setval('member_code_seq', (select count(*) from members) + 1, false);

alter table members alter column member_code drop default;
alter table members alter column member_code
  set default (lpad(nextval('member_code_seq')::text, 2, '0'));
