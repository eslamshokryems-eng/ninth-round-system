-- League role management: the account directory lookup, appointing / removing league administrators, and every way it can be abused. Throw-away database only.
reset role;
select race_test.make_user('rm_creator', 'C');       -- may create events: becomes LEAGUE_ADMIN of the season it creates (one of the two)
select race_test.make_user('rm_owner1', '');         -- candidate administrators (confirmed, active)
select race_test.make_user('rm_owner2', '');
select race_test.make_user('rm_unconfirmed', '');
select race_test.make_user('rm_inactive', '');
select race_test.make_user('rm_plain', '');
select race_test.make_user('rm_judge', '');
update auth.users set email_confirmed_at = null where email = 'rm_unconfirmed@race.test';
update race_profiles set is_active = false where id = race_test.id('rm_inactive');
select race_test.login('rm_creator');
select race_test.put('rm_s', race_league_create_season('roles-season', 'Roles', date '2026-11-02', date '2026-12-27'));

-- ---- the directory lookup: Super Admin only, exact match, audited without the address --------------------------------------------------------------
select race_test.anon();
select race_test.throws($$select race_league_find_account('rm_owner1@race.test')$$, 'permission denied', 'lookup: anon cannot look up accounts');
select race_test.login('rm_plain');
select race_test.throws($$select race_league_find_account('rm_owner1@race.test')$$, 'LEAGUE_FORBIDDEN', 'lookup: a plain account cannot look up accounts');
select race_test.login('rm_creator');
select race_test.throws($$select race_league_find_account('rm_owner1@race.test')$$, 'LEAGUE_FORBIDDEN', 'lookup: a league administrator (not Super Admin) cannot look up accounts');
select race_test.login('super');
select race_test.throws($$select race_league_find_account('not an address')$$, 'LEAGUE_INVALID', 'lookup: a malformed address is refused');
select race_test.eq((race_league_find_account('%@race.test') ->> 'found'), 'false', 'lookup: exact match only — a wildcard finds nothing');
select race_test.eq((race_league_find_account('nobody@race.test') ->> 'found'), 'false', 'lookup: an unknown address is simply not found');
select race_test.eq((race_league_find_account('  RM_Owner1@Race.Test ') ->> 'id')::uuid, race_test.id('rm_owner1'), 'lookup: case and spaces are ignored; the database returns the account id');
select race_test.eq((race_league_find_account('rm_unconfirmed@race.test') ->> 'emailConfirmed'), 'false', 'lookup: an unconfirmed address is reported as unconfirmed');
select race_test.eq((race_league_find_account('rm_inactive@race.test') ->> 'active'), 'false', 'lookup: a deactivated account is reported as inactive');
select race_test.ok(not (race_league_find_account('rm_owner1@race.test') ? 'password' or race_league_find_account('rm_owner1@race.test') ? 'encrypted_password'), 'lookup: nothing sensitive is returned (id, e-mail, name, flags only)');
reset role;
select race_test.ok(exists (select 1 from race_audit_log where action = 'league.account.lookup') and not exists (select 1 from race_audit_log where action = 'league.account.lookup' and metadata::text like '%@%'), 'lookup: audited, and the audit record never contains an e-mail address');

-- ---- appointing: who may, and every bad request -------------------------------------------------------------------------------------------------------
select race_test.login('rm_plain');
select race_test.throws($$select race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_plain'), 'LEAGUE_ADMIN', true, 'self')$$, 'LEAGUE_FORBIDDEN', 'self-promotion: a plain account cannot make itself an administrator');
select race_test.throws($$select race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_plain'), 'JUDGE', true, 'self')$$, 'LEAGUE_FORBIDDEN', 'self-promotion: ... nor a judge');
select race_test.anon();
select race_test.throws($$select race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_owner1'), 'LEAGUE_ADMIN', true, 'x')$$, 'permission denied', 'anon cannot appoint');
select race_test.login('rm_creator');
select race_test.throws($$select race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_creator'), 'LEAGUE_ADMIN', true, 'again')$$, 'LEAGUE_FORBIDDEN', 'a league administrator (not Super Admin) cannot appoint administrators — not even themselves');
select race_test.throws($$select race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_owner1'), 'LEAGUE_ADMIN', true, 'x')$$, 'LEAGUE_FORBIDDEN', '... nor another account');
select race_test.login('super');
select race_test.throws($$select race_league_set_staff(race_test.id('rm_s'), gen_random_uuid(), 'LEAGUE_ADMIN', true, 'x')$$, 'LEAGUE_NOT_FOUND', 'a missing account is refused');
select race_test.throws($$select race_league_set_staff(race_test.id('rm_s'), null, 'LEAGUE_ADMIN', true, 'x')$$, 'LEAGUE_INVALID', 'no account chosen');
select race_test.throws($$select race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_owner1'), 'OWNER', true, 'x')$$, 'unknown role', 'an invented role is refused');
select race_test.throws($$select race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_owner1'), null, true, 'x')$$, 'unknown role', 'a missing role is refused');
select race_test.throws($$select race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_owner1'), 'LEAGUE_ADMIN', true, '')$$, 'LEAGUE_REASON_REQUIRED', 'a reason is mandatory');
select race_test.throws($$select race_league_set_staff(gen_random_uuid(), race_test.id('rm_owner1'), 'LEAGUE_ADMIN', true, 'x')$$, 'LEAGUE_NOT_FOUND', 'a missing season is refused');
select race_test.throws($$select race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_unconfirmed'), 'LEAGUE_ADMIN', true, 'x')$$, 'not confirmed', 'an administrator must have a confirmed e-mail address');
select race_test.throws($$select race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_inactive'), 'LEAGUE_ADMIN', true, 'x')$$, 'deactivated', 'a deactivated account cannot be appointed');
-- not enough administrators yet: the season cannot go live
select race_test.login('rm_creator');
select race_league_set_season_status(race_test.id('rm_s'), 'scheduled');
select race_test.throws($$select race_league_set_season_status(race_test.id('rm_s'), 'active')$$, 'two independent league administrators', 'insufficient administrators: one is not enough to activate');
select race_test.throws($$select race_league_set_published(race_test.id('rm_s'), true, 'preview')$$, 'two independent league administrators', 'insufficient administrators: ... nor to publish');
-- the real appointment
select race_test.login('super');
select race_test.eq((race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_owner1'), 'LEAGUE_ADMIN', true, 'second independent administrator, approved for the pilot') ->> 'changed'), 'true', 'a Super Admin appoints a league administrator by account id');
reset role;
select race_test.eq((select count(*) from race_audit_log where action = 'league.staff.appoint' and metadata ->> 'target_profile_id' = race_test.id('rm_owner1')::text
   and metadata ->> 'reason' = 'second independent administrator, approved for the pilot' and metadata ->> 'season_id' = race_test.id('rm_s')::text and actor_id = race_test.id('super'))::int, 1, 'audit: actor, target, role, reason and season are recorded for the appointment');
select race_test.login('super');
select race_test.eq((race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_owner1'), 'LEAGUE_ADMIN', true, 'duplicate click') ->> 'changed'), 'false', 'duplicate request: appointing the same administrator twice changes nothing');
reset role;
select race_test.eq((select count(*) from race_audit_log where action = 'league.staff.appoint' and metadata ->> 'target_profile_id' = race_test.id('rm_owner1')::text)::int, 1, 'duplicate request: ... and writes no second audit entry');
select race_test.eq((select count(*) from race_league_staff where season_id = race_test.id('rm_s') and profile_id = race_test.id('rm_owner1') and role = 'LEAGUE_ADMIN')::int, 1, 'duplicate request: ... and no second staff row');

-- ---- two administrators exist: the season goes live ---------------------------------------------------------------------------------------------------
select race_test.login('rm_creator');
select race_league_set_season_status(race_test.id('rm_s'), 'active');
select race_test.ok(true, 'two distinct administrators: the season can be activated');
-- judges and reviewers: a season administrator manages them, nobody else
select race_test.login('rm_judge');
select race_test.throws($$select race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_judge'), 'REVIEWER', true, 'self')$$, 'LEAGUE_FORBIDDEN', 'self-promotion: a judge cannot grant themselves another role');
select race_test.login('rm_creator');
select race_test.eq((race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_judge'), 'JUDGE', true, 'roster for week 1') ->> 'changed'), 'true', 'a season administrator appoints a judge');
select race_test.login('rm_judge');
select race_test.ok(jsonb_array_length(race_league_my_seasons()) = 1, 'the new judge now sees the season');
select race_test.throws($$select race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_plain'), 'JUDGE', true, 'x')$$, 'LEAGUE_FORBIDDEN', 'a judge cannot appoint judges');

-- ---- removing: a live season never drops below two ----------------------------------------------------------------------------------------------------
select race_test.login('rm_creator');
select race_test.throws($$select race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_owner1'), 'LEAGUE_ADMIN', false, 'x')$$, 'LEAGUE_FORBIDDEN', 'removal: a league administrator cannot remove an administrator');
select race_test.login('super');
select race_test.throws($$select race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_owner1'), 'LEAGUE_ADMIN', false, 'rotation')$$, 'two independent league administrators', 'removal: the last required administrator cannot be removed from a live season');
reset role;
select race_test.eq((select active from race_league_staff where season_id = race_test.id('rm_s') and profile_id = race_test.id('rm_owner1') and role = 'LEAGUE_ADMIN'), true, 'removal: ... and the refused removal left the row untouched');
select race_test.login('super');
select race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_owner2'), 'LEAGUE_ADMIN', true, 'third administrator for the handover');
select race_test.eq((race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_owner1'), 'LEAGUE_ADMIN', false, 'handover complete') ->> 'administrators'), '2', 'removal: with a third administrator in place, one can be removed (two remain)');
select race_test.eq((race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_owner1'), 'LEAGUE_ADMIN', false, 'again') ->> 'changed'), 'false', 'removal: removing twice is a no-op');
select race_test.eq((race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_plain'), 'LEAGUE_ADMIN', false, 'never was') ->> 'changed'), 'false', 'removal: removing someone who never held the role is a no-op');
reset role;
select race_test.eq((select count(*) from race_audit_log where action = 'league.staff.remove' and metadata ->> 'season_id' = race_test.id('rm_s')::text)::int, 1, 'audit: exactly one removal entry (with reason)');
select race_test.login('super');
select race_league_set_staff(race_test.id('rm_s'), race_test.id('rm_owner1'), 'LEAGUE_ADMIN', true, 're-appointed');
select race_test.ok(true, 're-appointment after removal works');

-- ---- what the screens read ----------------------------------------------------------------------------------------------------------------------------
select race_test.eq((race_league_admin_overview(race_test.id('rm_s')) ->> 'isSuperAdmin'), 'true', 'overview: a Super Admin is told so (the screen shows the controls)');
select race_test.login('rm_creator');
select race_test.eq((race_league_admin_overview(race_test.id('rm_s')) ->> 'isSuperAdmin'), 'false', 'overview: a league administrator is not');
select race_test.ok(position('rm_owner1@race.test' in race_league_admin_overview(race_test.id('rm_s'))::text) = 0, 'overview: staff e-mail addresses are masked, never listed in full');
select race_test.ok(exists (select 1 from jsonb_array_elements(race_league_admin_overview(race_test.id('rm_s')) -> 'staff') x where x ->> 'emailHint' = 'r***@race.test' and x ->> 'fullName' = 'Rm Owner1'), 'overview: staff rows carry a name and a masked hint');
select race_test.login('rm_judge');
select race_test.ok((race_league_admin_overview(race_test.id('rm_s')) -> 'staff') = 'null'::jsonb or race_league_admin_overview(race_test.id('rm_s')) -> 'staff' is null, 'overview: a judge does not receive the staff list');
