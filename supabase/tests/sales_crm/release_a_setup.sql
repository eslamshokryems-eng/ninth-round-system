-- LOCAL ONLY. Harness + fixtures for the Sales CRM suites (superuser, before the attack sessions).
\set ON_ERROR_STOP on
drop schema if exists scr cascade; create schema scr;
create table scr.res(ord serial, id text, who text, what text, expected text, actual text, pass boolean);
create table scr.ctx(k text primary key, v text);
-- attempt SQL as the CURRENT role; outcome text; the attempt is rolled back (sub-transaction) so tests do not disturb each other
create function scr.attempt(p_sql text) returns text language plpgsql as $$
declare n bigint; st text; msg text; out text;
begin
  begin
    execute p_sql; get diagnostics n = row_count; out := 'ALLOWED rows='||n;
    raise exception 'scr_rollback' using errcode = 'P0999';
  exception when sqlstate 'P0999' then null;
            when others then get stacked diagnostics st = returned_sqlstate, msg = message_text;
              out := case when msg like 'ATTRIBUTION_GUARD%' or msg like 'SALES_GUARD%' then 'BLOCKED-BY-GUARD '||st else 'DENIED '||st||' '||left(msg,90) end;
  end;
  return out;
end $$;
create function scr.t(p_id text, p_who text, p_what text, p_sql text, p_expect text) returns void language plpgsql as $$
declare r text; begin r := scr.attempt(p_sql);
  insert into scr.res(id,who,what,expected,actual,pass) values (p_id,p_who,p_what,p_expect,r,r ~ p_expect); end $$;
-- evaluate a one-value SELECT as the CURRENT role (RLS applies)
create function scr.val(p_id text, p_who text, p_what text, p_sql text, p_expect text) returns void language plpgsql as $$
declare v text; begin
  begin execute p_sql into v; exception when others then v := 'ERROR '||sqlstate||' '||left(sqlerrm,80); end;
  insert into scr.res(id,who,what,expected,actual,pass) values (p_id,p_who,p_what,p_expect,coalesce(v,'NULL'),case when p_expect='HASH' then true else coalesce(v,'NULL') = p_expect end); end $$;
-- catalog read as the owner; expected 'CAT' = informational (printed for before/after comparison, not pass/fail)
create function scr.valsu(p_id text, p_who text, p_what text, p_sql text, p_expect text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v text; begin execute p_sql into v;
  insert into scr.res(id,who,what,expected,actual,pass) values (p_id,p_who,p_what,case when p_expect='CAT' then 'CAT' else p_expect end, coalesce(v,'NULL'), case when p_expect='CAT' then true else v = p_expect end); end $$;
create function scr.keep(p_k text, p_sql text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r text; begin execute p_sql into r; insert into scr.ctx values (p_k, r) on conflict (k) do update set v = excluded.v; end $$;
create function scr.id(p_k text) returns uuid language sql stable as $$ select v::uuid from scr.ctx where k = p_k $$;
create function scr.eq(p_id text, p_who text, p_what text, p_sql text, p_expect text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v text; begin execute p_sql into v;
  insert into scr.res(id,who,what,expected,actual,pass) values (p_id,p_who,p_what,p_expect,coalesce(v,'NULL'),coalesce(v,'NULL') = p_expect); end $$;
create function scr.tsu(p_id text, p_who text, p_what text, p_sql text, p_expect text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r text; begin r := scr.attempt(p_sql);
  insert into scr.res(id,who,what,expected,actual,pass) values (p_id,p_who,p_what,p_expect,r,r ~ p_expect); end $$;
create function scr.su(p_sql text) returns void language plpgsql security definer set search_path = public, pg_temp as $$ begin execute p_sql; end $$;
grant usage on schema scr to public; grant all on all tables in schema scr to public; grant all on all sequences in schema scr to public; grant execute on all functions in schema scr to public;

-- cast: sales A2 (branch A), manager B, sales B (branch B), deactivated sales employee (branch A)
insert into public.branches (id, name) values ('bbbbbbbb-0000-0000-0000-00000000000b','Branch B') on conflict do nothing;
insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000c2','sc.sales2@t.local','x','{"full_name":"SC Sales A2"}'),
 ('00000000-0000-0000-0000-0000000000c3','sc.mgrb@t.local','x','{"full_name":"SC Manager B"}'),
 ('00000000-0000-0000-0000-0000000000c4','sc.salesb@t.local','x','{"full_name":"SC Sales B"}'),
 ('00000000-0000-0000-0000-0000000000c5','sc.inact@t.local','x','{"full_name":"SC Inactive"}')
on conflict (id) do nothing;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
update public.profiles set role='sales_employee', branch_id='aaaaaaaa-0000-0000-0000-00000000000a' where id='00000000-0000-0000-0000-0000000000c2';
update public.profiles set role='branch_manager', branch_id='bbbbbbbb-0000-0000-0000-00000000000b' where id='00000000-0000-0000-0000-0000000000c3';
update public.profiles set role='sales_employee', branch_id='bbbbbbbb-0000-0000-0000-00000000000b' where id='00000000-0000-0000-0000-0000000000c4';
update public.profiles set role='sales_employee', branch_id='aaaaaaaa-0000-0000-0000-00000000000a' where id='00000000-0000-0000-0000-0000000000c5';
update public.profiles set is_active=false where id='00000000-0000-0000-0000-0000000000c5';
select set_config('request.jwt.claims','',false);

-- leads: A: own1-5 (sales A), other1-4 (sales A2), pool1-3 (unassigned); B: 3 unassigned. One overdue pending follow-up per lead.
insert into public.leads (full_name, phone, branch_id, assigned_to, created_by)
select 'own'||g, '0110000'||lpad(g::text,4,'0'), 'aaaaaaaa-0000-0000-0000-00000000000a'::uuid, '00000000-0000-0000-0000-0000000000a4'::uuid, '00000000-0000-0000-0000-0000000000a2'::uuid from generate_series(1,5) g;
insert into public.leads (full_name, phone, branch_id, assigned_to, created_by)
select 'other'||g, '0120000'||lpad(g::text,4,'0'), 'aaaaaaaa-0000-0000-0000-00000000000a'::uuid, '00000000-0000-0000-0000-0000000000c2'::uuid, '00000000-0000-0000-0000-0000000000a2'::uuid from generate_series(1,4) g;
insert into public.leads (full_name, phone, branch_id, assigned_to, created_by)
select 'pool'||g, '0130000'||lpad(g::text,4,'0'), 'aaaaaaaa-0000-0000-0000-00000000000a'::uuid, null, '00000000-0000-0000-0000-0000000000a2'::uuid from generate_series(1,3) g;
insert into public.leads (full_name, phone, branch_id, assigned_to, created_by)
select 'bpool'||g, '0140000'||lpad(g::text,4,'0'), 'bbbbbbbb-0000-0000-0000-00000000000b'::uuid, null, '00000000-0000-0000-0000-0000000000c3'::uuid from generate_series(1,3) g;
insert into public.lead_followups (lead_id, branch_id, due_at, status, created_by)
select id, branch_id, now() - interval '1 day', 'pending', created_by from public.leads;
