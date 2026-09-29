-- THE NINTH's own accounts and the role/permission matrix. Everything here is about THIS project's race_profiles + race_staff;
-- nothing consults any other system.
reset role;

-- New accounts start with NO authority -----------------------------------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000aa01', 'newbie@race.test', '{"full_name":"New Person"}');
select race_test.ok((select full_name = 'New Person' and email = 'newbie@race.test' and is_active and not is_super_admin and not can_create_events
                     from race_profiles where id = '00000000-0000-0000-0000-00000000aa01'),
  'accounts: a new Auth user gets a race profile with NO authority (not super admin, cannot create events)');
select race_test.ok(not exists (select 1 from race_staff where profile_id = '00000000-0000-0000-0000-00000000aa01'), 'accounts: … and no event role');

-- The role matrix, evaluated by the database's own predicates for event_a ------------------------------------------------------------------
create function race_test.matrix_row(p_key text) returns text language plpgsql as $$
declare v text;
begin
  if p_key = 'anon' then perform race_test.anon(); else perform race_test.login(p_key); end if;
  v := concat_ws(' ',
    case when race_is_super_admin() then 'T' else 'F' end,
    case when race_can_create_events() then 'T' else 'F' end,
    case when race_is_manager(race_test.id('event_a')) then 'T' else 'F' end,
    case when race_is_master(race_test.id('event_a')) then 'T' else 'F' end,
    case when race_is_control(race_test.id('event_a')) then 'T' else 'F' end,
    case when race_is_ops(race_test.id('event_a')) then 'T' else 'F' end,
    case when race_is_event_staff(race_test.id('event_a')) then 'T' else 'F' end);
  perform set_config('role', 'postgres', false);
  return v;
end $$;
--                                                          super create manager master control ops staff
select race_test.eq(race_test.matrix_row('super'),         'T T T T T T T', 'matrix: Super Admin — everything, everywhere');
select race_test.eq(race_test.matrix_row('bm_a'),          'F T T F T T T', 'matrix: Event Manager (of this event) — manages, controls, front-of-house; is NOT Master Control; may create events (granted)');
select race_test.eq(race_test.matrix_row('master'),        'F F F T T T T', 'matrix: Master Control — controls the race and corrects check-ins; does not manage the event');
select race_test.eq(race_test.matrix_row('rec'),           'F F F F F T T', 'matrix: Reception — front-of-house only');
select race_test.eq(race_test.matrix_row('judge1'),        'F F F F F F T', 'matrix: Judge — event staff, nothing else');
select race_test.eq(race_test.matrix_row('screen1'),       'F F F F F F T', 'matrix: Station Screen device — event staff, nothing else');
select race_test.eq(race_test.matrix_row('bm_b'),          'F T F F F F F', 'matrix: another event''s manager has NO authority in this event');
select race_test.eq(race_test.matrix_row('plain_user'),    'F F F F F F F', 'matrix: an account with no role — nothing');
select race_test.eq(race_test.matrix_row('athlete_user'),  'F F F F F F F', 'matrix: an athlete''s account — no administrative access');
select race_test.eq(race_test.matrix_row('anon'),          'F F F F F F F', 'matrix: anonymous — false (never NULL) everywhere');

-- Global flags cannot be self-served ------------------------------------------------------------------------------------------------------
select race_test.login('plain_user');
select race_test.throws($$update race_profiles set is_super_admin = true where id = auth.uid()$$, 'permission denied|race_set_account_flags', 'flags: nobody can make themselves super admin through the API (no column privilege, and a trigger backs it up)');
select race_test.throws($$update race_profiles set can_create_events = true where id = auth.uid()$$, 'permission denied|race_set_account_flags', 'flags: nor grant themselves event creation');
select race_test.throws($$update race_profiles set is_active = true, email = 'x@y.z' where id = auth.uid()$$, 'permission denied|race_set_account_flags', 'flags: nor rewrite their email or active flag');
select race_test.eq(race_test.affected($$update race_profiles set full_name = 'Renamed', phone = '0100' where id = auth.uid()$$), 1::bigint, 'profile: a user can edit their own name and phone');
select race_test.eq(race_test.affected($$update race_profiles set full_name = 'Hacked' where id = race_test.id('rec')$$), 0::bigint, 'profile: … but not anyone else''s');
select race_test.throws($$insert into race_profiles (id) values (gen_random_uuid())$$, 'permission denied', 'profile: no client can insert profiles');
select race_test.throws($$delete from race_profiles where id = auth.uid()$$, 'permission denied', 'profile: no client can delete profiles');
select race_test.eq(race_test.count($$select 1 from race_profiles$$), 1::bigint, 'profile: an ordinary user sees only their own profile');
select race_test.throws($$select race_set_account_flags(auth.uid(), true)$$, 'RACE_FORBIDDEN', 'flags: the RPC refuses non-super-admins');
select race_test.login('bm_a');
select race_test.throws($$select race_set_account_flags(race_test.id('rec'), null, true)$$, 'RACE_FORBIDDEN', 'flags: an Event Manager cannot grant event creation — Super Admin only');
select race_test.anon();
select race_test.throws($$select race_set_account_flags(race_test.id('rec'), true)$$, 'permission denied', 'flags: anon has no EXECUTE');

select race_test.login('super');
select race_test.ok(race_test.count($$select 1 from race_profiles$$) >= 12, 'profile: a Super Admin reads every profile');
select race_set_account_flags(race_test.id('em2'), null, true);
select race_test.ok((select can_create_events from race_profiles where id = race_test.id('em2')), 'flags: Super Admin grants event creation');
select race_test.ok(exists (select 1 from race_audit_log where action = 'race.account.flags' and target_id = race_test.id('em2') and (after ->> 'can_create_events')::boolean), 'flags: the change is in THE NINTH''s own audit log');
select race_test.throws($$select race_set_account_flags(race_test.id('super'), false)$$, 'cannot remove your own', 'flags: a Super Admin cannot demote themselves (no accidental lock-out)');
select race_test.throws($$select race_set_account_flags(race_test.id('super'), null, null, false)$$, 'cannot remove your own', 'flags: … nor deactivate themselves');
select race_test.throws($$select race_set_account_flags(gen_random_uuid(), true)$$, 'RACE_NOT_FOUND', 'flags: unknown account');
select race_set_account_flags(race_test.id('em2'), null, false);
reset role;

-- Roles are per event: the same account can hold different roles in different events, none of which leak ---------------------------------
select race_test.login('bm_b');
select race_test.eq(race_test.count($$select 1 from race_staff where event_id = race_test.id('event_a')$$), 0::bigint, 'isolation: another event''s manager cannot even see this event''s staff list');
select race_test.eq(race_test.count($$select 1 from race_athletes$$), 0::bigint, 'isolation: nor its athletes');
reset role;

-- Independence: the audit trail of every action above lives here -----------------------------------------------------------------------------
select race_test.ok((select count(*) from race_audit_log where action = 'race.account.flags') >= 1
                    and not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'admin_audit_log'),
  'audit: THE NINTH owns its audit records; no other system''s audit log exists here');
