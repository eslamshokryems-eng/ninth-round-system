-- SQL side of the TS/SQL scoring parity file (packages/league/domain/parity-cases.json). The TypeScript scoring is asserted against the SAME cases by vitest
-- (domain/parity.test.ts). Each case runs the REAL scoring function (race_league_apply_scores — the one the close-challenge and correction paths call).
reset role;
create table race_test.lp_result (name text, ok boolean, detail text);
grant all on race_test.lp_result to anon, authenticated;

reset role;
do $$
declare
  c jsonb; i int := 0; s uuid; ch uuid; m jsonb; r jsonb; p jsonb; a jsonb; e jsonb; pid uuid; ids jsonb; rules jsonb; got_cents int; got_rank int; nonzero int; want_nonzero int;
  super_id uuid := (select id from race_test.fx where key = 'super');
begin
  for c in select jsonb_array_elements(doc -> 'cases') from race_test.league_parity loop
    i := i + 1;
    m := c -> 'metric'; r := c -> 'rules';
    rules := jsonb_build_object('points', jsonb_build_object('by_rank', r -> 'points' -> 'byRank', 'beyond', r -> 'points' -> 'beyond', 'participation', r -> 'points' -> 'participation', 'absent', r -> 'points' -> 'absent'),
                                'tie_policy', r ->> 'tiePolicy', 'absence_policy', r ->> 'absencePolicy', 'eligibility', r ->> 'eligibility');
    -- built as the database owner: a season already ACTIVE with an OPEN challenge (the lifecycle itself is covered by suite 32)
    reset role;
    insert into race_league_seasons (public_slug, name, status, starts_on, ends_on, rules, created_by)
      values ('parity-' || i, 'Parity ' || i, 'active', date '2026-11-02', date '2026-12-27', race_league_validate_rules(rules), super_id) returning id into s;
    insert into race_league_challenges (season_id, week_number, name, metric_kind, unit, direction, max_attempts, counting, status)
      values (s, 1, 'Parity week', m ->> 'kind', m ->> 'unit', m ->> 'direction', 10, c ->> 'counting', 'open') returning id into ch;
    ids := '{}'::jsonb;
    for p in select jsonb_array_elements(c -> 'participants') loop
      insert into race_league_participants (season_id, display_name, identity_key, active, eligible, created_by)
        values (s, 'Player ' || (p ->> 'id'), 'name:player ' || (p ->> 'id'), (p ->> 'active')::boolean, (p ->> 'eligible')::boolean, super_id) returning id into pid;
      ids := ids || jsonb_build_object(p ->> 'id', pid);
    end loop;
    for a in select jsonb_array_elements(c -> 'attempts') loop
      insert into race_league_attempts (season_id, challenge_id, participant_id, value, unit, attempt_no, attempted_at, recorded_by, reviewed_by, status, reason, client_request_id)
        values (s, ch, (ids ->> (a ->> 'p'))::uuid, (a ->> 'value')::numeric, m ->> 'unit', (a ->> 'no')::int, (a ->> 'at')::timestamptz, super_id, super_id, a ->> 'status',
                case when a ->> 'status' = 'rejected' then 'parity' end, gen_random_uuid());
    end loop;
    update race_league_challenges set status = 'closed' where id = ch;     -- the pending/rejected fixtures are scoring inputs; the close-with-pending refusal is tested in suite 32
    perform race_league_apply_scores(ch);
    reset role;
    -- compare the ledger with the fixture
    want_nonzero := 0;
    for e in select jsonb_array_elements(c -> 'expect') loop
      pid := (ids ->> (e ->> 'p'))::uuid;
      got_cents := coalesce((select sum(points_cents) from race_league_points_ledger where challenge_id = ch and participant_id = pid), 0);
      got_rank := (select rank from race_league_points_ledger where challenge_id = ch and participant_id = pid order by seq desc limit 1);
      if got_cents <> (e ->> 'cents')::int or got_rank is distinct from nullif(e ->> 'rank', '')::int then
        raise exception 'FAIL: parity case "%": participant % — SQL has % cents / rank %, the fixture says % / %', c ->> 'name', e ->> 'p', got_cents, got_rank, e ->> 'cents', e ->> 'rank';
      end if;
      if (e ->> 'cents')::int <> 0 then want_nonzero := want_nonzero + 1; end if;
    end loop;
    select count(*) into nonzero from (select participant_id from race_league_points_ledger where challenge_id = ch group by participant_id having sum(points_cents) <> 0) z;
    if nonzero <> want_nonzero then
      raise exception 'FAIL: parity case "%": SQL scored % participants, the fixture expects %', c ->> 'name', nonzero, want_nonzero;
    end if;
    -- a second reconciliation adds nothing (exactly-once)
    if race_league_apply_scores(ch) <> 0 then raise exception 'FAIL: parity case "%": a second reconciliation appended lines', c ->> 'name'; end if;
  end loop;
  insert into race_test.lp_result values ('all', true, i::text);
end $$;
reset role;
select race_test.eq((select detail from race_test.lp_result where name = 'all')::int, (select jsonb_array_length(doc -> 'cases') from race_test.league_parity), 'parity: SQL agrees with the TypeScript scoring on every shared case');
select race_test.ok((select jsonb_array_length(doc -> 'cases') from race_test.league_parity) >= 24, 'parity: at least 24 cases were compared');
