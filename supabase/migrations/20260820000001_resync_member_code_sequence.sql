-- Resync member_code_seq — production hit a live collision:
-- "duplicate key value violates unique constraint members_member_code_key".
--
-- member_code_seq only ever moves forward via nextval() and can never
-- repeat a value on its own — a collision means the sequence's current
-- position has fallen behind the highest member_code that actually exists
-- in the table right now. The most likely cause: test member rows were
-- deleted directly (e.g. via the Supabase dashboard) after
-- 20260806000007_sequential_member_code.sql ran, and/or the sequence was
-- reset backward at some point while doing that cleanup — deleting rows
-- never rolls a sequence back on its own, and a manual `setval` to "start
-- fresh" can easily undershoot a code a still-existing member already has.
--
-- Fix: move the sequence forward (only ever forward — `greatest` against
-- its own current value means this can never make things worse, even if
-- the exact cause above isn't quite right) to sit past the highest numeric
-- member_code actually present today. Filters to `~ '^[0-9]+$'` so this is
-- safe even if any pre-sequential-era 8-char hex code ever slipped through.

select setval(
  'member_code_seq',
  greatest(
    (select coalesce(max(member_code::int), 0) from members where member_code ~ '^[0-9]+$'),
    (select last_value from member_code_seq)
  ) + 1,
  false
);
