-- Seed for the identity authorization tests. Run as postgres (bypasses
-- RLS), exactly as a migration runner would.

insert into branches (id, name) values
  ('00000000-0000-0000-0000-00000000000b', 'Main Branch'),
  ('00000000-0000-0000-0000-00000000000c', 'Second Branch');

insert into profiles (id, full_name, role, branch_id, employee_code, is_active) values
  ('00000000-0000-0000-0000-000000000001', 'Sam Super',              'super_admin',    null,                                   'EMP-000001', true),
  ('00000000-0000-0000-0000-000000000002', 'Mona Manager (B)',       'branch_manager', '00000000-0000-0000-0000-00000000000b', 'EMP-000002', true),
  ('00000000-0000-0000-0000-000000000003', 'Rita Reception (B)',     'reception',      '00000000-0000-0000-0000-00000000000b', 'EMP-000003', true),
  ('00000000-0000-0000-0000-000000000004', 'Sally Sales (B)',        'sales_employee', '00000000-0000-0000-0000-00000000000b', 'EMP-000004', true),
  ('00000000-0000-0000-0000-000000000005', 'Carl Manager (C)',       'branch_manager', '00000000-0000-0000-0000-00000000000c', 'EMP-000005', true),
  ('00000000-0000-0000-0000-0000000000a1', 'Alex Customer',          'member',         null,                                   null,         true);

-- A lead for the reassignment guard.
insert into leads (id, branch_id, assigned_to, created_by) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002');
