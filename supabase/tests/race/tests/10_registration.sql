-- Phase 4: registration, race numbers, manual payments, athlete self-service, reception search.
reset role;

create table race_test.tok (k text primary key, v text not null, reg uuid);
grant all on race_test.tok to public;
create function race_test.reg(p_event uuid, p_name text, p_phone text, p_gender gender, p_dob date,
                              p_cat race_category_code, p_style race_pushup_style default null)
returns table (registration_id uuid, race_number text, access_token text, status race_reg_status, amount_due numeric, currency text)
language sql as $$
  select * from race_register_athlete(p_event, p_name, p_phone, null, p_gender, p_dob, p_cat, p_style, true,
                                      '{"name":"Family Contact","phone":"01011112222"}'::jsonb)
$$;
grant execute on function race_test.reg(uuid, text, text, gender, date, race_category_code, race_pushup_style) to public;
-- register and remember the token under a key
create function race_test.keep(p_key text, p_event uuid, p_name text, p_phone text, p_gender gender, p_dob date,
                               p_cat race_category_code, p_style race_pushup_style default null)
returns text language plpgsql as $$
declare r record;
begin
  select * into r from race_test.reg(p_event, p_name, p_phone, p_gender, p_dob, p_cat, p_style);
  insert into race_test.tok values (p_key, r.access_token, r.registration_id);
  return r.race_number;
end $$;
grant execute on function race_test.keep(text, uuid, text, text, gender, date, race_category_code, race_pushup_style) to public;
create function race_test.tk(p_key text) returns text language sql stable as $$ select v from race_test.tok where k = p_key $$;
create function race_test.rid(p_key text) returns uuid language sql stable as $$ select reg from race_test.tok where k = p_key $$;
grant execute on function race_test.tk(text), race_test.rid(text) to public;

-- Events: one free, one with a 750 EGP fee. Creator (bm_a) becomes EVENT_MANAGER.
select race_test.login('bm_a');
select race_test.put('ev_free', race_create_event(race_test.id('branch_a'), 'reg-free-2026', date '2026-11-20', 'THE NINTH', 'Africa/Cairo', timestamptz '2026-11-20 07:00:00+00'));
select race_test.put('ev_paid', race_create_event(race_test.id('branch_a'), 'reg-paid-2026', date '2026-11-20'));
update race_events set registration_fee = 750, instructions = 'Arrive 30 minutes early. Bring water.' where id = race_test.id('ev_paid');
select race_set_event_status(race_test.id('ev_free'), 'REGISTRATION_OPEN');
select race_set_event_status(race_test.id('ev_paid'), 'REGISTRATION_OPEN');
insert into race_staff (event_id, profile_id, role) values
  (race_test.id('ev_free'), race_test.id('rec'), 'RECEPTION'), (race_test.id('ev_free'), race_test.id('master'), 'MASTER_CONTROL'),
  (race_test.id('ev_paid'), race_test.id('rec'), 'RECEPTION');
insert into race_staff (event_id, profile_id, role, station_id)
select race_test.id('ev_free'), race_test.id('judge1'), 'JUDGE', id from race_stations where event_id = race_test.id('ev_free') and number = 1;
select race_test.eq((select registration_fee from race_events where id = race_test.id('ev_free')), 0::numeric, 'setup: default registration fee is 0');
select race_test.login('rec');
select race_test.eq(race_test.affected($$update race_events set registration_fee = 1 where id = race_test.id('ev_free')$$), 0::bigint,
  'setup: reception cannot change the registration fee');

-- Phone normalization ------------------------------------------------------------------
select race_test.ok(race_normalize_phone('+20 100 123 4567') = '01001234567'
                    and race_normalize_phone('0100 123 4567') = '01001234567'
                    and race_normalize_phone('1001234567') = '01001234567'
                    and race_normalize_phone('0020 100 123 4567') = '01001234567'
                    and race_normalize_phone('(0100) 123-4567') = '01001234567'
                    and race_normalize_phone(race_normalize_phone('+201001234567')) = '01001234567'
                    and race_normalize_phone(null) = '',
  'phone: Egyptian formats normalize to one canonical number (idempotent)');

-- Public registration: anonymous, no account ---------------------------------------------
select race_test.anon();
select race_test.eq(race_test.keep('n1', race_test.id('ev_free'), 'Ahmed Mohamed', '01001234567', 'male', '1995-05-05', 'MEN'), 'N001',
  'register: first athlete gets race number N001 (anonymous, no account)');
select race_test.eq(race_test.keep('n2', race_test.id('ev_free'), 'Sara Ali', '01111234567', 'female', '1998-03-03', 'WOMEN'), 'N002', 'register: N002');
select race_test.eq(race_test.keep('n3', race_test.id('ev_free'), 'Hassan Kamel', '01221234567', 'male', '1980-01-15', 'MASTERS'), 'N003', 'register: N003 (Masters)');
select race_test.eq(race_test.keep('n4', race_test.id('ev_free'), 'Omar Mohamed', '+20 100 123 4567', 'male', '1996-07-07', 'MEN'), 'N004',
  'register: same phone, different person (sibling) is allowed');
reset role;
select race_test.ok((select status = 'CONFIRMED' and race_status = 'REGISTERED' and waiver_accepted_at is not null
                            and abs(extract(epoch from waiver_accepted_at - clock_timestamp())) < 60
                     from race_registrations where race_number = 'N001' and event_id = race_test.id('ev_free')),
  'register: free event → CONFIRMED immediately; waiver time is the server''s');
select race_test.ok((select string_agg(race_number || '=' || pushup_style, ',' order by race_number) from race_registrations
                     where event_id = race_test.id('ev_free')) = 'N001=STANDARD,N002=KNEE,N003=KNEE,N004=STANDARD',
  'register: push-up defaults Men=Standard, Women=Knee, Masters=Knee');
select race_test.ok(length(race_test.tk('n1')) = 64
                    and (select access_token_hash from race_registrations where id = race_test.rid('n1')) = encode(sha256(convert_to(race_test.tk('n1'), 'UTF8')), 'hex')
                    and (select access_token_hash from race_registrations where id = race_test.rid('n1')) <> race_test.tk('n1'),
  'register: 256-bit token returned once; only its SHA-256 is stored');
select race_test.ok((select count(distinct access_token_hash) = 4 from race_registrations where event_id = race_test.id('ev_free')), 'register: every athlete gets a different token');

-- Eligibility -------------------------------------------------------------------------------
select race_test.anon();
select race_test.throws($$select * from race_test.reg(race_test.id('ev_free'), 'Female In Men', '01000000001', 'female', '1995-01-01', 'MEN')$$,
  'RACE_CATEGORY_GENDER', 'rules: Men category is for male athletes');
select race_test.throws($$select * from race_test.reg(race_test.id('ev_free'), 'Male In Women', '01000000002', 'male', '1995-01-01', 'WOMEN')$$,
  'RACE_CATEGORY_GENDER', 'rules: Women category is for female athletes');
select race_test.throws($$select * from race_test.reg(race_test.id('ev_free'), 'Unspecified Gender', '01000000003', 'unspecified', '1995-01-01', 'MEN')$$,
  'RACE_CATEGORY_GENDER', 'rules: gender must be stated for Men/Women');
select race_test.throws($$select * from race_test.reg(race_test.id('ev_free'), 'Too Young Masters', '01000000004', 'male', '1986-11-21', 'MASTERS')$$,
  'RACE_CATEGORY_AGE', 'rules: Masters 40+ — 39 years 364 days on event day is refused');
select race_test.throws($$select * from race_test.reg(race_test.id('ev_free'), 'No Dob Masters', '01000000005', 'male', null, 'MASTERS')$$,
  'RACE_DOB_REQUIRED', 'rules: Masters needs a date of birth');
select race_test.throws($$select * from race_test.reg(race_test.id('ev_free'), 'Woman Standard', '01000000006', 'female', '1995-01-01', 'WOMEN', 'STANDARD')$$,
  'RACE_PUSHUP_STYLE_NOT_ALLOWED', 'rules: Women use Knee push-ups (only Knee is selectable outside Men)');
select race_test.throws($$select * from race_test.reg(race_test.id('ev_free'), 'Master Standard', '01000000007', 'female', '1970-01-01', 'MASTERS', 'STANDARD')$$,
  'RACE_PUSHUP_STYLE_NOT_ALLOWED', 'rules: Masters use Knee push-ups');
select race_test.throws($$select * from race_test.reg(race_test.id('ev_free'), 'Future Baby', '01000000008', 'male', '2027-01-01', 'MEN')$$,
  'RACE_INVALID_DOB', 'rules: date of birth in the future refused');
select race_test.throws($$select * from race_test.reg(race_test.id('ev_free'), 'Ancient One', '01000000009', 'male', '1900-01-01', 'MEN')$$,
  'RACE_INVALID_DOB', 'rules: implausible age refused');
select race_test.eq(race_test.keep('n5', race_test.id('ev_free'), 'Mona Fathy', '01551234567', 'female', '1999-01-01', 'WOMEN', 'KNEE'), 'N005',
  'no-gaps: after 9 refused attempts the next race number is still N005 (failed attempts consume nothing)');
select race_test.eq(race_test.keep('n6', race_test.id('ev_free'), 'Karim Adel', '01661234567', 'male', '1990-01-01', 'MEN', 'KNEE'), 'N006',
  'rules: any athlete may choose Knee push-ups (Men choosing Knee)');
select race_test.eq(race_test.keep('n7', race_test.id('ev_free'), 'Tarek Nabil', '01771234567', 'male', '1986-11-20', 'MASTERS'), 'N007',
  'rules: Masters — exactly 40 on the event date is eligible');
reset role;
select race_test.eq((select pushup_style::text from race_registrations where id = race_test.rid('n6')), 'KNEE', 'rules: Knee choice stored');

-- Validation --------------------------------------------------------------------------------
select race_test.anon();
select race_test.throws($$select * from race_register_athlete(race_test.id('ev_free'), 'No Waiver', '01000000010', null, 'male', '1995-01-01', 'MEN', null, false,
                          '{"name":"X","phone":"01011112222"}')$$, 'RACE_WAIVER_REQUIRED', 'validate: waiver is mandatory');
select race_test.throws($$select * from race_register_athlete(race_test.id('ev_free'), 'No Emergency', '01000000011', null, 'male', '1995-01-01', 'MEN', null, true, null)$$,
  'RACE_EMERGENCY_CONTACT_REQUIRED', 'validate: emergency contact is mandatory');
select race_test.throws($$select * from race_register_athlete(race_test.id('ev_free'), 'Bad Emergency', '01000000012', null, 'male', '1995-01-01', 'MEN', null, true,
                          '{"name":"X","phone":"123"}')$$, 'RACE_EMERGENCY_CONTACT_REQUIRED', 'validate: emergency phone must be a real number');
select race_test.throws($$select * from race_test.reg(race_test.id('ev_free'), 'Bad Phone', '12345', 'male', '1995-01-01', 'MEN')$$,
  'RACE_INVALID_PHONE', 'validate: phone too short');
select race_test.throws($$select * from race_test.reg(race_test.id('ev_free'), 'X', '01000000013', 'male', '1995-01-01', 'MEN')$$,
  'RACE_INVALID_NAME', 'validate: name too short');
select race_test.throws($$select * from race_register_athlete(race_test.id('ev_free'), 'Bad Email', '01000000014', 'not-an-email', 'male', '1995-01-01', 'MEN', null, true,
                          '{"name":"X","phone":"01011112222"}')$$, 'RACE_INVALID_EMAIL', 'validate: email format');

-- Duplicates ----------------------------------------------------------------------------------
select race_test.throws($$select * from race_test.reg(race_test.id('ev_free'), 'Ahmed Mohamed', '01001234567', 'male', '1995-05-05', 'MEN')$$,
  'RACE_ALREADY_REGISTERED', 'duplicate: same person cannot register twice');
select race_test.throws($$select * from race_test.reg(race_test.id('ev_free'), '  ahmed MOHAMED ', '+20 100 123 4567', 'male', '1995-05-05', 'MEN')$$,
  'RACE_ALREADY_REGISTERED', 'duplicate: different phone format + name casing/spacing is still the same person');
select race_test.throws($$select * from race_test.reg(race_test.id('ev_free'), 'Ahmed Mohamed', '01001234567', 'male', '1995-05-05', 'MASTERS')$$,
  'RACE_CATEGORY_AGE', 'duplicate: category rules are checked before anything is created');

-- Closed / draft events ---------------------------------------------------------------------------
select race_test.throws($$select * from race_test.reg(race_test.id('event_a'), 'Late Arrival', '01000000015', 'male', '1995-01-01', 'MEN')$$,
  'RACE_REGISTRATION_CLOSED', 'closed: event past registration (HEATS_LOCKED) refuses public registration');
select race_test.throws($$select * from race_test.reg(race_test.id('event_b'), 'Too Early', '01000000016', 'male', '1995-01-01', 'MEN')$$,
  'RACE_REGISTRATION_CLOSED', 'closed: DRAFT event refuses public registration (and does not reveal it exists)');
select race_test.throws($$select * from race_test.reg(gen_random_uuid(), 'Nobody Event', '01000000017', 'male', '1995-01-01', 'MEN')$$,
  'RACE_REGISTRATION_CLOSED', 'closed: unknown event gives the same answer');
reset role;
select race_test.ok((select count(*) = 7 and count(distinct race_number) = 7 and min(race_number) = 'N001' and max(race_number) = 'N007'
                     from race_registrations where event_id = race_test.id('ev_free')),
  'race numbers: 7 registrations, 7 distinct numbers, N001–N007, no gaps');
select race_test.ok((select last_number = 7 from race_event_counters where event_id = race_test.id('ev_free')), 'race numbers: counter matches');

-- Paid event: pending payment created ------------------------------------------------------------------
select race_test.anon();
select race_test.keep('p1', race_test.id('ev_paid'), 'Nour Salem', '01201234561', 'female', '1997-01-01', 'WOMEN');
select race_test.keep('p2', race_test.id('ev_paid'), 'Youssef Adel', '01201234562', 'male', '1995-01-01', 'MEN');
select race_test.keep('p3', race_test.id('ev_paid'), 'Laila Hany', '01201234563', 'female', '1995-01-01', 'WOMEN');
select race_test.keep('p4', race_test.id('ev_paid'), 'Mostafa Reda', '01201234564', 'male', '1995-01-01', 'MEN');
select race_test.keep('p5', race_test.id('ev_paid'), 'Dina Sami', '01201234565', 'female', '1995-01-01', 'WOMEN');
select race_test.keep('p6', race_test.id('ev_paid'), 'Ali Zaki', '01201234566', 'male', '1995-01-01', 'MEN');
select race_test.ok((select status = 'PENDING_PAYMENT' and amount_due = 750 and currency = 'EGP' and length(currency) = 3 and race_number = 'N007'
                     from race_test.reg(race_test.id('ev_paid'), 'Karim Fouad', '01201234567', 'male', '1995-01-01', 'MEN')),
  'payment: paid event → PENDING_PAYMENT, amount due 750, currency EGP (not truncated); counters are per event (N007 here)');
reset role;
select race_test.ok((select count(*) = 7 and bool_and(status = 'PENDING' and amount = 750 and provider = 'MANUAL' and paid_at is null)
                     from race_payments where event_id = race_test.id('ev_paid')),
  'payment: one PENDING manual payment of 750 per registration');
select race_test.ok((select bool_and(status = 'PENDING_PAYMENT') from race_registrations where event_id = race_test.id('ev_paid')),
  'payment: registrations stay PENDING_PAYMENT until paid');

-- Manual payment confirmation --------------------------------------------------------------------------
select race_test.anon();
select race_test.throws($$select race_confirm_payment(race_test.rid('p1'), 'CASH')$$, 'permission denied', 'payment: anon cannot confirm');
select race_test.login('judge1');
select race_test.throws($$select race_confirm_payment(race_test.rid('p1'), 'CASH')$$, 'RACE_FORBIDDEN', 'payment: a judge cannot confirm (no such role on this event)');
select race_test.login('rec');
select race_test.throws($$select race_confirm_payment(race_test.rid('p1'), 'ONLINE')$$, 'RACE_INVALID_PAYMENT_METHOD', 'payment: ONLINE is not a manual method');
select race_test.put('pay1', race_confirm_payment(race_test.rid('p1'), 'CASH', null, null, 'receipt-0001'));
select race_test.ok((select p.status = 'PAID' and p.method = 'CASH' and p.recorded_by = race_test.id('rec') and p.amount = 750
                            and abs(extract(epoch from p.paid_at - clock_timestamp())) < 60 and r.status = 'CONFIRMED'
                     from race_payments p join race_registrations r on r.id = p.registration_id where p.id = race_test.id('pay1')),
  'payment: reception confirms cash → PAID (server time, recorded_by) and registration CONFIRMED');
select race_test.eq(race_confirm_payment(race_test.rid('p1'), 'CASH', null, null, 'receipt-0001'), race_test.id('pay1'),
  'payment: idempotent retry with the same key returns the same payment');
select race_test.eq((select count(*) from race_payments where registration_id = race_test.rid('p1'))::int, 1, 'payment: retry created no second payment row');
select race_test.throws($$select race_confirm_payment(race_test.rid('p1'), 'CASH')$$, 'RACE_ALREADY_PAID', 'payment: paying twice without a key is refused');
select race_test.throws($$select race_confirm_payment(race_test.rid('p2'), 'CASH', 600)$$, 'RACE_AMOUNT_MISMATCH', 'payment: a different amount needs a note');
select race_test.put('pay2', race_confirm_payment(race_test.rid('p2'), 'INSTAPAY', 600, 'Early-bird discount approved by manager'));
select race_test.ok((select amount = 600 and method = 'INSTAPAY' from race_payments where id = race_test.id('pay2')), 'payment: discounted amount recorded with its note');

-- Cancel / refund / waive ---------------------------------------------------------------------------------
select race_test.login('rec');
select race_test.throws($$select race_cancel_registration(race_test.rid('p3'), 'x')$$, 'RACE_FORBIDDEN', 'cancel: reception cannot cancel');
select race_test.throws($$select race_refund_payment(race_test.id('pay1'), 'x')$$, 'RACE_FORBIDDEN', 'refund: reception cannot refund');
select race_test.throws($$select race_waive_payment(race_test.rid('p4'), 'x')$$, 'RACE_FORBIDDEN', 'waive: reception cannot waive');
select race_test.login('bm_a');
select race_test.throws($$select race_cancel_registration(race_test.rid('p3'), ' ')$$, 'RACE_REASON_REQUIRED', 'cancel: a reason is required');
select race_cancel_registration(race_test.rid('p3'), 'Athlete withdrew before paying');
select race_test.ok((select r.status = 'CANCELLED' and p.status = 'CANCELLED' and p.cancelled_at is not null
                     from race_registrations r join race_payments p on p.registration_id = r.id where r.id = race_test.rid('p3')),
  'cancel: registration + pending payment CANCELLED; race number stays reserved');
select race_test.throws($$select race_confirm_payment(race_test.rid('p3'), 'CASH')$$, 'RACE_REGISTRATION_CANCELLED', 'cancel: a cancelled registration cannot be paid');
select race_test.throws($$select race_cancel_registration(race_test.rid('p1'), 'x')$$, 'RACE_REFUND_REQUIRED', 'cancel: a paid registration must be refunded first');
select race_test.throws($$select race_refund_payment(race_test.id('pay1'), '')$$, 'RACE_REASON_REQUIRED', 'refund: a reason is required');
select race_refund_payment(race_test.id('pay1'), 'Athlete injured, full refund');
select race_test.ok((select r.status = 'CANCELLED' and p.status = 'REFUNDED' and p.refunded_at is not null and r.heat_id is null
                     from race_registrations r join race_payments p on p.registration_id = r.id where r.id = race_test.rid('p1')),
  'refund: payment REFUNDED, registration CANCELLED, heat seat released');
select race_test.throws($$select race_refund_payment(race_test.id('pay1'), 'again')$$, 'RACE_INVALID_PAYMENT_TRANSITION', 'refund: cannot refund twice');
select race_test.throws($$select race_waive_payment(race_test.rid('p4'), '')$$, 'RACE_REASON_REQUIRED', 'waive: a reason is required');
select race_waive_payment(race_test.rid('p4'), 'Sponsored athlete');
select race_test.ok((select r.status = 'CONFIRMED' and r.payment_waived_by = race_test.id('bm_a') and r.payment_waiver_reason = 'Sponsored athlete' and p.status = 'CANCELLED'
                     from race_registrations r join race_payments p on p.registration_id = r.id where r.id = race_test.rid('p4')),
  'waive: manager waives with a reason → CONFIRMED, pending payment closed, waiver recorded');
select race_test.throws($$select race_waive_payment(race_test.rid('p1'), 'x')$$, 'RACE_REGISTRATION_CANCELLED', 'waive: cannot waive a cancelled registration');
select race_test.throws($$select race_waive_payment(race_test.rid('p2'), 'x')$$, 'RACE_ALREADY_PAID', 'waive: cannot waive a paid registration');
select race_test.login('rec');
select race_confirm_payment(race_test.rid('p5'), 'CARD_POS');
reset role;
update race_registrations set race_status = 'CHECKED_IN' where id = race_test.rid('p5');
select race_test.login('bm_a');
select race_test.throws($$select race_refund_payment((select id from race_payments where registration_id = race_test.rid('p5')), 'x')$$,
  'RACE_ATHLETE_ALREADY_CHECKED_IN', 'refund: refused once the athlete is checked in (race control workflow instead)');
select race_test.throws($$select race_cancel_registration(race_test.rid('p5'), 'x')$$, 'RACE_ATHLETE_ALREADY_CHECKED_IN', 'cancel: refused once the athlete is checked in');

-- Status machines hold even against the table owner ---------------------------------------------------------------
reset role;
select race_test.throws($$update race_registrations set status = 'CONFIRMED' where id = race_test.rid('p6')$$, 'RACE_PAYMENT_REQUIRED',
  'guard: an unpaid registration in a paid event cannot be CONFIRMED');
select race_test.throws($$update race_registrations set status = 'CONFIRMED' where id = race_test.rid('p3')$$, 'cannot be reactivated',
  'guard: CANCELLED is terminal');
select race_test.throws($$update race_payments set status = 'PAID', paid_at = now() where id = race_test.id('pay1')$$, 'RACE_INVALID_PAYMENT_TRANSITION',
  'guard: REFUNDED cannot become PAID again');
select race_test.throws($$update race_payments set status = 'PENDING' where id = race_test.id('pay2')$$, 'RACE_INVALID_PAYMENT_TRANSITION',
  'guard: PAID cannot go back to PENDING');
select race_test.throws($$update race_payments set amount = 1 where id = race_test.id('pay2')$$, 'RACE_PAYMENT_IMMUTABLE',
  'guard: a PAID payment''s amount can never change');
select race_test.throws($$update race_payments set registration_id = race_test.rid('p6') where id = race_test.id('pay2')$$, 'RACE_PAYMENT_IMMUTABLE',
  'guard: a payment cannot be moved to another registration');
select race_test.ok((select count(*) = 1 from race_registrations where race_number = 'N001' and event_id = race_test.id('ev_paid') and status = 'CANCELLED'),
  'guard: refused changes left the data untouched');

-- Athlete self-service (secret token) -----------------------------------------------------------------------------
select race_test.anon();
select race_test.ok((select race_number = 'N001' and full_name = 'Ahmed Mohamed' and category_code = 'MEN' and category_name = 'Men'
                            and status = 'CONFIRMED' and race_status = 'REGISTERED' and pushup_style = 'STANDARD' and not pushup_style_locked
                            and event_slug = 'reg-free-2026' and event_name = 'THE NINTH' and timezone = 'Africa/Cairo'
                            and heat_number is null and heat_start_at is null and payment_status is null
                     from race_get_registration(race_test.tk('n1'))), 'athlete: token returns own race number, category, event and status');
select race_test.ok((select payment_status = 'PENDING' and payment_amount = 750 and currency = 'EGP' and instructions like 'Arrive 30 minutes%'
                     from race_get_registration(race_test.tk('p6'))), 'athlete: paid event shows payment status/amount and event instructions');
select race_test.eq(race_test.count($$select 1 from race_get_registration('0000000000000000000000000000000000000000000000000000000000000000')$$), 0::bigint, 'athlete: wrong token → nothing');
select race_test.eq(race_test.count($$select 1 from race_get_registration('short')$$), 0::bigint, 'athlete: short token → nothing');
select race_test.eq(race_test.count($$select 1 from race_get_registration(null)$$), 0::bigint, 'athlete: null token → nothing');
select race_test.eq(race_test.count($$select 1 from race_get_registration(race_test.tk('n2'))$$), 1::bigint, 'athlete: a token reveals exactly one registration');
select race_test.eq(race_update_pushup_style(race_test.tk('n1'), 'KNEE'), 'KNEE'::race_pushup_style, 'athlete: Men may switch to Knee');
select race_test.eq(race_update_pushup_style(race_test.tk('n1'), 'STANDARD'), 'STANDARD'::race_pushup_style, 'athlete: and back to Standard (category default)');
select race_test.throws($$select race_update_pushup_style(race_test.tk('n2'), 'STANDARD')$$, 'RACE_PUSHUP_STYLE_NOT_ALLOWED', 'athlete: Women cannot switch to Standard');
select race_test.throws($$select race_update_pushup_style('nope-nope-nope-nope-nope-nope-nope-nope-nope', 'KNEE')$$, 'RACE_NOT_FOUND', 'athlete: unknown token cannot change anything');
reset role;
update race_registrations set pushup_style_locked_at = now() where id = race_test.rid('n3');
select race_test.anon();
select race_test.throws($$select race_update_pushup_style(race_test.tk('n3'), 'KNEE')$$, 'RACE_PUSHUP_STYLE_LOCKED', 'athlete: style locked once Station 02 starts');
select race_test.throws($$select * from race_registrations$$, 'permission denied', 'athlete: anon still has no table access');

-- Reception search / staff list ---------------------------------------------------------------------------------------
select race_test.login('rec');
select race_test.eq(race_test.count($$select 1 from race_list_registrations(race_test.id('ev_free'))$$), 7::bigint, 'search: reception lists all registrations');
select race_test.ok((select array_agg(race_number) from race_list_registrations(race_test.id('ev_free'), 'N002')) = array['N002'], 'search: "N002"');
select race_test.ok((select array_agg(race_number) from race_list_registrations(race_test.id('ev_free'), 'n2')) = array['N002'], 'search: "n2" (case + no padding)');
select race_test.ok((select array_agg(race_number) from race_list_registrations(race_test.id('ev_free'), '2')) = array['N002'], 'search: "2"');
select race_test.ok((select array_agg(race_number) from race_list_registrations(race_test.id('ev_free'), '002')) = array['N002'], 'search: "002"');
select race_test.ok((select array_agg(race_number order by race_number) from race_list_registrations(race_test.id('ev_free'), '+20 100 123 4567')) = array['N001', 'N004'],
  'search: phone in international format finds both athletes on that phone');
select race_test.ok((select array_agg(race_number order by race_number) from race_list_registrations(race_test.id('ev_free'), '0100123')) = array['N001', 'N004'], 'search: partial phone');
select race_test.ok((select array_agg(race_number order by race_number) from race_list_registrations(race_test.id('ev_free'), 'mohamed')) = array['N001', 'N004'], 'search: name (case-insensitive substring)');
select race_test.eq(race_test.count($$select 1 from race_list_registrations(race_test.id('ev_free'), 'zzzz-nobody')$$), 0::bigint, 'search: no match → empty');
select race_test.eq(race_test.count($$select 1 from race_list_registrations(race_test.id('ev_free'), null, 3)$$), 3::bigint, 'search: limit is honoured');
select race_test.ok((select phone = '01001234567' and category_code = 'MEN' and payment_status is null and heat_number is null
                     from race_list_registrations(race_test.id('ev_free'), 'N001')), 'search: row carries phone, category, payment and heat');
select race_test.ok((select payment_status = 'PENDING' and payment_amount = 750 from race_list_registrations(race_test.id('ev_paid'), 'N006')), 'search: payment status visible to reception');
select race_test.login('master');
select race_test.eq(race_test.count($$select 1 from race_list_registrations(race_test.id('ev_free'))$$), 7::bigint, 'search: master control can list');
select race_test.login('judge1');
select race_test.throws($$select * from race_list_registrations(race_test.id('ev_free'))$$, 'RACE_FORBIDDEN', 'search: a judge cannot list athletes');
select race_test.login('nobody');
select race_test.throws($$select * from race_list_registrations(race_test.id('ev_free'))$$, 'RACE_FORBIDDEN', 'search: a signed-in stranger cannot list athletes');
select race_test.login('bm_b');
select race_test.throws($$select * from race_list_registrations(race_test.id('ev_free'))$$, 'RACE_FORBIDDEN', 'search: another event''s manager cannot list this event');
select race_test.anon();
select race_test.throws($$select * from race_list_registrations(race_test.id('ev_free'))$$, 'permission denied', 'search: anon cannot list');

-- Staff registration + profile link -------------------------------------------------------------------------------------
select race_test.login('rec');
select race_test.ok((select race_number = 'N008' and status = 'CONFIRMED' and length(access_token) = 64
                     from race_staff_register_athlete(race_test.id('ev_free'), 'Walk In', '01881234567', null, 'male', '1992-02-02', 'MEN', null, true,
                          '{"name":"Wife","phone":"01011112222"}')), 'staff register: reception registers a phone/walk-in athlete (N008) and gets a link token');
select race_test.login('judge1');
select race_test.throws($$select * from race_staff_register_athlete(race_test.id('ev_free'), 'Judge Adds', '01881234568', null, 'male', '1992-02-02', 'MEN', null, true,
                          '{"name":"W","phone":"01011112222"}')$$, 'RACE_FORBIDDEN', 'staff register: a judge cannot register athletes');
select race_test.login('nobody');
select race_test.ok((select race_number = 'N009' from race_test.reg(race_test.id('ev_free'), 'Self Registered', '01991234567', 'male', '1993-03-03', 'MEN')),
  'self register: a signed-in user can register themself (N009)');
select race_test.ok((select race_number = 'N010' from race_test.reg(race_test.id('ev_free'), 'Their Friend', '01991234568', 'male', '1993-03-03', 'MEN')), 'self register: and a friend (N010)');
select race_test.ok(race_test.count($$select 1 from race_athletes$$) = 1 and (select full_name from race_athletes) = 'Self Registered'
                    and race_test.count($$select 1 from race_registrations$$) = 1,
  'self register: only the FIRST athlete is linked to the account; the friend is not, and is invisible to it');
reset role;
select race_test.ok((select profile_id is null from race_athletes where full_name = 'Walk In')
                    and (select profile_id is null from race_athletes where full_name = 'Their Friend'), 'staff register: never links the staff member''s account');

-- Audit --------------------------------------------------------------------------------------------------------------------
select race_test.ok((select count(*) >= 10 from admin_audit_log where action = 'race.registrations.insert' and metadata ->> 'event_id' = race_test.id('ev_free')::text),
  'audit: every registration is audited (race.registrations.insert with event id)');
select race_test.ok((select count(*) >= 3 from admin_audit_log where action = 'race.payments.update' and metadata -> 'changed_fields' ? 'status'
                       and metadata ->> 'event_id' = race_test.id('ev_paid')::text),
  'audit: payment status changes are audited');
select race_test.ok(exists (select 1 from admin_audit_log where action = 'race.registration.cancel' and metadata ->> 'reason' = 'Athlete withdrew before paying'),
  'audit: cancellation is audited with its reason');
select race_test.ok(not exists (select 1 from admin_audit_log where target_table like 'race\_%'
                                and (coalesce("after"::text, '') || coalesce("before"::text, '') || metadata::text) like '%access_token_hash%'),
  'audit: the token hash never reaches the audit log');
select race_test.ok(not exists (select 1 from admin_audit_log a, race_test.tok t
                                where (coalesce(a."after"::text, '') || coalesce(a."before"::text, '') || a.metadata::text) like '%' || t.v || '%'),
  'audit: no raw athlete token in the audit log');
select race_test.ok((select actor_full_name = 'Rec' from admin_audit_log where action = 'race.registrations.insert'
                     and "after" ->> 'race_number' = 'N008' and metadata ->> 'event_id' = race_test.id('ev_free')::text),
  'audit: staff registration records which staff member did it');

-- Heat start projection + real heat numbers ---------------------------------------------------------------------------------------
select race_test.login('bm_a');
insert into race_heats (event_id, number) select race_test.id('ev_free'), n from generate_series(1, 4) n;
select race_test.put('h1', (select id from race_heats where event_id = race_test.id('ev_free') and number = 1));
select race_test.put('h4', (select id from race_heats where event_id = race_test.id('ev_free') and number = 4));
select race_move_athlete_heat(race_test.rid('n1'), race_test.id('h1'));
select race_move_athlete_heat(race_test.rid('n5'), race_test.id('h4'));
select race_test.ok((select array_agg(heat_number order by athlete_no) from race_event_schedule(race_test.id('ev_free'))) = array[1, 4]
                    and (select array_agg(heat_anchor_ms order by athlete_no) from race_event_schedule(race_test.id('ev_free'))) = array[60000, 660000]::bigint[],
  'schedule: empty heats 2 and 3 are skipped but the last heat is still labelled 4 (anchor 0:11:00 = 0:01:00 + 10:00 gap)');
select race_test.anon();
select race_test.ok((select heat_number = 1 and heat_start_at is null and checkin_closes_at is null from race_get_registration(race_test.tk('n1'))),
  'athlete: heat number visible, start time hidden until heats are locked');
select race_test.login('bm_a');
select race_lock_heats(race_test.id('ev_free'));
select race_test.anon();
select race_test.ok((select heat_number = 1 and heat_start_at = timestamptz '2026-11-20 07:01:00+00' and checkin_closes_at = timestamptz '2026-11-20 06:46:00+00'
                     from race_get_registration(race_test.tk('n1'))),
  'athlete: after lock — heat 1 starts 07:01:00 (planned 07:00 + 0:01:00), check-in closes 06:46:00 (−15:00)');
select race_test.ok((select heat_number = 4 and heat_start_at = timestamptz '2026-11-20 07:11:00+00' and checkin_closes_at = timestamptz '2026-11-20 06:56:00+00'
                     from race_get_registration(race_test.tk('n5'))),
  'athlete: heat 4 (second heat that actually runs) starts 07:11:00');
select race_test.throws($$select * from race_test.reg(race_test.id('ev_free'), 'After Lock', '01000000020', 'male', '1995-01-01', 'MEN')$$,
  'RACE_REGISTRATION_CLOSED', 'lock: public registration closed once heats are locked');
select race_test.login('rec');
select race_test.throws($$select * from race_staff_register_athlete(race_test.id('ev_free'), 'After Lock Staff', '01000000021', null, 'male', '1995-01-01', 'MEN', null, true,
                          '{"name":"W","phone":"01011112222"}')$$, 'RACE_HEATS_LOCKED', 'lock: staff registration refused after heats are locked');

-- Public event page ------------------------------------------------------------------------------------------------
select race_test.anon();
select race_test.ok((select event_id = race_test.id('ev_paid') and name = 'THE NINTH' and registration_open and registration_fee = 750 and currency = 'EGP'
                            and instructions like 'Arrive 30 minutes%' and not heats_locked
                     from race_get_public_event('reg-paid-2026')), 'public event: anon reads a published event by slug (fee, currency, instructions)');
select race_test.ok((select status = 'HEATS_LOCKED' and not registration_open and heats_locked and planned_start_at = timestamptz '2026-11-20 07:00:00+00'
                     from race_get_public_event('reg-free-2026')), 'public event: a locked event reports registration closed');
select race_test.eq(race_test.count($$select 1 from race_get_public_event('the-ninth-alex-2026')$$), 0::bigint, 'public event: a DRAFT event is invisible to anon');
select race_test.eq(race_test.count($$select 1 from race_get_public_event('no-such-event')$$), 0::bigint, 'public event: unknown slug → nothing');
select race_test.login('bm_b');
select race_test.eq(race_test.count($$select 1 from race_get_public_event('the-ninth-alex-2026')$$), 1::bigint, 'public event: the event''s own manager sees their DRAFT');
select race_test.login('nobody');
select race_test.eq(race_test.count($$select 1 from race_get_public_event('the-ninth-alex-2026')$$), 0::bigint, 'public event: a stranger does not see someone else''s DRAFT');
reset role;

-- Deactivated staff / RPC exposure ---------------------------------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', race_test.id('super')::text, false);
update profiles set is_active = false where id = race_test.id('rec');
select race_test.login('rec');
select race_test.throws($$select race_confirm_payment(race_test.rid('p6'), 'CASH')$$, 'RACE_FORBIDDEN', 'deactivated: reception cannot confirm payments');
select race_test.throws($$select * from race_list_registrations(race_test.id('ev_paid'))$$, 'RACE_FORBIDDEN', 'deactivated: reception cannot list athletes');
reset role;
select set_config('request.jwt.claim.sub', race_test.id('super')::text, false);
update profiles set is_active = true where id = race_test.id('rec');

-- Staff RPCs: anon has no EXECUTE — and the body guards refuse on their own if it were re-granted.
select race_test.ok(not exists (
  select 1 from unnest(array['race_create_event(uuid,text,date,text,text,timestamptz)', 'race_set_event_status(uuid,race_event_status,text)',
    'race_lock_heats(uuid)', 'race_move_athlete_heat(uuid,uuid,text)', 'race_confirm_payment(uuid,race_payment_method,numeric,text,text)',
    'race_waive_payment(uuid,text)', 'race_refund_payment(uuid,text)', 'race_cancel_registration(uuid,text)', 'race_list_registrations(uuid,text,integer)',
    'race_staff_register_athlete(uuid,text,text,text,gender,date,race_category_code,race_pushup_style,boolean,jsonb)']) f
  where has_function_privilege('anon', f, 'EXECUTE')), 'exposure: anon has no EXECUTE on any of the 10 staff/admin race RPCs');
select race_test.ok(has_function_privilege('anon', 'race_register_athlete(uuid,text,text,text,gender,date,race_category_code,race_pushup_style,boolean,jsonb)', 'EXECUTE')
                    and has_function_privilege('anon', 'race_get_registration(text)', 'EXECUTE')
                    and has_function_privilege('anon', 'race_update_pushup_style(text,race_pushup_style)', 'EXECUTE'),
  'exposure: the 3 public athlete RPCs stay anon-callable');
select race_test.ok(not has_function_privilege('anon', 'race_register_core(uuid,text,text,text,gender,date,race_category_code,race_pushup_style,boolean,jsonb,race_event_status[],boolean)', 'EXECUTE')
                    and not has_function_privilege('authenticated', 'race_register_core(uuid,text,text,text,gender,date,race_category_code,race_pushup_style,boolean,jsonb,race_event_status[],boolean)', 'EXECUTE')
                    and not has_function_privilege('authenticated', 'race_planned_heat_starts(uuid)', 'EXECUTE'),
  'exposure: internal core/helpers are not API surface');

grant execute on function race_create_event(uuid, text, date, text, text, timestamptz), race_set_event_status(uuid, race_event_status, text),
  race_lock_heats(uuid), race_move_athlete_heat(uuid, uuid, text), race_confirm_payment(uuid, race_payment_method, numeric, text, text),
  race_waive_payment(uuid, text), race_refund_payment(uuid, text), race_cancel_registration(uuid, text), race_list_registrations(uuid, text, int),
  race_staff_register_athlete(uuid, text, text, text, gender, date, race_category_code, race_pushup_style, boolean, jsonb) to anon;
select race_test.anon();
select race_test.throws($$select race_create_event(race_test.id('branch_a'), 'hack', current_date)$$, 'RACE_FORBIDDEN', 'body guard [anon]: race_create_event');
select race_test.throws($$select race_set_event_status(race_test.id('ev_paid'), 'REGISTRATION_CLOSED')$$, 'RACE_FORBIDDEN', 'body guard [anon]: race_set_event_status');
select race_test.throws($$select race_lock_heats(race_test.id('ev_paid'))$$, 'RACE_FORBIDDEN', 'body guard [anon]: race_lock_heats');
select race_test.throws($$select race_move_athlete_heat(race_test.rid('p6'), race_test.id('h1'), 'x')$$, 'RACE_FORBIDDEN', 'body guard [anon]: race_move_athlete_heat');
select race_test.throws($$select race_confirm_payment(race_test.rid('p6'), 'CASH')$$, 'RACE_FORBIDDEN', 'body guard [anon]: race_confirm_payment');
select race_test.throws($$select race_waive_payment(race_test.rid('p6'), 'x')$$, 'RACE_FORBIDDEN', 'body guard [anon]: race_waive_payment');
select race_test.throws($$select race_refund_payment(race_test.id('pay2'), 'x')$$, 'RACE_FORBIDDEN', 'body guard [anon]: race_refund_payment');
select race_test.throws($$select race_cancel_registration(race_test.rid('p6'), 'x')$$, 'RACE_FORBIDDEN', 'body guard [anon]: race_cancel_registration');
select race_test.throws($$select * from race_list_registrations(race_test.id('ev_paid'))$$, 'RACE_FORBIDDEN', 'body guard [anon]: race_list_registrations');
select race_test.throws($$select * from race_staff_register_athlete(race_test.id('ev_paid'), 'Anon Staff', '01000000030', null, 'male', '1995-01-01', 'MEN', null, true,
                          '{"name":"W","phone":"01011112222"}')$$, 'RACE_FORBIDDEN', 'body guard [anon]: race_staff_register_athlete');
reset role;
revoke execute on function race_create_event(uuid, text, date, text, text, timestamptz), race_set_event_status(uuid, race_event_status, text),
  race_lock_heats(uuid), race_move_athlete_heat(uuid, uuid, text), race_confirm_payment(uuid, race_payment_method, numeric, text, text),
  race_waive_payment(uuid, text), race_refund_payment(uuid, text), race_cancel_registration(uuid, text), race_list_registrations(uuid, text, int),
  race_staff_register_athlete(uuid, text, text, text, gender, date, race_category_code, race_pushup_style, boolean, jsonb) from anon;
select race_test.ok(not has_function_privilege('anon', 'race_confirm_payment(uuid,race_payment_method,numeric,text,text)', 'EXECUTE'), 'exposure: anon EXECUTE revoked again after the body-guard check');
