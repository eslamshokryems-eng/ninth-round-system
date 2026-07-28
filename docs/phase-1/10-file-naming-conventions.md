# 10. File Naming Conventions

## 10.1 Files & Folders

| Kind | Convention | Example |
|---|---|---|
| React component file | `PascalCase.tsx`, filename matches the default export | `TimerRing.tsx` exports `TimerRing` |
| Non-component TS module | `kebab-case.ts` | `query-keys.ts`, `format-duration.ts` |
| Hook | `use-kebab-case.ts`, exported name is `camelCase` starting with `use` | `use-workout-session.ts` exports `useWorkoutSession` |
| Zustand store | `store.ts` inside the owning feature folder | `features/workouts/store.ts` |
| Feature's data-access module | `api.ts` inside the feature folder | `features/nutrition/api.ts` |
| Zod schema module | `kebab-case.ts` named after the domain concept, not "schema" | `packages/schemas/workout.ts`, not `workout-schema.ts` |
| Test file | co-located, same name + `.test.ts(x)` | `TimerRing.test.tsx` next to `TimerRing.tsx` |
| Expo Router route | Expo Router's own conventions — `kebab-case.tsx`, `[param].tsx`, `(group)` | `app/(auth)/log-in.tsx`, `app/workout/[id]/index.tsx` |
| Next.js App Router route | Next.js's own conventions — `page.tsx`, `layout.tsx`, `route.ts` inside a `kebab-case` folder | `app/(admin)/users/[id]/page.tsx` |
| SQL migration | `<timestamp>_<snake_case_description>.sql`, timestamp is chronological, never edited after merge | `20260801000004_training_content.sql` |
| Edge Function folder | `kebab-case` verb-noun, matches its name in the API catalog | `supabase/functions/create-checkout-session/` |

## 10.2 Identifiers

| Kind | Convention | Example |
|---|---|---|
| React component / type / interface | `PascalCase` | `WorkoutPlayerView`, `interface TimerRingProps` |
| Variable / function | `camelCase` | `formatDuration`, `activeWorkoutId` |
| Boolean variable/prop | `is`/`has`/`should` prefix | `isLoading`, `hasActiveSubscription` |
| Constant (module-level, never reassigned, semantically "fixed") | `SCREAMING_SNAKE_CASE` | `MAX_ROUNDS`, `DEFAULT_REST_SECONDS` |
| Zustand store hook | `use<Feature>Store` | `useWorkoutSessionStore` |
| TanStack Query key factory entries | domain-first, see [State Management §8.3](08-state-management.md#83-tanstack-query-key-conventions) | `queryKeys.workouts.today(id)` |
| Database table | `snake_case`, plural | `workout_logs`, `exercise_set_logs` |
| Database column | `snake_case` | `current_period_end` |
| Database enum type | `snake_case`, singular | `subscription_status` |
| Edge Function name | `verb-noun`, `kebab-case` | `create-checkout-session` |
| Zod schema export | `<thing>Schema`, inferred type is `<Thing>` | `createCheckoutSessionInputSchema`, `type CreateCheckoutSessionInput` |

## 10.3 Import Aliases

- `@/*` inside each app resolves to that app's `src/` (configured in `packages/config/tsconfig.mobile.json` and `tsconfig.web.json`) — a feature never writes a `../../../` relative import to reach its own app's shared components.
- Cross-package imports always use the published package name (`@9thround/ui`, `@9thround/domain`, …), never a relative path that reaches into another package's internals — this is what keeps the import-boundary rule in [Component Architecture §7.1](07-component-architecture.md#71-three-layers-enforced-by-import-direction) enforceable by lint rather than convention alone.

## 10.4 Branch & Commit Naming (ties into CI/CD)

- Branches: `phase-<n>/<short-description>` for roadmap work (e.g. `phase-1/workout-player`), `fix/<short-description>` for bug fixes.
- Commits follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`) — enforced by commitlint in CI, detailed in [Coding Standards §11.5](11-coding-standards.md#115-commit--pr-conventions).

Next: [Coding Standards →](11-coding-standards.md)
