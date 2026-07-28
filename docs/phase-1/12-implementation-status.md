# 12. Implementation Status

Maintained continuously as code lands, per the requirement to generate technical documentation *while* coding, not after. Update this table in the same PR as any code change it describes — a stale status here is treated the same as a stale README (see [Coding Standards §11.7](11-coding-standards.md#117-documentation)).

## What's Implemented and Tested Right Now

| Package / App | Status | Tests |
|---|---|---|
| `packages/shared-kernel` | ✅ Implemented | 6 passing |
| `packages/i18n` | ✅ Implemented — full en/ar coverage for every shipped screen | 3 passing (key-parity + locale resolution) |
| `packages/database-types` | ✅ Implemented (hand-authored placeholder — see file header for the `pnpm db:types` replacement note) | — |
| `packages/supabase-client` | ✅ Implemented | — |
| `packages/ui` — `tokens/` | ✅ Implemented | — |
| `packages/ui` — `native/` | ✅ Implemented — `Text`, `Button`, `TextField`, `Card`, `ScreenContainer`, `ProgressDots`, `OptionCard`, `Divider`, `IconButton`/`BackButton` | — (presentational; exercised via the mobile app's bundle-level smoke test, see below) |
| `packages/ui` — `web/` | 📋 Not started | — |
| `packages/config` | ✅ Implemented | — |
| **`packages/identity`** | ✅ Implemented — the reference bounded context, now covering registration, login, forgot-password, onboarding (name/goal/experience/body-metrics), and role assignment | **41 passing** (domain, application, and infrastructure-mapping tests, all using in-memory fakes — zero database) |
| **`packages/training`** | 🟡 Partially prepared — see [§12.2](#122-9th-round-timer-architecture-prep) | 5 passing (`RoundPlan` value object) |
| `packages/nutrition`, `packages/tracking`, `packages/billing`, `packages/notifications` | 📋 Skeleton only | — |
| `packages/ai` | 📋 Skeleton only (Phase 3) | — |
| **`apps/mobile`** | ✅ 16 real screens shipped — see [§12.1](#121-mobile-screens-shipped) | Typechecks + lints clean; verified with a real `expo export` bundle (see below) |
| `apps/web` | 📋 Not started — zero `.tsx` files | — |
| `supabase/functions/*` | 📋 Contract documented in each function's README; zero `index.ts` implementations | — |

**Total: 53 automated tests, all passing** (`pnpm test` via Turborepo). **9 typecheck targets, all passing** (`pnpm typecheck`). **Lint clean across the entire repository** (`pnpm lint`), including type-aware rules (`@typescript-eslint/no-floating-promises`) via typescript-eslint's Project Service.

## 12.1 Mobile Screens Shipped

| Screen | Route |
|---|---|
| Language selection (en/ar) | `app/(auth)/language.tsx` |
| Welcome carousel (3 animated slides) | `app/(auth)/welcome.tsx` |
| Sign up | `app/(auth)/sign-up.tsx` |
| Log in | `app/(auth)/log-in.tsx` |
| Forgot password | `app/(auth)/forgot-password.tsx` |
| Onboarding — Profile setup (name) | `app/(auth)/onboarding/profile.tsx` |
| Onboarding — Fitness goal | `app/(auth)/onboarding/goal.tsx` |
| Onboarding — Training experience | `app/(auth)/onboarding/experience.tsx` |
| Onboarding — Body metrics (gender/age/height/weight) | `app/(auth)/onboarding/body-metrics.tsx` |
| Dashboard Home | `app/(tabs)/index.tsx` |
| Train / Nutrition / Progress (honest "coming soon" placeholders) | `app/(tabs)/{train,nutrition,progress}.tsx` |
| Profile (working sign-out; settings not built yet) | `app/(tabs)/profile.tsx` |

Root routing gate (`app/index.tsx`) redirects based on locale/session/onboarding state; `app/_layout.tsx` bootstraps providers and holds the splash screen until auth state resolves.

## 12.2 9th Round Timer — Architecture Prep

Per explicit instruction, the timer itself is **not implemented** — only prepared:

- `packages/training/domain/round-plan.ts` — a validated value object for a round-based workout's shape (rounds/work-seconds/rest-seconds), tested (5 tests). Not a timer: no notion of "currently running."
- `packages/training/domain/timer-phase.ts` — the discriminated union (`idle`/`work`/`rest`/`complete`) the future timer's state will take. Type declaration only, no reducer/countdown logic.
- **Not yet built**: the `TimerSession` aggregate, `StartWorkoutSessionUseCase`/`CompleteWorkoutSessionUseCase`, the Supabase-backed `WorkoutLogRepository`, the mobile `useWorkoutSessionStore`, and the `TimerRing` design-system primitive. See `packages/training/README.md` for the full planned shape.

## 12.3 Known Gaps / Honest Caveats

- **No live Supabase project exists yet.** Every screen above is verified to *bundle* correctly (`expo export`, both iOS and Android — a real 1415-module Hermes bundle) and to typecheck against a hand-authored `database-types` placeholder matching the migrations exactly. None of it has executed against a real Postgres instance or been visually verified in a running simulator — there is no simulator/display available in this environment. **This is the single biggest thing to verify before treating this slice as done**: run `pnpm --filter @9thround/mobile dev` against a real Expo dev client, on a real or simulated device, with a provisioned Supabase project's credentials in `.env`.
- **RTL manual QA needed**: the welcome carousel's horizontal `ScrollView` + `scrollTo` is a known rough edge for RTL on Android (horizontal scroll direction doesn't always mirror automatically); the language-picker's "restart to apply" flow for `I18nManager.forceRTL` has never been exercised on a device. Both need hands-on verification in Arabic.
- **SecureStore session size**: the Supabase auth session storage adapter (`apps/mobile/src/lib/secure-store-adapter.ts`) doesn't chunk large values; flagged as a follow-up if a JWT with several custom claims ever approaches SecureStore's per-key limit.
- **Google/Apple sign-in**: `expo-apple-authentication` is a declared dependency but no OAuth screen/flow has been built yet — email/password only, so far.
- **Placeholder brand assets**: `apps/mobile/assets/{icon,splash,adaptive-icon,favicon}.png` are solid-color placeholders generated for the build pipeline to have valid files, not real designed assets.

## 12.4 Next Slice (proposed)

1. Provision a real (free-tier) Supabase project for `development`; apply the migrations; run `pnpm db:types` for real; replace the hand-authored `packages/database-types`.
2. Run the app in a real Expo dev client and visually verify every screen in both English and Arabic, both themes' contrast, and the RTL caveats above.
3. Build out the `training` context for real (Program/Workout/Exercise entities, the `TimerSession` aggregate, and the actual 9-Round Timer UI) — the natural next feature given Dashboard Home already has a "your first program is on its way" placeholder waiting for it.
