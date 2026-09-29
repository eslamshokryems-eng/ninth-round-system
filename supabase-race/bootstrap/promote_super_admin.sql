-- Run ONCE, in THE NINTH project's SQL editor (or psql as the database owner), after creating the first Auth user for the
-- dedicated THE NINTH email account (Supabase dashboard → Authentication → Users → Add user).
--
--   psql "$RACE_DATABASE_URL" -v email="'owner@example.com'" -f supabase-race/bootstrap/promote_super_admin.sql
--
-- Nothing in the repository contains the address or any credential. The database owner may set the flag directly; no API client can.
update race_profiles
   set is_super_admin = true, can_create_events = true, is_active = true
 where lower(email) = lower(:email);

select case when count(*) = 1 then 'OK: ' || max(email) || ' is now a THE NINTH Super Admin'
            else 'NOTHING CHANGED: create the Auth user first (no race_profiles row has that email)' end as result
  from race_profiles where lower(email) = lower(:email) and is_super_admin;
