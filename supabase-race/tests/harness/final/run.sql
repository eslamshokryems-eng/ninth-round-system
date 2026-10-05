-- FINAL END-TO-END VALIDATION — part 2: the race. A deterministic, time-ordered driver that does what the people and devices of the event do,
-- through the REAL RPCs, as the REAL roles. Each call of race_final.step() is its own transaction (driven by \gexec).
--   * operator ticks every 5 s of race time (suppressed while a Master / complete-client blackout is on)
--   * every judge action of the plan, at its race time — deferred and replayed as OFFLINE_QUEUE when that judge (or every device) is disconnected
--   * scripted exceptions: late check-ins, SKIP, DNF, heat closed without start, emergency pauses (also with devices reading while paused)
--   * the Master's review of held offline actions; the rowing evidence flows (capture -> OCR -> confirm / retake / manual correction)
\set ON_ERROR_STOP on
\set QUIET on
reset role;
create sequence race_final.devseq;
grant usage on sequence race_final.devseq to public;
create table race_final.state (event_id uuid not null, done boolean not null default false, end_cap bigint not null default 13000000, steps int not null default 0);
insert into race_final.state values (race_test.id('ev_f'));
create table race_final.blackout (id serial, scope text not null, "from" bigint not null, "to" bigint not null, done boolean not null default false);
insert into race_final.blackout (scope, "from", "to") select b ->> 'scope', (b ->> 'from')::bigint, (b ->> 'to')::bigint from jsonb_array_elements(race_final.p() -> 'blackouts') b;
create table race_final.script (seq serial, at_ms bigint not null, action text not null, arg text, wall bigint, done boolean not null default false);
create table race_final.act (
  id serial primary key, kind text not null, n int not null, station int not null, anchor text not null default 'start', off bigint not null, step text, type text, value numeric,
  cid uuid not null, ref_cid uuid, voids uuid, args jsonb not null default '{}'::jsonb, abs_ms bigint, eff_ms bigint, done boolean not null default false
);
create table race_final.act_log (seq serial, cid uuid, n int, station int, type text, value numeric, voids uuid, origin text, device bigint, arrival bigint, sys_status text, sys_code text, sys_event_id uuid);
create table race_final.review_due (id serial, kind text not null, ref uuid not null, due_ms bigint not null, decision text not null, done boolean not null default false);
create table race_final.review_log (cid uuid, decision text);
create table race_final.ocr_log (seq serial, n int, step text, cid uuid, distance int, conf numeric, ack boolean, decision text, device bigint, arrival bigint, sys_result text);
create table race_final.attempt (cid uuid primary key, attempt_id uuid not null, n int not null);
create table race_final.corrections_log (n int, station int, field text, value numeric);
create table race_final.rowing_corrections_log (n int, distance int, by_role text);
create table race_final.slot_seen (heat int, idx int, reg uuid, primary key (heat, idx));
create table race_final.dropped (n int, station int, kind text, n_actions int);
create table race_final.script_log (action text, n int, at_ms bigint);
create table race_final.reconnects (seq serial, at_ms bigint, scope text, state text);

create view race_final.res as
select substr(g.race_number, 2)::int n, st.number station, sr.id result_id, sr.window_start_race_ms ws, sr.window_end_race_ms we, sl.slot_index, sr.status::text status, sr.registration_id
  from race_station_results sr join race_registrations g on g.id = sr.registration_id join race_stations st on st.id = sr.station_id join race_start_slots sl on sl.id = sr.slot_id
 where sr.event_id = race_test.id('ev_f');

create function race_final.as_user(p_key text) returns void language sql as $$ select race_test.login(p_key) $$;
create function race_final.back() returns void language plpgsql as $$ begin perform set_config('role', 'postgres', false); end $$;
create function race_final.code(p_msg text) returns text language sql immutable as $$ select coalesce(substring(p_msg from 'RACE_[A-Z_]+'), left(p_msg, 60)) $$;
create function race_final.reg(p_n int) returns uuid language sql stable as $$ select race_final.rid('fv' || p_n) $$;
create function race_final.ev() returns uuid language sql stable as $$ select race_test.id('ev_f') $$;

-- PLAN -> work items ---------------------------------------------------------------------------------------------------------------------------
insert into race_final.act (kind, n, station, anchor, off, type, value, cid, voids)
select 'perf', (a ->> 'n')::int, (a ->> 'st')::int, 'start', (a ->> 'off')::bigint, a ->> 'type', nullif(a ->> 'value', '')::numeric, (a ->> 'cid')::uuid, nullif(a ->> 'voids', '')::uuid
  from jsonb_array_elements(race_final.p() -> 'actions') a order by (a ->> 'n')::int, (a ->> 'st')::int, (a ->> 'off')::bigint;

do $$
declare f jsonb; k text; n int; d numeric; c numeric; cA uuid; cB uuid; cC uuid; i int := 0;
  add_step text;
  procedure_dummy int;
begin
  for f in select * from jsonb_array_elements(race_final.p() -> 'rowing') loop
    n := (f ->> 'n')::int; k := f ->> 'kind'; d := (f ->> 'distance')::numeric; c := (f ->> 'conf')::numeric;
    cA := gen_random_uuid(); cB := gen_random_uuid(); cC := gen_random_uuid();
    -- helper rows: (step, off from the END of the window, distance, confidence, ref capture, ack)
    if k in ('normal', 'lowconf', 'correct_after', 'unconfirmed_then_late') then
      insert into race_final.act (kind, n, station, anchor, off, step, cid, ref_cid, args) values
        ('ocr', n, 9, 'end', 3000, 'capture', cA, null, '{}'),
        ('ocr', n, 9, 'end', 4000, 'submit', gen_random_uuid(), cA, jsonb_build_object('distance', d, 'conf', c));
      if k = 'lowconf' then
        insert into race_final.act (kind, n, station, anchor, off, step, cid, ref_cid, args) values
          ('ocr', n, 9, 'end', 8000, 'confirm', gen_random_uuid(), cA, '{"ack": false}'), ('ocr', n, 9, 'end', 12000, 'confirm', gen_random_uuid(), cA, '{"ack": true}');
      elsif k = 'unconfirmed_then_late' then
        insert into race_final.act (kind, n, station, anchor, off, step, cid, ref_cid, args) values ('ocr', n, 9, 'end', 45000, 'confirm', gen_random_uuid(), cA, '{"ack": false}');
      else
        insert into race_final.act (kind, n, station, anchor, off, step, cid, ref_cid, args) values ('ocr', n, 9, 'end', 10000, 'confirm', gen_random_uuid(), cA, '{"ack": false}');
      end if;
      if k = 'correct_after' then
        insert into race_final.act (kind, n, station, anchor, off, step, cid, ref_cid, args) values ('ocr', n, 9, 'end', 120000, 'correct_em', gen_random_uuid(), null, jsonb_build_object('distance', (f ->> 'manual')::int));
      end if;
    elsif k = 'retake' then
      insert into race_final.act (kind, n, station, anchor, off, step, cid, ref_cid, args) values
        ('ocr', n, 9, 'end', 3000, 'capture', cA, null, '{}'),
        ('ocr', n, 9, 'end', 4000, 'submit', gen_random_uuid(), cA, jsonb_build_object('distance', (f ->> 'wrong')::numeric, 'conf', (f ->> 'wrongConf')::numeric)),
        ('ocr', n, 9, 'end', 8000, 'retake', gen_random_uuid(), cA, '{}'),
        ('ocr', n, 9, 'end', 10000, 'capture', cB, null, '{}'),
        ('ocr', n, 9, 'end', 11000, 'submit', gen_random_uuid(), cB, jsonb_build_object('distance', d, 'conf', c)),
        ('ocr', n, 9, 'end', 15000, 'confirm', gen_random_uuid(), cB, '{"ack": false}');
    elsif k = 'manual' then
      insert into race_final.act (kind, n, station, anchor, off, step, cid, ref_cid, args) values
        ('ocr', n, 9, 'end', 3000, 'capture', cA, null, '{}'), ('ocr', n, 9, 'end', 4000, 'submit', gen_random_uuid(), cA, '{"distance": null, "conf": null}'),
        ('ocr', n, 9, 'end', 8000, 'confirm', gen_random_uuid(), cA, '{"ack": true}'), ('ocr', n, 9, 'end', 10000, 'retake', gen_random_uuid(), cA, '{}'),
        ('ocr', n, 9, 'end', 12000, 'capture', cB, null, '{}'), ('ocr', n, 9, 'end', 13000, 'submit', gen_random_uuid(), cB, '{"distance": null, "conf": 0.2}'),
        ('ocr', n, 9, 'end', 15000, 'retake', gen_random_uuid(), cB, '{}'),
        ('ocr', n, 9, 'end', 17000, 'capture', cC, null, '{}'), ('ocr', n, 9, 'end', 18000, 'submit', gen_random_uuid(), cC, '{"distance": null, "conf": null}'),
        ('ocr', n, 9, 'end', 60000, 'correct_master', gen_random_uuid(), null, jsonb_build_object('distance', (f ->> 'manual')::int));
    end if;
  end loop;
end $$;

-- scripted exceptions (race ms), from the plan -------------------------------------------------------------------------------------------------
insert into race_final.script (at_ms, action, arg) select (v.value)::bigint, 'check_in', v.key from jsonb_each_text(race_final.p() -> 'script' -> 'late_check_in') v;
insert into race_final.script (at_ms, action, arg) select (race_final.p() -> 'script' -> 'skip' ->> 'at')::bigint, 'skip_slot', (race_final.p() -> 'script' -> 'skip' ->> 'heat') || ':' || (race_final.p() -> 'script' -> 'skip' ->> 'slot');
insert into race_final.script (at_ms, action, arg) select (race_final.p() -> 'script' -> 'dnf' ->> 'at')::bigint, 'dnf_station', race_final.p() -> 'script' -> 'dnf' ->> 'station';
insert into race_final.script (at_ms, action, arg) select (v.value)::bigint, 'close_heat', v.key from jsonb_each_text(race_final.p() -> 'script' -> 'close_heat') v;
insert into race_final.script (at_ms, action, arg, wall) select (p ->> 0)::bigint, 'pause', null, (p ->> 1)::bigint from jsonb_array_elements(race_final.p() -> 'script' -> 'pauses') p;
insert into race_final.script (at_ms, action, arg, wall) select (p ->> 0)::bigint, 'pause_reads', null, (p ->> 1)::bigint from jsonb_array_elements(race_final.p() -> 'script' -> 'pause_reads') p;
insert into race_final.script (at_ms, action, arg) select (b ->> 'at')::bigint, 'boundary', b ->> 'tag' from jsonb_array_elements(race_final.p() -> 'boundary') b;

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- cache the absolute race time of every work item whose result exists, and when it will really be sent (deferred to the end of a blackout that hides it)
create function race_final.refresh() returns void language sql as $$
  update race_final.act a set
    abs_ms = case a.anchor when 'end' then r.we else r.ws end + a.off,
    eff_ms = coalesce((select b."to" from race_final.blackout b where b.scope in ('ALL', 'STATION:' || a.station) and (case a.anchor when 'end' then r.we else r.ws end + a.off) >= b."from" and (case a.anchor when 'end' then r.we else r.ws end + a.off) < b."to" limit 1),
                      case a.anchor when 'end' then r.we else r.ws end + a.off)
    from race_final.res r where r.n = a.n and r.station = a.station and a.abs_ms is null and not a.done and r.status not in ('VOID_DNS', 'NOT_REACHED')
$$;

create function race_final.fnv(p text) returns bigint language sql immutable as $$ select abs(hashtext(p))::bigint $$;

create function race_final.do_perf(a race_final.act) returns void language plpgsql as $$
declare r record; x record; v_off boolean := a.eff_ms > a.abs_ms; v_origin text; v_void uuid;
begin
  select * into r from race_final.res where n = a.n and station = a.station;
  select sys_event_id into v_void from race_final.act_log where cid = a.voids;
  v_origin := case when v_off then 'OFFLINE_QUEUE' else 'ONLINE' end;
  perform race_final.as_user('f_j' || a.station);
  begin
    select * into x from race_record_action(r.result_id, a.type::race_action_type, a.cid, a.value, v_origin::race_action_origin,
        case when v_off then clock_timestamp() end, case when v_off then a.abs_ms end, case when v_off then nextval('race_final.devseq') end, null,
        v_void);
    perform race_final.back();
    insert into race_final.act_log (cid, n, station, type, value, voids, origin, device, arrival, sys_status, sys_code, sys_event_id)
    values (a.cid, a.n, a.station, a.type, a.value, a.voids, v_origin, a.abs_ms, a.eff_ms, x.status::text, x.rejection_code, x.performance_event_id);
    if x.status = 'PENDING_MASTER_REVIEW' then
      insert into race_final.review_due (kind, ref, due_ms, decision) values ('perf', x.performance_event_id, a.eff_ms + 45000, case when race_final.fnv(a.cid::text) % 4 = 0 then 'REJECTED' else 'APPROVED' end);
      insert into race_final.review_log (cid, decision) select a.cid, decision from race_final.review_due where ref = x.performance_event_id;
    end if;
  exception when others then
    perform race_final.back();
    insert into race_final.act_log (cid, n, station, type, value, voids, origin, device, arrival, sys_status, sys_code) values (a.cid, a.n, a.station, a.type, a.value, a.voids, v_origin, a.abs_ms, a.eff_ms, 'ERROR', race_final.code(sqlerrm));
  end;
  perform race_final.back();
end $$;

create function race_final.do_ocr(a race_final.act) returns void language plpgsql as $$
declare r record; v_off boolean := a.eff_ms > a.abs_ms; res text; att uuid; j jsonb; path text; d int; c numeric;
begin
  select * into r from race_final.res where n = a.n and station = 9;
  d := nullif(a.args ->> 'distance', '')::numeric::int; c := nullif(a.args ->> 'conf', '')::numeric;
  begin
    if a.step = 'capture' then
      path := race_final.ev()::text || '/rowing/' || r.result_id::text || '/' || a.cid::text || '.jpg';
      insert into storage.objects (bucket_id, name, owner, metadata) values ('race-evidence', path, race_test.id('f_j9'), '{"size": 120000}') on conflict do nothing;
      perform race_final.as_user('f_j9');
      j := race_ocr_capture(r.result_id, a.cid, path, 'image/jpeg', 120000, repeat('b', 64), case when v_off then 'OFFLINE_QUEUE' else 'ONLINE' end::race_action_origin,
                            case when v_off then clock_timestamp() end, case when v_off then a.abs_ms end, case when v_off then nextval('race_final.devseq') end);
      perform race_final.back();
      insert into race_final.attempt values (a.cid, (j ->> 'attempt_id')::uuid, a.n) on conflict do nothing;
      res := 'OK';
    elsif a.step = 'submit' then
      select attempt_id into att from race_final.attempt where cid = a.ref_cid;
      perform race_final.as_user('f_j9');
      j := race_ocr_submit(att, 'device-ocr', 'tesseract.js@7', coalesce(d::text || ' m', ''), jsonb_build_object('text', coalesce(d::text || ' m', '')), d, c);
      perform race_final.back();
      res := 'OK:' || (j ->> 'ocr_status');
    elsif a.step = 'confirm' then
      select attempt_id into att from race_final.attempt where cid = a.ref_cid;
      perform race_final.as_user('f_j9');
      j := race_ocr_confirm(att, a.cid, coalesce((a.args ->> 'ack')::boolean, false));
      perform race_final.back();
      res := 'OK:' || (j ->> 'status');
      if j ->> 'status' = 'PENDING_REVIEW' then insert into race_final.review_due (kind, ref, due_ms, decision) values ('ocr', att, a.eff_ms + 45000, 'APPROVED'); end if;
    elsif a.step = 'retake' then
      select attempt_id into att from race_final.attempt where cid = a.ref_cid;
      perform race_final.as_user('f_j9');
      j := race_ocr_retake(att, a.cid, 'judge pressed RETAKE PHOTO');
      perform race_final.back();
      res := 'OK';
    elsif a.step = 'correct_master' or a.step = 'correct_em' then
      perform race_final.as_user(case when a.step = 'correct_em' then 'f_bm' else 'f_master' end);
      j := race_correct_rowing_result(r.result_id, d, 'final validation: the display could not be read / referee re-count');
      perform race_final.back();
      insert into race_final.rowing_corrections_log values (a.n, d, a.step);
      res := 'OK';
    end if;
  exception when others then
    perform race_final.back();
    res := 'ERR:' || race_final.code(sqlerrm);
  end;
  perform race_final.back();
  if a.step in ('capture', 'submit', 'confirm', 'retake') then
    insert into race_final.ocr_log (n, step, cid, distance, conf, ack, device, arrival, sys_result) values (a.n, a.step, a.cid, d, c, coalesce((a.args ->> 'ack')::boolean, false), a.abs_ms, a.eff_ms, res);
  elsif a.step in ('correct_master', 'correct_em') and res <> 'OK' then
    raise exception 'FINAL VALIDATION FAIL: rowing correction N% refused: %', a.n, res;
  end if;
end $$;

create function race_final.do_review(rv race_final.review_due) returns void language plpgsql as $$
declare j jsonb;
begin
  perform race_final.as_user('f_master');
  if rv.kind = 'perf' then
    j := race_review_action(rv.ref, rv.decision, case when rv.decision = 'APPROVED' then 'final validation: the action happened inside the window' else 'final validation: not credible' end);
  else
    j := race_ocr_review(rv.ref, rv.decision, 'final validation: photo is clear, the confirmation was typed inside the transition');
  end if;
  perform race_final.back();
  if rv.kind = 'ocr' then
    insert into race_final.ocr_log (n, step, cid, decision, device, arrival, sys_result) select o.n, 'review', null, rv.decision, rv.due_ms, rv.due_ms, 'OK:' || (j ->> 'status') from race_final.attempt o where o.attempt_id = rv.ref;
  end if;
  update race_final.review_due set done = true where id = rv.id;
exception when others then
  perform race_final.back();
  raise exception 'FINAL VALIDATION FAIL: review of % failed: %', rv.ref, sqlerrm;
end $$;

-- operator / script events ---------------------------------------------------------------------------------------------------------------------
create function race_final.do_script(s race_final.script) returns void language plpgsql as $$
declare v_slot uuid; v_state jsonb; j jsonb; frozen bigint; t0 bigint; a record; v_n int; v_reg uuid;
begin
  if s.action = 'check_in' then
    perform race_final.as_user('f_rec'); perform race_check_in(race_final.reg(s.arg::int)); perform race_final.back();
  elsif s.action = 'skip_slot' then
    perform race_final.as_user('f_master'); perform race_control_state(race_final.ev());     -- the operator's screen settles the race when it opens
    select sl.id, substr(g.race_number, 2)::int into v_slot, v_n from race_start_slots sl join race_heats h on h.id = sl.heat_id join race_registrations g on g.id = sl.registration_id
     where h.event_id = race_final.ev() and h.number = split_part(s.arg, ':', 1)::int and sl.slot_index = split_part(s.arg, ':', 2)::int and sl.status = 'BOUND';
    perform race_skip_athlete(v_slot, 'athlete is not ready'); perform race_final.back();
    insert into race_final.script_log values ('skip', v_n, s.at_ms);
  elsif s.action = 'dnf_station' then
    select r.n, r.registration_id into v_n, v_reg from race_final.res r where r.station = s.arg::int and r.ws <= s.at_ms and s.at_ms < r.we limit 1;
    perform race_final.as_user('f_master'); perform race_mark_dnf(v_reg, 'athlete withdrew'); perform race_final.back();
    insert into race_final.script_log values ('dnf', v_n, s.at_ms);
  elsif s.action = 'close_heat' then
    perform race_final.as_user('f_master'); perform race_close_heat_without_start(race_final.ev(), s.arg::int, 'the heat will not start'); perform race_final.back();
  elsif s.action = 'pause' then
    perform race_final.as_user('f_master'); perform race_pause(race_final.ev(), 'Emergency pause'); perform race_final.back();
    perform race_sim.age_pause(race_final.ev(), s.wall);
    perform race_final.as_user('f_master'); perform race_resume(race_final.ev()); perform race_final.back();
  elsif s.action = 'pause_reads' then
    -- RECONNECT DURING PAUSE: devices come back while the race is paused. Race time must be frozen and every screen must say so.
    perform race_final.as_user('f_master'); perform race_pause(race_final.ev(), 'Emergency pause'); perform race_final.back();
    t0 := race_now_ms(race_final.ev());
    perform race_sim.age_pause(race_final.ev(), s.wall / 2);
    perform race_final.as_user('f_scr1'); j := race_station_screen(race_final.ev(), 1); perform race_final.back();
    perform race_final.chk('reconnect during PAUSE: the station screen says PAUSED and race time is frozen', (j -> 'clock' ->> 'paused') = 'true' and abs((j -> 'clock' ->> 'race_ms')::bigint - t0) <= 3, j -> 'clock' ->> 'race_ms');
    perform race_final.as_user('f_master'); v_state := race_control_state(race_final.ev()); perform race_final.back();
    perform race_final.chk('reconnect during PAUSE: Master Control sees the same frozen time', (v_state -> 'clock' ->> 'paused') = 'true' and abs((v_state -> 'clock' ->> 'race_ms')::bigint - t0) <= 3);
    perform race_final.as_user('f_j2'); j := race_station_view(race_final.ev(), 2); perform race_final.back();
    perform race_final.chk('reconnect during PAUSE: a judge can read the station and nothing moved', (j -> 'clock' ->> 'paused') = 'true' and abs((j -> 'clock' ->> 'race_ms')::bigint - t0) <= 3);
    perform race_sim.age_pause(race_final.ev(), s.wall - s.wall / 2);
    perform race_final.as_user('f_master'); perform race_resume(race_final.ev()); perform race_final.back();
    perform race_final.chk('reconnect during PAUSE: after RESUME race time continues from the frozen moment (no time added)', abs(race_now_ms(race_final.ev()) - t0) <= 50, (race_now_ms(race_final.ev()) - t0)::text);
  elsif s.action = 'boundary' then
    -- the athletes of the 3:00 boundary experiments are whoever is in those slots (resolved now, from the system)
    insert into race_final.act (kind, n, station, anchor, off, type, cid)
    select 'perf', substr(g.race_number, 2)::int, (b.x ->> 'station')::int, 'start', (b.x ->> 'off')::bigint, b.x ->> 'type', gen_random_uuid()
      from jsonb_array_elements(race_final.p() -> 'boundary') b(x)
      join race_heats h on h.event_id = race_final.ev() and h.number = (b.x ->> 'heat')::int
      join race_start_slots sl on sl.heat_id = h.id and sl.slot_index = (b.x ->> 'slot')::int and sl.status in ('BOUND', 'STARTED')
      join race_registrations g on g.id = sl.registration_id
     where (b.x ->> 'tag') = s.arg;
    perform race_final.refresh();
  end if;
end $$;

-- a device (or all of them) comes back: it asks the server what is going on. The race has to be exactly where the arithmetic says it is.
create function race_final.reconnect(p_bo race_final.blackout) returns void language plpgsql as $$
declare v jsonb; t bigint; s int; exp_n text; got text; scr jsonb; boundary_n int;
begin
  perform race_final.as_user('f_master'); v := race_control_state(race_final.ev()); perform race_final.back();
  t := (v -> 'clock' ->> 'race_ms')::bigint;
  perform race_sim.check_invariants(race_final.ev(), t);
  insert into race_final.reconnects (at_ms, scope, state) values (t, p_bo.scope, (select string_agg(x ->> 'number' || ':' || (x ->> 'state'), ',' order by (x ->> 'number')::int) from jsonb_array_elements(v -> 'stations') x));
  -- every station: what the station screen shows equals what the windows say (independent arithmetic on the official windows)
  for s in 1..9 loop
    perform race_final.as_user('f_master'); scr := race_station_screen(race_final.ev(), s); perform race_final.back();
    select 'N' || lpad(r.n::text, 3, '0') into exp_n from race_final.res r join race_registrations g on g.id = r.registration_id
     where r.station = s and r.status not in ('VOID_DNS', 'NOT_REACHED') and g.race_status not in ('DNF', 'MISSED_START', 'WITHDRAWN') and r.ws <= (scr -> 'clock' ->> 'race_ms')::bigint and (scr -> 'clock' ->> 'race_ms')::bigint < r.we + 30000 limit 1;
    got := scr -> 'current' ->> 'race_number';
    perform race_final.chk(format('reconnect after the %s blackout at race ms %s: station %s screen shows %s', p_bo.scope, t, s, coalesce(exp_n, 'nobody')), got is not distinct from exp_n, coalesce(got, 'null'));
  end loop;
  if p_bo."to" = 1710300 then
    select n into boundary_n from race_final.res where station = 1 and we = 1710000;
    perform race_final.chk('reconnect 0.3 s AFTER a 3:00 boundary: that athlete is already in the 0:30 transition (SCORING) — the screen cannot show more work time',
      (select status = 'SCORING' from race_final.res where n = boundary_n and station = 1) and (scr is not null));
    perform race_final.as_user('f_master'); scr := race_station_screen(race_final.ev(), 1); perform race_final.back();
    perform race_final.chk('reconnect 0.3 s after 3:00: the Station 01 screen state is TRANSITION data (current window already ended)', (scr -> 'current' ->> 'race_number') = 'N' || lpad(boundary_n::text, 3, '0') and (scr -> 'clock' ->> 'race_ms')::bigint >= (scr -> 'current' ->> 'window_end_ms')::bigint);
  elsif p_bo."to" = 1499700 then
    select n into boundary_n from race_final.res where station = 1 and we = 1500000;
    perform race_final.as_user('f_master'); scr := race_station_screen(race_final.ev(), 1); perform race_final.back();
    perform race_final.chk('reconnect 0.3 s BEFORE a 3:00 boundary (Station 01, slot 6): that athlete is still working (ACTIVE) with ~0.3 s left',
      (select status = 'ACTIVE' from race_final.res where n = boundary_n and station = 1) and (scr -> 'current' ->> 'race_number') = 'N' || lpad(boundary_n::text, 3, '0') and (scr -> 'clock' ->> 'race_ms')::bigint < (scr -> 'current' ->> 'window_end_ms')::bigint);
  end if;
  update race_final.blackout set done = true where id = p_bo.id;
end $$;

create function race_final.tick() returns void language plpgsql as $$
declare j jsonb;
begin
  perform race_final.as_user('f_master'); j := race_advance(race_final.ev()); perform race_final.back();
  perform race_sim.check_invariants(race_final.ev(), (j ->> 'race_ms')::bigint);
  insert into race_final.slot_seen (heat, idx, reg) select h.number, s.slot_index, s.registration_id from race_start_slots s join race_heats h on h.id = s.heat_id where s.event_id = race_final.ev() and s.status in ('BOUND', 'STARTED') and s.registration_id is not null on conflict do nothing;
  perform race_final.chk('no start slot changes after binding', not exists (select 1 from race_final.slot_seen ss join race_heats h on h.number = ss.heat and h.event_id = race_final.ev() join race_start_slots s on s.heat_id = h.id and s.slot_index = ss.idx where s.registration_id is distinct from ss.reg));
  perform race_final.refresh();
end $$;

-- ONE step: advance to the next thing that happens, then do everything that is due -------------------------------------------------------------
create function race_final.step() returns text language plpgsql as $$
declare
  st race_final.state; t bigint; tick bigint; ev bigint; act bigint; bo bigint; rv bigint; target bigint; b race_final.blackout; a race_final.act; s race_final.script; r race_final.review_due; doticks boolean; fin boolean; v_last bigint;
begin
  select * into st from race_final.state;
  if st.done then return 'done'; end if;
  t := coalesce(race_now_ms(st.event_id), 0);
  select (finished_at is not null) into fin from race_clock where event_id = st.event_id;
  if fin and not exists (select 1 from race_final.act where not done and eff_ms is not null) and not exists (select 1 from race_final.review_due where not done) and not exists (select 1 from race_final.script where not done) then
    update race_final.state set done = true; return 'done';
  end if;
  if t >= st.end_cap then update race_final.state set done = true; return 'cap'; end if;
  tick := (t / 5000 + 1) * 5000;
  select "to" into bo from race_final.blackout where scope in ('MASTER', 'ALL') and tick >= "from" and tick < "to" order by "from" limit 1;
  if found then tick := bo; end if;
  select min("to") into bo from race_final.blackout where not done and "to" > t;
  select min(at_ms) into ev from race_final.script where not done;
  select min(eff_ms) into act from race_final.act where not done and eff_ms is not null;
  select min(due_ms) into rv from race_final.review_due where not done;
  target := least(tick, coalesce(ev, 9e15::bigint), coalesce(act, 9e15::bigint), coalesce(bo, 9e15::bigint), coalesce(rv, 9e15::bigint), st.end_cap);
  if target < t then target := t; end if;
  if target > t then perform race_sim.travel_to(st.event_id, target); end if;
  t := target;
  -- 0. a device that comes back flushes its offline queue FIRST (inside the very millisecond it reconnects); the reconnect assertions come after
  for a in select * from race_final.act where not done and eff_ms is not null and eff_ms <= t order by eff_ms, abs_ms, id loop
    -- the harness's own processing time is not race time: the clock is put on the scheduled instant ONCE per instant; the actions of that instant then go out one
    -- after the other in real time, so server time can never run backwards between two of them (a queue flush of 150 actions drifts by at most a few hundred ms)
    if v_last is distinct from a.eff_ms then
      v_last := a.eff_ms;
      if race_now_ms(st.event_id) >= a.eff_ms and race_now_ms(st.event_id) - a.eff_ms < 2000 then perform race_sim.travel_to(st.event_id, a.eff_ms); end if;
    end if;
    if exists (select 1 from race_final.res rs where rs.n = a.n and rs.station = a.station and rs.status in ('VOID_DNS', 'NOT_REACHED')) then
      -- the athlete was skipped / withdrew since the plan was made: nobody judges an athlete who is not there
      insert into race_final.dropped values (a.n, a.station, a.kind, 1);
    elsif a.kind = 'perf' then perform race_final.do_perf(a);
    else perform race_final.do_ocr(a); end if;
    update race_final.act set done = true where id = a.id;
  end loop;
  -- the harness's own processing time is not race time: put the race clock back on the scripted instant before anything that is time-exact
  if race_now_ms(st.event_id) > t and race_now_ms(st.event_id) - t < 2000 then perform race_sim.travel_to(st.event_id, t); end if;
  -- 1. reconnects (a blackout ends)
  for b in select * from race_final.blackout where not done and "to" <= t order by "to" loop perform race_final.reconnect(b); perform race_final.refresh(); end loop;
  -- 1b. whatever the reconnect just made visible (a device flushing its queue) is sent in the same instant
  for a in select * from race_final.act where not done and eff_ms is not null and eff_ms <= t order by eff_ms, abs_ms, id loop
    -- the harness's own processing time is not race time: the clock is put on the scheduled instant ONCE per instant; the actions of that instant then go out one
    -- after the other in real time, so server time can never run backwards between two of them (a queue flush of 150 actions drifts by at most a few hundred ms)
    if v_last is distinct from a.eff_ms then
      v_last := a.eff_ms;
      if race_now_ms(st.event_id) >= a.eff_ms and race_now_ms(st.event_id) - a.eff_ms < 2000 then perform race_sim.travel_to(st.event_id, a.eff_ms); end if;
    end if;
    if exists (select 1 from race_final.res rs where rs.n = a.n and rs.station = a.station and rs.status in ('VOID_DNS', 'NOT_REACHED')) then
      -- the athlete was skipped / withdrew since the plan was made: nobody judges an athlete who is not there
      insert into race_final.dropped values (a.n, a.station, a.kind, 1);
    elsif a.kind = 'perf' then perform race_final.do_perf(a);
    else perform race_final.do_ocr(a); end if;
    update race_final.act set done = true where id = a.id;
  end loop;
  -- 2. the operators (scripted exceptions), then everything due
  for s in select * from race_final.script where not done and at_ms <= t order by at_ms, seq loop
    perform race_final.do_script(s); update race_final.script set done = true where seq = s.seq;
  end loop;
  for r in select * from race_final.review_due where not done and due_ms <= t order by due_ms, id loop perform race_final.do_review(r); end loop;
  -- 3. the operator's device ticks (unless the Master / every device is disconnected)
  doticks := t % 5000 = 0 and not exists (select 1 from race_final.blackout where scope in ('MASTER', 'ALL') and not done and t >= "from" and t < "to");
  if doticks then perform race_final.tick(); end if;
  update race_final.state set steps = steps + 1;
  return 'ok';
end $$;
reset role;
select race_final.refresh();
