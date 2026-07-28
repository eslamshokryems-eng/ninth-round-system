-- Phase 1 — nutrition plans, meals, and the food-item catalog.

create table nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  assigned_by uuid references profiles (id),
  name text not null,
  daily_calorie_target int,
  macro_protein_g int,
  macro_carbs_g int,
  macro_fat_g int,
  start_date date not null default current_date,
  end_date date
);

create index idx_nutrition_plans_profile on nutrition_plans (profile_id);

create table meals (
  id uuid primary key default gen_random_uuid(),
  nutrition_plan_id uuid not null references nutrition_plans (id) on delete cascade,
  name meal_name not null,
  order_index int not null default 0
);

create table food_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  calories_per_100g numeric(6, 2) not null,
  protein_per_100g numeric(6, 2) not null default 0,
  carbs_per_100g numeric(6, 2) not null default 0,
  fat_per_100g numeric(6, 2) not null default 0,
  is_verified boolean not null default false,
  created_by uuid references profiles (id)
);

create index idx_food_items_name_trgm on food_items using gin (name gin_trgm_ops);

create table meal_food_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references meals (id) on delete cascade,
  food_item_id uuid not null references food_items (id),
  quantity_grams numeric(6, 2) not null
);

create index idx_meal_food_items_meal on meal_food_items (meal_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table nutrition_plans enable row level security;
alter table meals enable row level security;
alter table food_items enable row level security;
alter table meal_food_items enable row level security;

create policy "own plans" on nutrition_plans for select using (profile_id = auth.uid());
create policy "trainer reads assigned clients' plans" on nutrition_plans for select
  using (exists (
    select 1 from trainer_clients tc
    where tc.client_id = nutrition_plans.profile_id and tc.trainer_id = auth.uid() and tc.status = 'active'
  ));
create policy "trainers/admins manage plans" on nutrition_plans for all
  using ((auth.jwt() ->> 'role') in ('trainer', 'admin'));

create policy "read meals of visible plans" on meals for select
  using (exists (
    select 1 from nutrition_plans np
    where np.id = meals.nutrition_plan_id and np.profile_id = auth.uid()
  ));
create policy "trainers/admins manage meals" on meals for all
  using ((auth.jwt() ->> 'role') in ('trainer', 'admin'));

create policy "anyone reads food items" on food_items for select using (true);
create policy "authenticated users add unverified food items" on food_items for insert
  with check (auth.uid() is not null);
create policy "admins manage food items" on food_items for update
  using ((auth.jwt() ->> 'role') = 'admin');

create policy "read own meal_food_items" on meal_food_items for select
  using (exists (
    select 1 from meals m join nutrition_plans np on np.id = m.nutrition_plan_id
    where m.id = meal_food_items.meal_id and np.profile_id = auth.uid()
  ));
create policy "trainers/admins manage meal_food_items" on meal_food_items for all
  using ((auth.jwt() ->> 'role') in ('trainer', 'admin'));
