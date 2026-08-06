-- 9th Round Reception & Membership System — role model realignment.
--
-- The platform is now positioned as a private club management system, not
-- a public consumer fitness app (see docs/phase-1/14-reception-membership.md).
-- The 6-role model becomes 5 roles:
--   admin                -> branch_manager
--   trainer+nutritionist -> coach (merged; a coach's specialisation becomes
--                           a value in staff_profiles.specialties rather
--                           than a distinct role — one fewer axis of
--                           variation for a role that, in this club-based
--                           product, is not meaningfully split in two)
--   client                -> member
-- `super_admin` and `reception` are unchanged in name and meaning.
--
-- Existing rows are migrated first, then the enum labels themselves are
-- renamed via `alter type ... rename value`, which preserves every foreign
-- key, index, and already-applied RLS policy that references the *type*
-- (they do — policies below only reference labels, which this migration
-- also fixes). Postgres cannot drop an enum label, so `nutritionist` stays
-- defined-but-unused on both enums after this migration; that is expected,
-- not a bug — a full type recreation would force rebuilding every
-- dependent policy/default across 6 already-applied migrations for no
-- functional gain over simply not using the label again.

-- 1. Migrate existing data to the role that will end up under the surviving label.
update profiles set role = 'trainer' where role = 'nutritionist';
update staff_profiles set role = 'trainer' where role = 'nutritionist';

-- 2. Rename enum labels.
alter type user_role rename value 'admin' to 'branch_manager';
alter type user_role rename value 'client' to 'member';
alter type user_role rename value 'trainer' to 'coach';

alter type staff_role rename value 'trainer' to 'coach';

-- 3. Update the RLS helper function that hardcoded the old label.
-- is_super_admin() is unchanged (already only checks 'super_admin').
-- is_staff() is unchanged (its role list is a caller-supplied parameter —
-- callers are fixed in step 4 below).
create or replace function is_admin()
returns boolean
language sql stable
as $$
  select auth_role() in ('branch_manager', 'super_admin');
$$;

-- 4. Fix existing policies that hardcoded 'trainer' / 'nutritionist' / 'admin'.
drop policy "trainers insert exercises" on exercises;
create policy "coaches insert exercises" on exercises for insert
  with check (is_staff(array['coach']));

drop policy "trainers insert programs" on programs;
create policy "coaches insert programs" on programs for insert
  with check (is_staff(array['coach']));

drop policy "trainers/admins manage weeks" on program_weeks;
create policy "coaches/admins manage weeks" on program_weeks for all
  using (is_staff(array['coach']));

drop policy "trainers/admins manage workouts" on workouts;
create policy "coaches/admins manage workouts" on workouts for all
  using (is_staff(array['coach']));

drop policy "trainers/admins manage workout_exercises" on workout_exercises;
create policy "coaches/admins manage workout_exercises" on workout_exercises for all
  using (is_staff(array['coach']));

drop policy "nutritionists/admins manage plans" on nutrition_plans;
create policy "coaches/admins manage plans" on nutrition_plans for all
  using (is_staff(array['coach']));

drop policy "nutritionists/admins manage meals" on meals;
create policy "coaches/admins manage meals" on meals for all
  using (is_staff(array['coach']));

drop policy "admins/nutritionists verify food items" on food_items;
create policy "admins/coaches verify food items" on food_items for update
  using (is_staff(array['coach']));

drop policy "nutritionists/admins manage meal_food_items" on meal_food_items;
create policy "coaches/admins manage meal_food_items" on meal_food_items for all
  using (is_staff(array['coach']));

-- reception_member_lookup() referenced the old 'admin' label directly
-- (rather than through is_admin()) — redefine it to match.
create or replace function reception_member_lookup(search_term text default null)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  has_active_subscription boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.full_name,
    p.avatar_url,
    exists (
      select 1 from subscriptions s
      where s.profile_id = p.id and s.status = 'active'
    ) as has_active_subscription
  from profiles p
  where auth_role() in ('reception', 'branch_manager', 'super_admin')
    and (search_term is null or p.full_name ilike '%' || search_term || '%')
  order by p.full_name
  limit 25;
$$;
