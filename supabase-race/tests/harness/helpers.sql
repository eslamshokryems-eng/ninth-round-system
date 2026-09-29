-- Test helpers for supabase/tests/race (loaded by run.sh after migrations).
-- Lives in its own schema `race_test`; never part of a migration.

create schema race_test;
grant usage on schema race_test to anon, authenticated, service_role;

-- Named fixture ids shared across test files.
create table race_test.fx (key text primary key, id uuid not null);
grant select on race_test.fx to anon, authenticated, service_role;
create function race_test.id(p_key text) returns uuid language sql stable as $$
  select id from race_test.fx where key = p_key
$$;

-- JS twin schedule (docs/race/scripts/timing-validation.mjs --csv), loaded by run.sh.
create table race_test.js_schedule (
  athlete_no int primary key, heat_number int, slot_index int, slot_start_ms bigint, bind_at_ms bigint,
  announce_at_ms bigint, s09_start_ms bigint, finish_ms bigint, heat_anchor_ms bigint,
  heat_last_start_ms bigint, next_heat_anchor_ms bigint
);

-- Act as an API caller exactly like PostgREST does: role + JWT claims GUCs.
create function race_test.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;

create function race_test.login(p_key text) returns void language sql as $$
  select race_test.login(race_test.id(p_key))
$$;

create function race_test.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '{"role":"anon"}', false);
  perform set_config('role', 'anon', false);
end $$;

create function race_test.service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
  perform set_config('role', 'service_role', false);
end $$;

-- Assertions -----------------------------------------------------------------
create function race_test.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FAIL: %', p_label;
  end if;
  raise notice 'PASS  %', p_label;
end $$;

create function race_test.eq(p_got anyelement, p_want anyelement, p_label text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL: % — got %, want %', p_label, p_got, p_want;
  end if;
  raise notice 'PASS  %', p_label;
end $$;

-- Statement must raise; error text must contain p_expect (case-insensitive).
create function race_test.throws(p_sql text, p_expect text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_expect is null or sqlerrm ilike '%' || p_expect || '%' then
      raise notice 'PASS  % [refused: %]', p_label, left(sqlerrm, 80);
      return;
    end if;
    raise exception 'FAIL: % — expected error containing "%", got "%"', p_label, p_expect, sqlerrm;
  end;
  raise exception 'FAIL: % — expected an error, statement succeeded', p_label;
end $$;

-- Rows affected by a DML statement (RLS silently filters UPDATE/DELETE).
create function race_test.affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

create function race_test.count(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') s' into n;
  return n;
end $$;

grant execute on all functions in schema race_test to anon, authenticated, service_role;

-- Fixture builders (run as postgres) -------------------------------------------
-- flags: S = super admin, C = may create events. The profile row is created by the auth trigger, with no authority.
create function race_test.make_user(p_key text, p_flags text default '') returns uuid language plpgsql as $$
declare v uuid;
begin
  if p_key = 'super' then
    v := 'aea7db27-3aaa-4701-aed2-f1b49127bdda';
    insert into auth.users (id, email, raw_user_meta_data) values (v, 'super@race.test', '{"full_name":"Super"}');
  else
    insert into auth.users (email, raw_user_meta_data)
    values (p_key || '@race.test', jsonb_build_object('full_name', initcap(replace(p_key, '_', ' '))))
    returning id into v;
  end if;
  update public.race_profiles set is_super_admin = position('S' in p_flags) > 0, can_create_events = position('C' in p_flags) > 0 where id = v;
  insert into race_test.fx values (p_key, v);
  return v;
end $$;

create function race_test.put(p_key text, p_id uuid) returns uuid language sql security definer as $$
  insert into race_test.fx values (p_key, p_id) returning id
$$;
grant execute on function race_test.put(text, uuid) to anon, authenticated, service_role;

-- Shared TS/SQL parity fixture (packages/race/domain/parity-cases.json), loaded by run.sh.
create table race_test.parity (doc jsonb not null);
grant select on race_test.parity to public;
