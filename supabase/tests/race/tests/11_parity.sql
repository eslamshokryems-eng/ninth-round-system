-- SQL side of the TS/SQL parity fixture (packages/race/domain/parity-cases.json).
-- The TypeScript rules are asserted against the same file by vitest (domain/parity.test.ts).
reset role;

select race_test.login('bm_a');
select race_test.put('ev_parity', race_create_event(race_test.id('branch_a'), 'parity-2026', date '2026-11-20'));
select race_set_event_status(race_test.id('ev_parity'), 'REGISTRATION_OPEN');
reset role;

select race_test.eq((select doc -> 'eligibility' ->> 'eventDate' from race_test.parity),
                    (select event_date::text from race_events where id = race_test.id('ev_parity')),
  'parity: fixture event date equals the parity event date');

select race_test.eq((select count(*) from race_test.parity, jsonb_array_elements(doc -> 'phone') c)::int, 17, 'parity: 17 phone cases loaded');
select race_test.eq((select count(*) from race_test.parity, jsonb_array_elements(doc -> 'phone') c
                     where race_normalize_phone(c ->> 'input') is distinct from c ->> 'expect')::int, 0,
  'parity: SQL race_normalize_phone() agrees with the fixture on every phone case (incl. Arabic-Indic / Persian digits)');

select race_test.anon();
do $$
declare
  c jsonb;
  i int := 0;
  got text;
begin
  for c in select jsonb_array_elements(doc -> 'eligibility' -> 'cases') from race_test.parity loop
    i := i + 1;
    begin
      perform * from race_register_athlete(
        race_test.id('ev_parity'), 'Parity Athlete ' || i, '0100' || lpad(i::text, 7, '0'), null,
        (c ->> 'gender')::gender, nullif(c ->> 'dateOfBirth', '')::date, (c ->> 'category')::race_category_code,
        nullif(c ->> 'pushupStyle', '')::race_pushup_style, true, '{"name":"C","phone":"01011112222"}'::jsonb);
      got := 'ok';
    exception when others then
      got := substring(sqlerrm from 'RACE_[A-Z_]+');
    end;
    if got is distinct from c ->> 'expect' then
      raise exception 'FAIL: parity case "%": SQL says %, fixture says %', c ->> 'name', got, c ->> 'expect';
    end if;
  end loop;
  raise notice 'PASS  parity: all % eligibility cases give the same answer in SQL and in the shared fixture', i;
end $$;
reset role;

select race_test.eq((select count(*) from race_registrations where event_id = race_test.id('ev_parity'))::int,
                    (select count(*) from race_test.parity, jsonb_array_elements(doc -> 'eligibility' -> 'cases') c where c ->> 'expect' = 'ok')::int,
  'parity: exactly the "ok" cases created registrations; every refused case created nothing');

-- Arabic-Indic digits end to end: registering and searching with ٠١٠٠… finds the same person.
select race_test.anon();
select race_test.eq((select race_number from race_register_athlete(race_test.id('ev_parity'), 'Arabic Digits', '٠١٢٠٠٠٠٠٠٠٠', null, 'male', '1990-01-01', 'MEN', null, true,
                       '{"name":"أم","phone":"٠١٠١١١١٢٢٢٢"}'::jsonb)), 'N' || lpad(((select count(*) from race_test.parity, jsonb_array_elements(doc -> 'eligibility' -> 'cases') c where c ->> 'expect' = 'ok') + 1)::text, 3, '0'),
  'digits: an Arabic-Indic phone number registers');
select race_test.throws($$select * from race_register_athlete(race_test.id('ev_parity'), 'arabic digits', '01200000000', null, 'male', '1990-01-01', 'MEN', null, true, '{"name":"x","phone":"01011112222"}'::jsonb)$$,
  'RACE_ALREADY_REGISTERED', 'digits: the same phone typed with ASCII digits is recognised as the same athlete');
select race_test.login('bm_a');
select race_test.ok((select count(*) = 1 from race_list_registrations(race_test.id('ev_parity'), '٠١٢٠٠٠٠٠٠٠٠')), 'digits: staff search accepts Arabic-Indic digits (phone)');
select race_test.ok((select array_agg(race_number) from race_list_registrations(race_test.id('ev_parity'), '٠٢')) = array['N002'], 'digits: race-number search "٠٢" finds N002');
reset role;
