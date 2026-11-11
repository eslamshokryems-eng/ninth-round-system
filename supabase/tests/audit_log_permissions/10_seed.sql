-- Deterministic fixtures for the audit-log permission tests. Run as
-- postgres (bypasses RLS) exactly as a migration runner would.
--
-- One profile per role the task requires a verdict for, so every test
-- addresses a real identity rather than a synthetic uuid.

insert into profiles (id, full_name, role, is_active) values
  ('00000000-0000-0000-0000-000000000001', 'Sam Super',        'super_admin',    true),
  ('00000000-0000-0000-0000-000000000002', 'Mona Manager',     'branch_manager', true),
  ('00000000-0000-0000-0000-000000000003', 'Coach One',        'coach',          true),
  ('00000000-0000-0000-0000-000000000004', 'Rita Reception',   'reception',      true),
  ('00000000-0000-0000-0000-0000000000a1', 'Alex Customer',    'member',         true);
