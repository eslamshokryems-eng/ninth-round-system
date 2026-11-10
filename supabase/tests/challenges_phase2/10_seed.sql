-- Seed data for integration verification. Run as postgres (superuser),
-- which bypasses RLS for setup purposes — exactly as a migration-runner
-- role would. Two branches are seeded specifically so the cross-branch
-- coach-designation tests (70_cross_branch_coach_designation.sql) have a
-- genuine second branch to test isolation against, not just a single
-- branch where "cross-branch" could never actually be exercised.
--
-- Phase 3: participants are now ordinary CUSTOMER profiles (role =
-- 'member', branch_id = null — matching the real schema, where
-- profiles.branch_id is only ever populated for STAFF) identified purely
-- by profiles.id, never by any members/memberships row. The members/
-- memberships tables are still created by 00_schema.sql (Phase 1's own
-- CREATE TABLE statements reference members(id) inline, before Phase 3
-- retargets the FK), but no Challenges test below seeds or reads a row
-- in either — there is nothing left in this feature that touches them.

-- A third branch (D) with no staff/participants of its own at all —
-- exists purely so a MULTI_BRANCH challenge's "not in this challenge's
-- branch list" case can be tested against a real branch, proving the
-- schema needs no redesign as more branches are added later (per the
-- approved architecture's explicit MVP requirement).
insert into branches (id, name) values
  ('00000000-0000-0000-0000-00000000000b', 'Main Branch'),
  ('00000000-0000-0000-0000-00000000000c', 'Second Branch'),
  ('00000000-0000-0000-0000-00000000000e', 'Third Branch (unused by any challenge)');

insert into profiles (id, full_name, role, branch_id, date_of_birth, is_active) values
  ('00000000-0000-0000-0000-000000000001', 'Sam Super', 'super_admin', null, null, true),
  ('00000000-0000-0000-0000-000000000002', 'Mona Manager (Branch B)', 'branch_manager', '00000000-0000-0000-0000-00000000000b', null, true),
  ('00000000-0000-0000-0000-000000000003', 'Coach One (Branch B)', 'coach', '00000000-0000-0000-0000-00000000000b', null, true),
  ('00000000-0000-0000-0000-000000000004', 'Coach Two (Branch B)', 'coach', '00000000-0000-0000-0000-00000000000b', null, true),
  ('00000000-0000-0000-0000-00000000000a', 'Carl Manager (Branch C)', 'branch_manager', '00000000-0000-0000-0000-00000000000c', null, true),
  ('00000000-0000-0000-0000-00000000000d', 'Coach Three (Branch C)', 'coach', '00000000-0000-0000-0000-00000000000c', null, true);

-- Ordinary customers — NOT staff, NOT linked to any members/memberships
-- row. branch_id is null, matching the real schema's convention; their
-- competition branch is always their own choice at registration time
-- (challenge_participants.branch_id), never read from here.
insert into profiles (id, full_name, role, branch_id, date_of_birth, is_active) values
  ('00000000-0000-0000-0000-0000000000a1', 'Alex Customer', 'member', null, '2000-01-01', true), -- adult
  ('00000000-0000-0000-0000-0000000000a2', 'Blair Customer', 'member', null, '2018-01-01', true), -- a minor, for age-eligibility rejection
  ('00000000-0000-0000-0000-0000000000a3', 'Casey Customer', 'member', null, null, true),         -- no date of birth on file
  ('00000000-0000-0000-0000-0000000000a4', 'Drew Customer', 'member', null, '1995-06-15', true);  -- adult, second independent participant
