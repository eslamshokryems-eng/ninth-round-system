-- FINAL END-TO-END VALIDATION — part 1: the event, its people, registration, payments, heats. Everything goes through the real RPCs as the real roles.
-- (psql -v planfile=… ; runs after helpers.sql / simulator.sql, as the database owner)
\set ON_ERROR_STOP on
\set QUIET on
reset role;
create schema race_final;
grant usage on schema race_final to anon, authenticated, service_role;
create table race_final.plan (doc jsonb not null);
insert into race_final.plan select pg_read_file(:'planfile')::jsonb;
create table race_final.tok (k text primary key, reg uuid not null);
grant all on race_final.tok to public;
grant execute on all functions in schema race_final to public;
create function race_final.rid(p_key text) returns uuid language sql stable as $$ select reg from race_final.tok where k = p_key $$;
grant execute on function race_final.rid(text) to public;
create function race_final.keep(p_key text, p_event uuid, p_name text, p_phone text, p_gender race_gender, p_dob date, p_cat race_category_code, p_style race_pushup_style default null)
returns text language plpgsql as $$
declare r record;
begin
  select * into r from race_register_athlete(p_event, p_name, p_phone, null, p_gender, p_dob, p_cat, p_style, true, '{"name":"Family Contact","phone":"01011112222"}'::jsonb);
  insert into race_final.tok values (p_key, r.registration_id);
  return r.race_number;
end $$;
grant execute on function race_final.keep(text, uuid, text, text, race_gender, date, race_category_code, race_pushup_style) to public;
create function race_final.p() returns jsonb language sql stable security definer as $$ select doc from race_final.plan $$;
create table race_final.checks (seq serial, label text not null, ok boolean not null, detail text);
create function race_final.chk(p_label text, p_ok boolean, p_detail text default null) returns void language plpgsql security definer as $$
begin
  insert into race_final.checks (label, ok, detail) values (p_label, coalesce(p_ok, false), p_detail);
  if p_ok is distinct from true then raise exception 'FINAL VALIDATION FAIL: % %', p_label, coalesce(p_detail, ''); end if;
end $$;

-- the people ------------------------------------------------------------------------------------------------------------------------------
select race_test.make_user('f_bm', 'C');            -- Event Manager (creates the event)
select race_test.make_user('f_master', '');         -- Master Control
select race_test.make_user('f_rec', '');            -- Reception
select race_test.make_user('f_j' || i, '') from generate_series(1, 9) i;     -- one Judge per station
select race_test.make_user('f_scr' || i, '') from generate_series(1, 9) i;   -- one Station Screen per station

select race_test.login('f_bm');
select race_test.put('ev_f', race_create_event('the-ninth-final-2026', date '2026-12-21', 'THE NINTH', 'Africa/Cairo', timestamptz '2026-12-21 07:00:00+00'));
select race_set_event_status(race_test.id('ev_f'), 'REGISTRATION_OPEN');
reset role;
update race_events set registration_fee = 750 where id = race_test.id('ev_f');
insert into race_staff (event_id, profile_id, role) values (race_test.id('ev_f'), race_test.id('f_master'), 'MASTER_CONTROL'), (race_test.id('ev_f'), race_test.id('f_rec'), 'RECEPTION');
insert into race_staff (event_id, profile_id, role, station_id)
select race_test.id('ev_f'), race_test.id(k), r::race_role, st.id
  from (select 'f_j' || i k, 'JUDGE' r, i n from generate_series(1, 9) i union all select 'f_scr' || i, 'STATION_SCREEN', i from generate_series(1, 9) i) v
  join race_stations st on st.event_id = race_test.id('ev_f') and st.number = v.n;

-- REGISTRATION (public, anonymous) — 51 people; the 51st will never pay ---------------------------------------------------------------------------
select race_test.anon();
select race_final.chk('registration: 51 athletes registered through the public RPC',
  (select count(*) = 51 from (select race_final.keep('fv' || (a ->> 'n'), race_test.id('ev_f'), a ->> 'name', a ->> 'phone', (a ->> 'gender')::race_gender, (a ->> 'dob')::date, (a ->> 'category')::race_category_code, (a ->> 'style')::race_pushup_style)
                               from jsonb_array_elements(race_final.p() -> 'roster') a order by (a ->> 'n')::int) q));
reset role;
select race_final.chk('registration: race numbers are N001…N051 in registration order', (select count(*) = 51 and bool_and(g.race_number = 'N' || lpad((a ->> 'n'), 3, '0'))
  from jsonb_array_elements(race_final.p() -> 'roster') a join race_registrations g on g.id = race_final.rid('fv' || (a ->> 'n')) ));
select race_final.chk('registration: categories and push-up styles as registered',
  (select bool_and(c.code::text = a ->> 'category' and g.pushup_style::text = a ->> 'style')
     from jsonb_array_elements(race_final.p() -> 'roster') a join race_registrations g on g.id = race_final.rid('fv' || (a ->> 'n')) join race_categories c on c.id = g.category_id));
select race_final.chk('payment status: everybody starts PENDING_PAYMENT (fee 750 EGP)', (select count(*) = 51 from race_registrations where event_id = race_test.id('ev_f') and status = 'PENDING_PAYMENT'));

-- PAYMENT — cash / InstaPay / Vodafone Cash / card POS, one waiver, one never pays --------------------------------------------------------------------
select race_test.login('f_rec');
select race_confirm_payment(race_final.rid('fv' || (a ->> 'n')), (a ->> 'pay')::race_payment_method, 750, 'final validation', 'pay-' || (a ->> 'n'))
  from jsonb_array_elements(race_final.p() -> 'roster') a where a ->> 'pay' not in ('UNPAID', 'WAIVED');
select race_test.login('f_bm');
select race_waive_payment(race_final.rid('fv7'), 'sponsored athlete — fee waived by the Event Manager');
reset role;
select race_final.chk('payment status: 49 paid + 1 waived are CONFIRMED, N051 stays PENDING_PAYMENT',
  (select count(*) filter (where status = 'CONFIRMED') = 50 and count(*) filter (where status = 'PENDING_PAYMENT') = 1 from race_registrations where event_id = race_test.id('ev_f')));
select race_test.login('f_rec');
select race_final.chk('payment status: the unpaid athlete cannot be checked in', (select true from (select race_test.throws($$select * from race_check_in(race_final.rid('fv51'))$$, 'RACE_NOT_CONFIRMED|RACE_NO_HEAT|RACE_CHECKIN_NOT_OPEN', 'unpaid cannot check in')) q));
reset role;

-- HEAT ASSIGNMENT — six heats (9,9,9,9,9,5), heat 5 starts only on the Event Manager's command ------------------------------------------------------
insert into race_heats (event_id, number) select race_test.id('ev_f'), h from generate_series(1, 6) h;
update race_heats set start_mode = 'MANUAL' where event_id = race_test.id('ev_f') and number = 5;
select race_test.login('f_bm');
select race_move_athlete_heat(race_final.rid('fv' || (a ->> 'n')), (select id from race_heats where event_id = race_test.id('ev_f') and number = (a ->> 'heat')::int))
  from jsonb_array_elements(race_final.p() -> 'roster') a where a ->> 'heat' is not null;
select race_lock_heats(race_test.id('ev_f'));
reset role;
select race_final.chk('heats: six heats of 9,9,9,9,9,5 are LOCKED', (select array_agg(c order by h) = array[9, 9, 9, 9, 9, 5]::bigint[] from (select h.number h, count(*) c from race_registrations g join race_heats h on h.id = g.heat_id where g.event_id = race_test.id('ev_f') group by h.number) q)
  and (select count(*) = 6 from race_heats where event_id = race_test.id('ev_f') and status = 'LOCKED' or event_id = race_test.id('ev_f') and status = 'AWAITING_START'));
