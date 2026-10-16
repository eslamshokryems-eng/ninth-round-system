-- Differential test, SQL side: the 150 scenarios generated and evaluated by the TypeScript engine (packages/league/domain/differential-cases.json) are replayed against the REAL
-- database functions — close (race_league_apply_scores), retry, administrator corrections (race_league_apply_correction), a rule change, an eligibility decision — and the
-- ledger must land on the same per-participant points and rank after every stage, with the same number of ledger lines.
reset role;
create table race_test.diff_result (n int, stages int);
grant all on race_test.diff_result to anon, authenticated;
do $$
declare
  sc jsonb; i int := 0; stages int := 0; s uuid; ch uuid; pid uuid; aid uuid;
  sup uuid := (select id from race_test.fx where key = 'super');
  pids jsonb; aids jsonb; a jsonb; c jsonb; p text; r jsonb; rules jsonb; got jsonb; want jsonb; n int; k text; lines int; stage text;
  cnt jsonb;
  function_rules jsonb;
begin
  perform set_config('request.jwt.claim.sub', sup::text, false);
  for sc in select jsonb_array_elements(doc -> 'cases') from race_test.league_differential loop
    i := i + 1;
    r := sc -> 'rules';
    rules := jsonb_build_object('points', jsonb_build_object('by_rank', r -> 'points' -> 'byRank', 'beyond', r -> 'points' -> 'beyond', 'participation', r -> 'points' -> 'participation', 'absent', r -> 'points' -> 'absent'),
                                'tie_policy', r ->> 'tiePolicy', 'absence_policy', r ->> 'absencePolicy', 'eligibility', r ->> 'eligibility');
    insert into race_league_seasons (public_slug, name, status, starts_on, ends_on, rules, created_by)
      values ('diff-' || i, 'Diff ' || i, 'active', date '2026-11-02', date '2026-12-27', race_league_validate_rules(rules), sup) returning id into s;
    insert into race_league_challenges (season_id, week_number, name, metric_kind, unit, direction, max_attempts, counting, status)
      values (s, 1, 'Differential', sc -> 'metric' ->> 'kind', sc -> 'metric' ->> 'unit', sc -> 'metric' ->> 'direction', 10, sc ->> 'counting', 'open') returning id into ch;
    pids := '{}'::jsonb;
    for p in select jsonb_array_elements_text(sc -> 'participants') loop
      insert into race_league_participants (season_id, display_name, identity_key, created_by) values (s, 'Player ' || p, 'name:player ' || p, sup) returning id into pid;
      pids := pids || jsonb_build_object(p, pid);
    end loop;
    aids := '{}'::jsonb;
    for a in select jsonb_array_elements(sc -> 'attempts') loop
      insert into race_league_attempts (season_id, challenge_id, participant_id, value, unit, attempt_no, attempted_at, recorded_by, reviewed_by, status, reason, client_request_id)
        values (s, ch, (pids ->> (a ->> 'p'))::uuid, (a ->> 'value')::numeric, sc -> 'metric' ->> 'unit',
                (select count(*) + 1 from race_league_attempts z where z.challenge_id = ch and z.participant_id = (pids ->> (a ->> 'p'))::uuid),
                timestamptz '2026-11-04 12:00:00+00' + ((a ->> 'idx')::int * interval '1 minute'), sup, sup, a ->> 'status', case when a ->> 'status' = 'rejected' then 'invalid' end, gen_random_uuid())
        returning id into aid;
      aids := aids || jsonb_build_object(a ->> 'idx', aid);
    end loop;

    -- a stage's state: per participant net points + latest rank, and the number of ledger lines
    -- close
    update race_league_challenges set status = 'closed', closed_at = clock_timestamp() where id = ch;
    perform race_league_apply_scores(ch);
    for stage in select unnest(array['close', 'retry', 'corrected', 'rules2', 'restricted']) loop
      if stage = 'retry' then
        if race_league_apply_scores(ch) <> 0 then raise exception 'FAIL: differential case %: a retry appended ledger lines', i; end if;
      elsif stage = 'corrected' then
        for c in select jsonb_array_elements(sc -> 'corrections') loop
          perform race_league_apply_correction((aids ->> (c ->> 'attempt'))::uuid, nullif(c ->> 'newValue', '')::numeric, 'differential correction', null);
        end loop;
      elsif stage = 'rules2' then
        continue when sc -> 'rules2' = 'null'::jsonb;
        r := sc -> 'rules2';
        update race_league_seasons set rules = race_league_validate_rules(jsonb_build_object('points', jsonb_build_object('by_rank', r -> 'points' -> 'byRank', 'beyond', r -> 'points' -> 'beyond', 'participation', r -> 'points' -> 'participation', 'absent', r -> 'points' -> 'absent'),
                                'tie_policy', r ->> 'tiePolicy', 'absence_policy', r ->> 'absencePolicy', 'eligibility', r ->> 'eligibility')) where id = s;
        perform race_league_apply_scores(ch);
      elsif stage = 'restricted' then
        continue when sc -> 'restrict' = 'null'::jsonb;
        perform race_league_set_eligibility((pids ->> (sc ->> 'restrict'))::uuid, false, 'FRAUD', 'differential decision');
      end if;
      -- compare with the TypeScript engine's numbers for this stage
      want := sc -> 'expect' -> stage;
      got := jsonb_build_object('lines', (select count(*) from race_league_points_ledger where challenge_id = ch), 'byP', (
        select jsonb_object_agg(k.key, jsonb_build_object(
          'cents', coalesce((select sum(points_cents) from race_league_points_ledger l where l.challenge_id = ch and l.participant_id = (pids ->> k.key)::uuid), 0)::int,
          'rank', (select rank from race_league_points_ledger l where l.challenge_id = ch and l.participant_id = (pids ->> k.key)::uuid order by seq desc limit 1)))
        from jsonb_object_keys(pids) k(key)));
      if got is distinct from want then
        raise exception 'FAIL: differential case % (%) stage %: SQL has %, the TypeScript engine says %', i, sc ->> 'name', stage, got, want;
      end if;
      stages := stages + 1;
    end loop;
  end loop;
  insert into race_test.diff_result values (i, stages);
end $$;
reset role;
select race_test.eq((select n from race_test.diff_result), 150, 'differential: all 150 scenarios replayed');
select race_test.ok((select stages from race_test.diff_result) > 500, 'differential: SQL and TypeScript agree on every stage (close, retry, corrections, rule change, eligibility decision) of every scenario');
