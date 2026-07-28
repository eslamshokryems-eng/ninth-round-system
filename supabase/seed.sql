-- Local/dev seed data only — never run against staging or production.
-- Populates just enough reference data for the app to render meaningfully
-- during development: subscription plan catalog + exercise categories.

insert into subscription_plans (name, tier, billing_interval, price_cents, stripe_price_id, features, is_active)
values
  ('Free', 'free', 'monthly', 0, 'price_dev_free', '{"programs": "limited", "ai_coach": false}', true),
  ('Plus Monthly', 'plus', 'monthly', 1999, 'price_dev_plus_monthly', '{"programs": "full", "ai_coach": true}', true),
  ('Plus Annual', 'plus', 'annual', 19999, 'price_dev_plus_annual', '{"programs": "full", "ai_coach": true}', true),
  ('Elite Monthly', 'elite', 'monthly', 4999, 'price_dev_elite_monthly', '{"programs": "full", "ai_coach": true, "trainer": true}', true),
  ('Elite Annual', 'elite', 'annual', 49999, 'price_dev_elite_annual', '{"programs": "full", "ai_coach": true, "trainer": true}', true)
on conflict (stripe_price_id) do nothing;

insert into exercise_categories (name, slug, icon)
values
  ('Boxing Conditioning', 'boxing-conditioning', 'gloves'),
  ('Strength', 'strength', 'dumbbell'),
  ('Core', 'core', 'core'),
  ('Mobility', 'mobility', 'stretch'),
  ('Cardio', 'cardio', 'heart')
on conflict (slug) do nothing;
