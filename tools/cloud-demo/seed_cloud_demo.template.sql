-- 9th Round Challenges: synthetic demo cast for the CLOUD staging project. Needs :hash (bcrypt of the demo password).
insert into branches (id,name,address,phone) values ('11111111-1111-1111-1111-111111111111','Nasr City','12 Abbas El Akkad, Nasr City, Cairo','+20 2 1234 5678'),('22222222-2222-2222-2222-222222222222','Maadi','45 Road 9, Maadi, Cairo','+20 2 8765 4321') on conflict (id) do nothing;
create temp table _acc(id uuid,email text,full_name text) on commit drop;
insert into _acc values
('aaaa0001-0000-4000-8000-000000000001','manager@9thround.local','Mona Darwish'),
('aaaa0002-0000-4000-8000-000000000002','coach.one@9thround.local','Karim Hassan'),
('aaaa0003-0000-4000-8000-000000000003','coach.two@9thround.local','Nour El Sayed'),
('bbbb0001-0000-4000-8000-000000000001','member01@9thround.local','Youssef Adel'),
('bbbb0002-0000-4000-8000-000000000002','member02@9thround.local','Farida Nabil'),
('bbbb0003-0000-4000-8000-000000000003','member03@9thround.local','Omar Khaled'),
('bbbb0004-0000-4000-8000-000000000004','member04@9thround.local','Salma Ibrahim'),
('bbbb0005-0000-4000-8000-000000000005','member05@9thround.local','Hazem Sobhy'),
('bbbb0006-0000-4000-8000-000000000006','member06@9thround.local','Nada Mostafa'),
('bbbb0007-0000-4000-8000-000000000007','member07@9thround.local','Tarek Moussa'),
('bbbb0008-0000-4000-8000-000000000008','member08@9thround.local','Reem Gaber'),
('bbbb0009-0000-4000-8000-000000000009','member09@9thround.local','Bassem Lotfy'),
('bbbb0010-0000-4000-8000-000000000010','member10@9thround.local','Hana Zaki'),
('bbbb0011-0000-4000-8000-000000000011','member11@9thround.local','Ziad Fawzy'),
('bbbb0012-0000-4000-8000-000000000012','member12@9thround.local','Laila Shawky');
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'HASH_PLACEHOLDER',now(),'{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('full_name',full_name),now(),now(),'','','',''
from _acc on conflict (id) do nothing;
insert into auth.identities (id,user_id,identity_data,provider,provider_id,last_sign_in_at,created_at,updated_at)
select gen_random_uuid(),id,jsonb_build_object('sub',id::text,'email',email,'email_verified',true),'email',id::text,now(),now(),now() from _acc
 where not exists (select 1 from auth.identities i where i.user_id=_acc.id);
update auth.users set encrypted_password='HASH_PLACEHOLDER', raw_user_meta_data=jsonb_build_object('full_name','Sameh Fahmy'), updated_at=now() where id='aea7db27-3aaa-4701-aed2-f1b49127bdda';
update public.profiles set full_name='Sameh Fahmy' where id='aea7db27-3aaa-4701-aed2-f1b49127bdda';
update public.profiles p set full_name=a.full_name from _acc a where a.id=p.id;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update profiles set branch_id=null, employee_code='1001' where id='aea7db27-3aaa-4701-aed2-f1b49127bdda';
update profiles set role='branch_manager', branch_id='11111111-1111-1111-1111-111111111111', employee_code='2001' where id='aaaa0001-0000-4000-8000-000000000001';
update profiles set role='coach', branch_id='11111111-1111-1111-1111-111111111111', employee_code='3001' where id='aaaa0002-0000-4000-8000-000000000002';
update profiles set role='coach', branch_id='22222222-2222-2222-2222-222222222222', employee_code='3002' where id='aaaa0003-0000-4000-8000-000000000003';
update profiles set branch_id='11111111-1111-1111-1111-111111111111', date_of_birth=date '1998-03-14', gender='male' where id='bbbb0001-0000-4000-8000-000000000001';
update profiles set branch_id='11111111-1111-1111-1111-111111111111', date_of_birth=date '2001-07-02', gender='female' where id='bbbb0002-0000-4000-8000-000000000002';
update profiles set branch_id='11111111-1111-1111-1111-111111111111', date_of_birth=date '1995-11-23', gender='male' where id='bbbb0003-0000-4000-8000-000000000003';
update profiles set branch_id='11111111-1111-1111-1111-111111111111', date_of_birth=date '2003-01-09', gender='female' where id='bbbb0004-0000-4000-8000-000000000004';
update profiles set branch_id='11111111-1111-1111-1111-111111111111', date_of_birth=date '1992-06-30', gender='male' where id='bbbb0005-0000-4000-8000-000000000005';
update profiles set branch_id='11111111-1111-1111-1111-111111111111', date_of_birth=date '2000-09-17', gender='female' where id='bbbb0006-0000-4000-8000-000000000006';
update profiles set branch_id='22222222-2222-2222-2222-222222222222', date_of_birth=date '1997-04-05', gender='male' where id='bbbb0007-0000-4000-8000-000000000007';
update profiles set branch_id='22222222-2222-2222-2222-222222222222', date_of_birth=date '2002-12-11', gender='female' where id='bbbb0008-0000-4000-8000-000000000008';
update profiles set branch_id='22222222-2222-2222-2222-222222222222', date_of_birth=date '1994-08-21', gender='male' where id='bbbb0009-0000-4000-8000-000000000009';
update profiles set branch_id='22222222-2222-2222-2222-222222222222', date_of_birth=date '1999-02-26', gender='female' where id='bbbb0010-0000-4000-8000-000000000010';
update profiles set branch_id='22222222-2222-2222-2222-222222222222', date_of_birth=date '2012-05-19', gender='male' where id='bbbb0011-0000-4000-8000-000000000011';
update profiles set branch_id='22222222-2222-2222-2222-222222222222', date_of_birth=date '1979-10-08', gender='female' where id='bbbb0012-0000-4000-8000-000000000012';
select set_config('request.jwt.claims','',true);
do $$
declare r record; v_names text[] := array['Desert Hawk','Nile Storm','Iron Pharaoh','Cairo Cobra','Sphinx Jab','Papyrus Punch','Maadi Mamba','Red Sea Riptide','Pyramid Piston','Alex Lightning','Little Lion','Veteran Vulture']; i int := 1;
begin
  for r in select id from public.profiles where id::text like 'bbbb%' order by id loop
    perform set_config('request.jwt.claims', json_build_object('role','authenticated','sub',r.id)::text, true);
    set local role authenticated;
    perform public.set_challenge_display_name(v_names[i]);
    reset role;
    i := i + 1;
  end loop;
  perform set_config('request.jwt.claims','',true);
end $$;
do $$
declare v_season uuid; v_branch uuid; v_global uuid; v_open uuid;
begin
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"aea7db27-3aaa-4701-aed2-f1b49127bdda"}',true);
  set local role authenticated;
  v_season := public.create_challenge_season('Winter 2026','The first competitive season.',date '2026-11-01',date '2027-02-28');
  perform public.set_challenge_weight_range(1,20);
  select challenge_id into v_global from public.create_challenge(v_season,'All-Branch Plank Hold','Longest plank across every branch.','hybrid_fitness'::challenge_category,'ninth_round'::program_type,'GLOBAL'::challenge_scope,null,'TIME'::challenge_measurement_type,'seconds','HIGHER_IS_BETTER'::challenge_scoring_direction,15,now()-interval '2 days',now()+interval '14 days',now()-interval '1 day',now()+interval '21 days','[]'::jsonb,null);
  select challenge_id into v_open from public.create_challenge(v_season,'Winter Kickboxing Round Sprint','Most scoring strikes in one 3-minute round. Registration is open now.','kickboxing'::challenge_category,'kickboxing'::program_type,'GLOBAL'::challenge_scope,null,'COUNT'::challenge_measurement_type,'strikes','HIGHER_IS_BETTER'::challenge_scoring_direction,12,now()-interval '1 day',now()+interval '30 days',now()+interval '31 days',now()+interval '60 days','[]'::jsonb,null);
  perform public.add_challenge_eligibility_rule(v_global,'min_age',16);
  perform public.add_challenge_eligibility_rule(v_global,'max_age',39);
  perform public.set_challenge_status(v_global,'published','Announcing the competition.');
  perform public.set_challenge_status(v_global,'registration_open','Opening entries.');
  perform public.set_challenge_status(v_open,'published','Announcing the competition.');
  perform public.set_challenge_status(v_open,'registration_open','Opening entries.');
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"aaaa0001-0000-4000-8000-000000000001"}',true);
  select challenge_id into v_branch from public.create_challenge(v_season,'Nasr City Push-Up Championship','Most clean push-ups in two minutes. Judged by your assigned coach.','strength'::challenge_category,'ninth_round'::program_type,'BRANCH'::challenge_scope,'11111111-1111-1111-1111-111111111111','COUNT'::challenge_measurement_type,'reps','HIGHER_IS_BETTER'::challenge_scoring_direction,10,now()-interval '2 days',now()+interval '14 days',now()-interval '1 day',now()+interval '21 days','[{"rule_type":"min_age","value":{"age":16}},{"rule_type":"max_age","value":{"age":39}}]'::jsonb,null);
  perform public.set_challenge_status(v_branch,'published','Announcing the competition.');
  perform public.set_challenge_status(v_branch,'registration_open','Opening entries for the branch.');
  reset role;
  perform set_config('request.jwt.claims','',true);
end $$;
select 'SEED: users='||(select count(*) from auth.users)||' roles='||(select string_agg(role||':'||n,',') from (select role::text role,count(*) n from profiles group by 1 order by 1) s)||' names='||(select count(*) from challenge_display_names)||' challenges='||(select count(*) from challenges)||' open='||(select count(*) from challenges where status='registration_open') as summary;