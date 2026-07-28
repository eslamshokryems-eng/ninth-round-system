# 3. Folder Structure

> **Superseded by [`docs/13-ddd-architecture.md`](13-ddd-architecture.md).** The `packages/` layout below (one package per *layer*: `domain`, `api-client`, `schemas`, `types`) was replaced by one package per *bounded context* (`packages/identity`, `packages/training`, `packages/nutrition`, …), each internally layered into `domain/`/`application/`/`infrastructure/`, to satisfy the Clean Architecture + DDD and independent-module-scalability requirements. This document is kept for the historical product-architecture record and because the `apps/mobile` and `apps/web` route/feature layout below is still accurate — see `docs/phase-1/01-folder-structure.md` for the current, as-built tree.

## 3.1 Monorepo Layout (original draft — see note above)

Turborepo + pnpm workspaces. One repository, three deployable "apps," shared packages, and the Supabase project definition.

```
9th-round/
├── apps/
│   ├── mobile/                     # Expo React Native app (iOS + Android)
│   │   ├── app/                    # Expo Router — file-based routes
│   │   │   ├── (auth)/             # login, register, onboarding
│   │   │   ├── (tabs)/             # home, train, nutrition, progress, profile
│   │   │   ├── workout/[id]/       # workout player, 9-Round timer screen
│   │   │   └── _layout.tsx
│   │   ├── src/
│   │   │   ├── features/           # one folder per feature, vertical slice
│   │   │   │   ├── auth/
│   │   │   │   ├── workouts/
│   │   │   │   ├── nutrition/
│   │   │   │   ├── tracking/       # water, weight, body-fat, InBody, photos
│   │   │   │   ├── habits/
│   │   │   │   ├── ai-coach/
│   │   │   │   ├── community/
│   │   │   │   ├── challenges/
│   │   │   │   ├── chat/
│   │   │   │   ├── subscription/
│   │   │   │   └── checkin/        # QR check-in
│   │   │   │       ├── components/
│   │   │   │       ├── hooks/
│   │   │   │       ├── api.ts      # calls packages/api-client
│   │   │   │       └── store.ts    # Zustand slice, if needed
│   │   │   ├── components/         # shared, feature-agnostic UI (Button, Card…)
│   │   │   ├── design-system/      # timer ring, glass panels, gold gradients
│   │   │   ├── navigation/
│   │   │   ├── lib/                # notifications, storage, analytics wiring
│   │   │   └── providers/          # QueryClientProvider, AuthProvider, etc.
│   │   ├── assets/
│   │   ├── app.config.ts
│   │   └── eas.json
│   │
│   └── web/                        # Next.js app — Admin + Trainer portals
│       ├── app/
│       │   ├── (admin)/            # role-gated: /admin/*
│       │   │   ├── users/
│       │   │   ├── trainers/
│       │   │   ├── programs/
│       │   │   ├── nutrition/
│       │   │   ├── subscriptions/
│       │   │   ├── coupons/
│       │   │   ├── analytics/
│       │   │   ├── revenue/
│       │   │   ├── support/
│       │   │   └── reports/
│       │   ├── (trainer)/          # role-gated: /trainer/*
│       │   │   ├── clients/
│       │   │   ├── programs/
│       │   │   ├── check-ins/
│       │   │   ├── messages/
│       │   │   ├── exercises/
│       │   │   └── schedule/
│       │   ├── (auth)/
│       │   └── api/                # thin route handlers, delegate to Edge Functions
│       ├── src/
│       │   ├── features/           # mirrors apps/mobile's vertical-slice pattern
│       │   ├── components/
│       │   ├── lib/
│       │   └── middleware.ts       # role-based route protection
│       └── next.config.ts
│
├── packages/
│   ├── ui/                         # shared design tokens + primitives
│   │   ├── tokens/                 # colors (black/white/gold), spacing, type scale
│   │   ├── native/                 # NativeWind components (mobile)
│   │   └── web/                    # shadcn/ui-based components (web)
│   ├── types/                      # generated Supabase types + domain types
│   │   └── supabase.ts             # `supabase gen types typescript`
│   ├── schemas/                    # Zod schemas — single source of truth for validation
│   │   ├── workout.ts
│   │   ├── nutrition.ts
│   │   ├── subscription.ts
│   │   └── ...
│   ├── api-client/                 # typed Supabase client + query/mutation hooks
│   │   ├── client.ts
│   │   ├── queries/
│   │   └── mutations/
│   ├── domain/                     # pure business logic, framework-agnostic
│   │   ├── training/                # 9-Round timer math, program progression rules
│   │   ├── nutrition/                # macro calculations
│   │   ├── gamification/             # streaks, badges, leaderboard scoring
│   │   └── billing/                  # plan/entitlement rules
│   └── config/                     # shared eslint, tsconfig, tailwind presets
│
├── supabase/
│   ├── migrations/                 # versioned SQL, one file per change
│   ├── functions/                  # Edge Functions, one folder per domain
│   │   ├── ai-workout-generator/
│   │   ├── ai-nutrition-suggestion/
│   │   ├── ai-progress-analysis/
│   │   ├── ai-motivation-message/
│   │   ├── ai-chat-coach/
│   │   ├── stripe-webhook/
│   │   ├── create-checkout-session/
│   │   ├── qr-checkin/
│   │   ├── referral-apply/
│   │   ├── notifications-send/
│   │   └── reports-generate/
│   ├── seed.sql
│   └── config.toml
│
├── docs/                            # this architecture package
├── .github/
│   └── workflows/                  # ci.yml, mobile-release.yml, web-deploy.yml, db-migrate.yml
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## 3.2 Why Vertical-Slice Features (not layer-first)

Each `features/<name>` folder owns its components, hooks, API calls, and local state together. This is Clean Architecture applied pragmatically:

- **Domain layer** (`packages/domain`) — pure TypeScript, no React/Supabase imports. Rules like "how is a streak calculated," "what counts as a completed 9-Round," "what's the prorated upgrade price" live here and are unit-testable without mocking a framework.
- **Data layer** (`packages/api-client`) — the only place that talks to Supabase. Features call typed hooks from here, never the Supabase client directly, so swapping/upgrading the backend touches one package.
- **Presentation layer** (`apps/mobile/src/features/*`, `apps/web/src/features/*`) — screens/components that compose domain + data. A feature folder is deletable without breaking unrelated features.

This keeps business logic out of components (testable, reusable across mobile and web) while avoiding a premature layered/hexagonal structure that a 2–5 person team doesn't need yet.

## 3.3 Naming Conventions

- Files: `kebab-case.ts` / `PascalCase.tsx` for components.
- Zod schemas and generated DB types are the **only** source of truth for a shape — never hand-duplicate an interface that already exists in `packages/types` or `packages/schemas`.
- Edge Functions are named `verb-noun` (`create-checkout-session`, `qr-checkin`) matching the API catalog in [API Architecture](05-api-architecture.md).
- Database tables/columns: `snake_case`, singular domain concept pluralized for the table name (`workout_logs`, not `workoutLog`).

Next: [Database Schema →](04-database-schema.md)
