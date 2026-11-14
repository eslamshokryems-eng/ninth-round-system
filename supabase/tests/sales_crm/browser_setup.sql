-- LOCAL ONLY. Accounts + leads for the Sales Workspace browser run (password demo1234; gateway hash format). Demo branches: Nasr City / Maadi.
create extension if not exists pgcrypto;
create function pg_temp.pw(p text, s text) returns text language sql as $$ select 'sha256$'||s||'$'||encode(digest(s||':'||p,'sha256'),'hex') $$;
insert into auth.users(id,email,encrypted_password,raw_user_meta_data)
select v.id::uuid, v.email, pg_temp.pw('demo1234', substr(md5(v.email),1,12)), jsonb_build_object('full_name', v.nm)
from (values ('aaaa0021-0000-4000-8000-000000000021','sales1@9thround.local','Nasr Sales One'),
             ('aaaa0022-0000-4000-8000-000000000022','sales2@9thround.local','Nasr Sales Two'),
             ('aaaa0023-0000-4000-8000-000000000023','sales3@9thround.local','Maadi Sales Three'),
             ('aaaa0010-0000-4000-8000-000000000010','manager2@9thround.local','Maadi Manager')) v(id,email,nm)
on conflict (id) do nothing;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"aea7db27-3aaa-4701-aed2-f1b49127bdda"}',false);
update profiles set role='sales_employee', branch_id='11111111-1111-1111-1111-111111111111' where id in ('aaaa0021-0000-4000-8000-000000000021','aaaa0022-0000-4000-8000-000000000022');
update profiles set role='sales_employee', branch_id='22222222-2222-2222-2222-222222222222' where id='aaaa0023-0000-4000-8000-000000000023';
update profiles set role='branch_manager', branch_id='22222222-2222-2222-2222-222222222222' where id='aaaa0010-0000-4000-8000-000000000010';
select set_config('request.jwt.claims','',false);
-- leads (superuser inserts: history triggers record nothing without an actor, which is fine for fixtures)
insert into leads (id, full_name, phone, branch_id, assigned_to, created_by, status, source, interest_level, last_contacted_at) values
 ('1ead0001-0000-4000-8000-000000000001','Overdue Olga',   '01011110001','11111111-1111-1111-1111-111111111111','aaaa0021-0000-4000-8000-000000000021','aaaa0001-0000-4000-8000-000000000001','contacted','phone','warm', now() - interval '3 days'),
 ('1ead0002-0000-4000-8000-000000000002','Today Tamer',    '01011110002','11111111-1111-1111-1111-111111111111','aaaa0021-0000-4000-8000-000000000021','aaaa0001-0000-4000-8000-000000000001','follow_up','walk_in','warm', now() - interval '1 day'),
 ('1ead0003-0000-4000-8000-000000000003','Brand New Nadia','01011110003','11111111-1111-1111-1111-111111111111','aaaa0021-0000-4000-8000-000000000021','aaaa0001-0000-4000-8000-000000000001','new','instagram','warm', null),
 ('1ead0004-0000-4000-8000-000000000004','Hot Hassan',     '01011110004','11111111-1111-1111-1111-111111111111','aaaa0021-0000-4000-8000-000000000021','aaaa0001-0000-4000-8000-000000000001','follow_up','referral','hot', now() - interval '1 day'),
 ('1ead0005-0000-4000-8000-000000000005','Nobody Nora',    '01011110005','11111111-1111-1111-1111-111111111111','aaaa0021-0000-4000-8000-000000000021','aaaa0001-0000-4000-8000-000000000001','contacted','website','warm', now() - interval '9 days'),
 ('1ead0006-0000-4000-8000-000000000006','Two Tarek',      '01011110006','11111111-1111-1111-1111-111111111111','aaaa0022-0000-4000-8000-000000000022','aaaa0001-0000-4000-8000-000000000001','new','phone','warm', null),
 ('1ead0007-0000-4000-8000-000000000007','Inbox Ines',     '01011110007','11111111-1111-1111-1111-111111111111',null,'aaaa0001-0000-4000-8000-000000000001','new','facebook','warm', null),
 ('1ead0008-0000-4000-8000-000000000008','Maadi Mona',     '01011110008','22222222-2222-2222-2222-222222222222','aaaa0023-0000-4000-8000-000000000023','aaaa0010-0000-4000-8000-000000000010','new','phone','warm', null);
-- next actions: Olga overdue (2 days ago), Tamer today (later today), Hassan tomorrow; Nora has none; Nadia none (never contacted)
insert into lead_followups (lead_id, branch_id, due_at, status, created_by, kind) values
 ('1ead0001-0000-4000-8000-000000000001','11111111-1111-1111-1111-111111111111', now() - interval '2 days', 'pending','aaaa0001-0000-4000-8000-000000000001','call'),
 ('1ead0002-0000-4000-8000-000000000002','11111111-1111-1111-1111-111111111111', (date_trunc('day', now() at time zone 'Africa/Cairo') + interval '23 hours 30 minutes') at time zone 'Africa/Cairo', 'pending','aaaa0001-0000-4000-8000-000000000001','whatsapp'),
 ('1ead0004-0000-4000-8000-000000000004','11111111-1111-1111-1111-111111111111', now() + interval '1 day', 'pending','aaaa0001-0000-4000-8000-000000000001','visit');
-- ---- CRM E2E (conversion, lost/reopen, follow-ups page, inbox, unauthorized) ----
insert into membership_types (id, name, duration_days, price, is_active) values ('e2e00001-0000-4000-8000-000000000001','E2E Monthly',30,1500,true) on conflict (id) do nothing;
insert into auth.users(id,email,encrypted_password,raw_user_meta_data)
select 'aaaa0031-0000-4000-8000-000000000031'::uuid, 'reception1@9thround.local', pg_temp.pw('demo1234', substr(md5('reception1@9thround.local'),1,12)), '{"full_name":"Nasr Reception"}'::jsonb
on conflict (id) do nothing;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"aea7db27-3aaa-4701-aed2-f1b49127bdda"}',false);
update profiles set role='reception', branch_id='11111111-1111-1111-1111-111111111111' where id='aaaa0031-0000-4000-8000-000000000031';
select set_config('request.jwt.claims','',false);
insert into leads (id, full_name, phone, branch_id, assigned_to, created_by, status, source, interest_level, last_contacted_at, gender) values
 ('1ead0011-0000-4000-8000-000000000011','Lost Laila',   '01011110011','11111111-1111-1111-1111-111111111111','aaaa0021-0000-4000-8000-000000000021','aaaa0001-0000-4000-8000-000000000001','contacted','phone','cold', now() - interval '2 days', 'female'),
 ('1ead0012-0000-4000-8000-000000000012','Convert Karim','01011110012','11111111-1111-1111-1111-111111111111','aaaa0021-0000-4000-8000-000000000021','aaaa0001-0000-4000-8000-000000000001','follow_up','walk_in','hot', now() - interval '1 day', 'male'),
 ('1ead0013-0000-4000-8000-000000000013','Pool Pete',    '01011110013','11111111-1111-1111-1111-111111111111',null,'aaaa0001-0000-4000-8000-000000000001','new','facebook','warm', null, 'male'),
 ('1ead0014-0000-4000-8000-000000000014','Team Tina',    '01011110014','11111111-1111-1111-1111-111111111111','aaaa0022-0000-4000-8000-000000000022','aaaa0001-0000-4000-8000-000000000001','follow_up','referral','hot', now() - interval '1 day', 'female');
insert into lead_followups (lead_id, branch_id, due_at, status, created_by, kind) values
 ('1ead0011-0000-4000-8000-000000000011','11111111-1111-1111-1111-111111111111', now() + interval '1 day', 'pending','aaaa0001-0000-4000-8000-000000000001','call'),
 ('1ead0012-0000-4000-8000-000000000012','11111111-1111-1111-1111-111111111111', now() + interval '3 hours', 'pending','aaaa0001-0000-4000-8000-000000000001','visit'),
 ('1ead0014-0000-4000-8000-000000000014','11111111-1111-1111-1111-111111111111', now() + interval '1 day', 'pending','aaaa0001-0000-4000-8000-000000000001','call');
