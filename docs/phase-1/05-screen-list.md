# 5. Screen List (Phase 1)

Every screen Phase 1 ships, grouped by app. Screens for Phase 2+ features (community, challenges, chat, AI Coach, full trainer/admin dashboards) are listed in [`docs/06-ui-flow-and-wireframes.md §6.3–6.5`](../06-ui-flow-and-wireframes.md) but excluded here.

## 5.1 Mobile App (`apps/mobile`)

| # | Screen | Route (Expo Router) | Auth required | Primary data |
|---|---|---|---|---|
| 1 | Splash | `app/index.tsx` | no | session check → redirect |
| 1a | Language picker (en/ar) | `app/(auth)/language.tsx` | no | local UI state only — see [Internationalization §11.6](../11-internationalization.md#116-locale-selection--persistence) |
| 2 | Sign up | `app/(auth)/sign-up.tsx` | no | — |
| 3 | Log in | `app/(auth)/log-in.tsx` | no | — |
| 4 | Onboarding — Goal | `app/(auth)/onboarding/goal.tsx` | yes (new user) | `profiles.goal` |
| 5 | Onboarding — Experience | `app/(auth)/onboarding/experience.tsx` | yes | `profiles.experience_level` |
| 6 | Onboarding — Equipment | `app/(auth)/onboarding/equipment.tsx` | yes | drives program filter, not persisted as its own column (folded into program matching) |
| 7 | Onboarding — Body metrics | `app/(auth)/onboarding/metrics.tsx` | yes | `weight_logs`, `body_composition_logs` (first entries) |
| 8 | Onboarding — Plan match | `app/(auth)/onboarding/plan.tsx` | yes | `subscription_plans` |
| 9 | Home Dashboard | `app/(tabs)/index.tsx` | yes | `user_programs`, `habit_logs`, `water_logs`, streak |
| 10 | Train — Program/Exercise browse | `app/(tabs)/train.tsx` | yes | `programs`, `exercises` |
| 11 | Program detail | `app/program/[id].tsx` | yes | `programs`, `program_weeks`, `workouts` |
| 12 | Workout Player (9-Round + Rest Timer) | `app/workout/[id]/index.tsx` | yes | `workouts`, `workout_exercises`, `exercises` |
| 13 | Workout summary / set logging | `app/workout/[id]/summary.tsx` | yes | `workout_logs`, `exercise_set_logs` |
| 14 | Nutrition | `app/(tabs)/nutrition.tsx` | yes | `nutrition_plans`, `meals`, `meal_food_items` |
| 15 | Food search / quick add | `app/nutrition/add-food.tsx` | yes | `food_items` |
| 16 | Progress | `app/(tabs)/progress.tsx` | yes | `weight_logs`, `body_composition_logs`, `progress_photos` |
| 17 | Add progress photo | `app/progress/add-photo.tsx` | yes | `progress_photos` |
| 18 | Habits | `app/habits/index.tsx` | yes | `habits`, `habit_logs` |
| 19 | Profile / Settings | `app/(tabs)/profile.tsx` | yes | `profiles`, `subscriptions` |
| 20 | Manage subscription | `app/profile/subscription.tsx` | yes | `subscriptions` → `create-billing-portal-session` |
| 21 | Notifications center | `app/profile/notifications.tsx` | yes | `notifications` |

22 screens (including the language picker).

## 5.2 Admin Web (`apps/web` — `(admin)` route group)

Phase 1 ships only the admin surface needed to *operate* the MVP (per [`docs/09-development-phases.md`](../09-development-phases.md)); the full admin dashboard (coupons, analytics, revenue, support, reports) is Phase 4.

| # | Screen | Route | Primary data |
|---|---|---|---|
| 1 | Admin login | `app/(auth)/log-in.tsx` (web) | — |
| 2 | Users list | `app/(admin)/users/page.tsx` | `profiles` |
| 3 | User detail | `app/(admin)/users/[id]/page.tsx` | `profiles`, `subscriptions`, `workout_logs` (read-only overview) |
| 4 | Programs list | `app/(admin)/programs/page.tsx` | `programs` |
| 5 | Program editor | `app/(admin)/programs/[id]/page.tsx` | `programs`, `program_weeks`, `workouts`, `workout_exercises` |
| 6 | Exercise library | `app/(admin)/programs/exercises/page.tsx` | `exercises`, `exercise_categories` |
| 7 | Exercise editor + video upload | `app/(admin)/programs/exercises/[id]/page.tsx` | `exercises` → `video-upload-url` |
| 8 | Nutrition — food database | `app/(admin)/nutrition/page.tsx` | `food_items` |
| 9 | Subscription plan catalog | `app/(admin)/subscriptions/page.tsx` | `subscription_plans` |

9 screens.

## 5.3 Total Phase 1 Screen Count

**31 screens** (22 mobile + 9 admin web). Trainer web dashboard ships zero screens in Phase 1 — trainer-assigned content (if any Elite clients exist before Phase 4) is operated by admin directly against the same tables.

Next: [Navigation Flow →](06-navigation-flow.md)
