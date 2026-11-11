-- LOCAL ONLY. Synthetic Reception/Sales cast; independent of the Challenges demo seed
-- so the identical file can run on a baseline DB (no Challenges) and the full DB.
\set ON_ERROR_STOP on
create schema if not exists rs;
create table if not exists rs.ctx(k text primary key, v text);
create or replace function rs.try(p_label text, p_sql text) returns text
language plpgsql as $$
declare n bigint; r text; st text; msg text;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return p_label || ' | OK rows=' || n;
exception when others then
  get stacked diagnostics st = returned_sqlstate, msg = message_text;
  msg := regexp_replace(left(msg, 90), '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<uuid>', 'g');
  return p_label || ' | ERR ' || st || ' ' || msg;
end $$;
create or replace function rs.cnt(p_label text, p_table text) returns text
language plpgsql as $$
declare n bigint; st text;
begin
  execute format('select count(*) from %s', p_table) into n;
  return p_label || ' | count=' || n;
exception when others then
  get stacked diagnostics st = returned_sqlstate;
  return p_label || ' | ERR ' || st;
end $$;
create or replace function rs.val(p_label text, p_sql text) returns text
language plpgsql as $$
declare r text; st text; msg text;
begin
  execute p_sql into r;
  return p_label || ' | ' || coalesce(r, 'NULL');
exception when others then
  get stacked diagnostics st = returned_sqlstate, msg = message_text;
  return p_label || ' | ERR ' || st;
end $$;
create or replace function rs.keep(p_key text, p_sql text) returns text
language plpgsql as $$
declare r text; st text;
begin
  execute p_sql into r;
  insert into rs.ctx values (p_key, r) on conflict (k) do update set v = excluded.v;
  return 'keep ' || p_key || ' | ' || case when r is null then 'NULL' else 'set' end;
exception when others then
  get stacked diagnostics st = returned_sqlstate;
  return 'keep ' || p_key || ' | ERR ' || st;
end $$;
grant usage on schema rs to public;
grant all on all tables in schema rs to public;
grant execute on all functions in schema rs to public;

insert into branches (id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'RS Branch A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'RS Branch B')
on conflict (id) do nothing;

insert into membership_types (id, name, duration_days, price)
values ('cccccccc-0000-0000-0000-0000000000c1', 'RS Monthly', 30, 1000)
on conflict (id) do nothing;

-- accounts: auth.users row -> profile by trigger, then promote as service role
insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1','rs.super@t.local','x','{"full_name":"RS Super"}'),
 ('00000000-0000-0000-0000-0000000000a2','rs.mgr@t.local','x','{"full_name":"RS Manager A"}'),
 ('00000000-0000-0000-0000-0000000000a3','rs.recep@t.local','x','{"full_name":"RS Reception A"}'),
 ('00000000-0000-0000-0000-0000000000a4','rs.sales@t.local','x','{"full_name":"RS Sales A"}'),
 ('00000000-0000-0000-0000-0000000000a5','rs.coach@t.local','x','{"full_name":"RS Coach A"}'),
 ('00000000-0000-0000-0000-0000000000a6','rs.recepb@t.local','x','{"full_name":"RS Reception B"}'),
 ('00000000-0000-0000-0000-0000000000a7','rs.cust@t.local','x','{"full_name":"RS Customer"}')
on conflict (id) do nothing;

select set_config('request.jwt.claims','{"role":"service_role"}',false);
update profiles set role='super_admin' where id='00000000-0000-0000-0000-0000000000a1';
update profiles set role='branch_manager', branch_id='aaaaaaaa-0000-0000-0000-00000000000a' where id='00000000-0000-0000-0000-0000000000a2';
update profiles set role='reception',      branch_id='aaaaaaaa-0000-0000-0000-00000000000a' where id='00000000-0000-0000-0000-0000000000a3';
update profiles set role='sales_employee', branch_id='aaaaaaaa-0000-0000-0000-00000000000a' where id='00000000-0000-0000-0000-0000000000a4';
update profiles set role='coach',          branch_id='aaaaaaaa-0000-0000-0000-00000000000a' where id='00000000-0000-0000-0000-0000000000a5';
update profiles set role='reception',      branch_id='bbbbbbbb-0000-0000-0000-00000000000b' where id='00000000-0000-0000-0000-0000000000a6';
select set_config('request.jwt.claims','',false);
