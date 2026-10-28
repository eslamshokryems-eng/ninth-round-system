-- TS/SQL parity for the station-layout rules: packages/league/domain/layout-cases.json (loaded by league.sh into race_test.league_layout_cases) is run through
-- race_league_validate_layout and race_league_station_total. The TypeScript twin (layout.ts) must give the same verdict, the same normalized layout and the same message.
reset role;
select race_test.make_user('lp_admin', 'C');
create function race_test.layout_verdict(p jsonb, p_kind text, p_unit text) returns jsonb language plpgsql as $$
begin
  return jsonb_build_object('ok', true, 'normalized', public.race_league_validate_layout(p, p_kind, p_unit));
exception when others then
  return jsonb_build_object('ok', false, 'error', regexp_replace(sqlerrm, '^LEAGUE_INVALID: ', ''));
end $$;
create function race_test.total_verdict(p_layout uuid, p_values jsonb) returns jsonb language plpgsql as $$
begin
  return jsonb_build_object('ok', true, 'total', public.race_league_station_total(p_layout, p_values));
exception when others then
  return jsonb_build_object('ok', false, 'error', regexp_replace(sqlerrm, '^LEAGUE_INVALID: ', ''));
end $$;
-- the first case that disagrees, or '' when all agree
create function race_test.layout_parity_mismatch() returns text language plpgsql as $$
declare doc jsonb := (select d from race_test.league_layout_cases limit 1); c jsonb; v jsonb;
begin
  for c in select * from jsonb_array_elements(doc -> 'layout_cases') loop
    v := race_test.layout_verdict(c -> 'layout', c #>> '{metric,kind}', c #>> '{metric,unit}');
    if (v ->> 'ok')::boolean is distinct from (c ->> 'ok')::boolean then return format('%s: verdict %s, expected %s (%s)', c ->> 'name', v ->> 'ok', c ->> 'ok', coalesce(v ->> 'error', 'accepted')); end if;
    if (c ->> 'ok')::boolean and (v -> 'normalized') is distinct from (c -> 'normalized') then return format('%s: normalized layout differs: %s', c ->> 'name', v -> 'normalized'); end if;
    if not (c ->> 'ok')::boolean and (v ->> 'error') is distinct from (c ->> 'error') then return format('%s: message "%s", expected "%s"', c ->> 'name', v ->> 'error', c ->> 'error'); end if;
  end loop;
  return '';
end $$;
select race_test.eq(race_test.layout_parity_mismatch(), '', format('parity: all %s layout cases give the TypeScript verdict, normalized layout and message',
  (select jsonb_array_length(d -> 'layout_cases') from race_test.league_layout_cases limit 1)));

-- value cases need real layouts: one challenge per group, configured through the real function
create function race_test.strip_positions(l jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('result_type', l -> 'result_type', 'stations',
    (select jsonb_agg((s - 'position') || jsonb_build_object('exercises', (select jsonb_agg(e - 'position' order by o2) from jsonb_array_elements(s -> 'exercises') with ordinality x(e, o2))) order by o1)
       from jsonb_array_elements(l -> 'stations') with ordinality y(s, o1))) $$;
select race_test.login('lp_admin');
select race_test.put('lp_season', race_league_create_season('layout-parity', 'Layout parity', date '2026-11-02', date '2026-12-27'));
do $$
declare g record; n int := 0; v_ch uuid; v_res jsonb;
begin
  for g in select key, value from jsonb_each((select d -> 'groups' from race_test.league_layout_cases limit 1)) loop
    n := n + 1;
    v_ch := public.race_league_upsert_challenge((select id from race_test.fx where key = 'lp_season'), n,
      jsonb_build_object('name', 'Group ' || g.key, 'metric_kind', g.value #>> '{metric,kind}', 'unit', g.value #>> '{metric,unit}', 'requires_verification', false));
    v_res := public.race_league_set_layout(v_ch, race_test.strip_positions(g.value -> 'layout'), 'parity group ' || g.key);
    perform race_test.put('lp_group_' || g.key, (v_res ->> 'layoutId')::uuid);
    perform race_test.put('lp_challenge_' || g.key, v_ch);
  end loop;
end $$;
reset role;
select race_test.ok((select count(*) from race_test.fx where key like 'lp_group_%') = 4, 'parity: a real layout exists for each of the four value-case groups');
select race_test.ok((select bool_and(l.spec = (d -> 'groups' -> substr(f.key, 10) -> 'layout')) from race_test.fx f join race_league_layouts l on l.id = f.id, race_test.league_layout_cases where f.key like 'lp_group_%'),
  'parity: the stored spec of each group layout equals the normalized layout in the shared file');
create function race_test.value_parity_mismatch() returns text language plpgsql as $$
declare doc jsonb := (select d from race_test.league_layout_cases limit 1); c jsonb; v jsonb; lay uuid;
begin
  for c in select * from jsonb_array_elements(doc -> 'value_cases') loop
    lay := (select id from race_test.fx where key = 'lp_group_' || (c ->> 'group'));
    v := race_test.total_verdict(lay, c -> 'values');
    if (v ->> 'ok')::boolean is distinct from (c ->> 'ok')::boolean then return format('%s: verdict %s, expected %s (%s)', c ->> 'name', v ->> 'ok', c ->> 'ok', coalesce(v ->> 'error', 'accepted')); end if;
    if (c ->> 'ok')::boolean and (v ->> 'total')::numeric is distinct from (c ->> 'total')::numeric then return format('%s: total %s, expected %s', c ->> 'name', v ->> 'total', c ->> 'total'); end if;
    if not (c ->> 'ok')::boolean and (v ->> 'error') is distinct from (c ->> 'error') then return format('%s: message "%s", expected "%s"', c ->> 'name', v ->> 'error', c ->> 'error'); end if;
  end loop;
  return '';
end $$;
select race_test.eq(race_test.value_parity_mismatch(), '', format('parity: all %s station-total cases give the TypeScript verdict, total and message',
  (select jsonb_array_length(d -> 'value_cases') from race_test.league_layout_cases limit 1)));
