# 1. Folder Structure (as implemented)

> **Updated**: the package layout below reflects the DDD/Clean Architecture restructuring in [`docs/13-ddd-architecture.md`](../13-ddd-architecture.md), which replaced the original layer-per-package plan (`packages/domain`, `packages/api-client`, `packages/schemas`, `packages/types`). `apps/mobile` and `apps/web`'s internal route/feature layout is unchanged from the original plan.

```
9th-round/
├── package.json / pnpm-workspace.yaml / turbo.json / tsconfig.base.json
├── eslint.config.mjs             # root flat config — type-aware linting via Project Service
├── apps/
│   ├── mobile/                   # Expo Router app — package.json, tsconfig, babel, app.config, eas.json all real
│   │   ├── app/                  # (auth), (tabs), workout/[id] — README per route group, not yet implemented
│   │   └── src/features/*        # 12 feature folders, README per feature + target phase
│   └── web/                      # Next.js app — package.json, tsconfig, next.config, tailwind.config all real
│       └── app/(admin)/*, (trainer)/*   # one README per route, phase-tagged
│
├── packages/
│   ├── shared-kernel/             # ✅ IMPLEMENTED — Result, DomainEvent, UseCase, Repository, Locale value object (tested, 6 tests)
│   ├── i18n/                      # ✅ IMPLEMENTED — en/ar resource bundles, i18next config (tested, 3 tests)
│   ├── database-types/            # ✅ IMPLEMENTED (hand-authored placeholder — replace with `pnpm db:types` once a real Supabase project exists)
│   ├── supabase-client/           # ✅ IMPLEMENTED — typed client factory, the only place `createClient` is called
│   ├── ui/                        # tokens/ ✅ IMPLEMENTED (real color/spacing/type-scale values); native/, web/ not yet
│   ├── config/                    # ✅ IMPLEMENTED — real ESLint flat-config preset + shared tsconfigs
│   │
│   ├── identity/                  # ✅ IMPLEMENTED — reference bounded context, see below
│   │   ├── domain/                  Profile entity, Role value object, ProfileRepository port
│   │   ├── application/              CompleteOnboardingUseCase, AssignStaffRoleUseCase (14 tests, in-memory fakes)
│   │   ├── infrastructure/            SupabaseProfileRepository + row↔entity mapper
│   │   └── index.ts                   createIdentityModule(client) composition root
│   │
│   ├── training/                  # 📋 skeleton only — domain/application/infrastructure folders + README (Phase 1, not yet built)
│   ├── nutrition/                 # 📋 skeleton only (Phase 1, not yet built)
│   ├── tracking/                  # 📋 skeleton only (Phase 1, not yet built)
│   ├── billing/                   # 📋 skeleton only (Phase 1, not yet built)
│   ├── notifications/             # 📋 skeleton only (Phase 1, not yet built)
│   └── ai/                        # 📋 skeleton only (Phase 3, not yet built)
│
├── supabase/
│   ├── config.toml                 # real Supabase CLI config
│   ├── migrations/                  # 7 real SQL migrations — see 02-database-schema.md
│   ├── seed.sql                       # dev-only seed data
│   └── functions/                      # one folder per Edge Function; Phase 1 functions have a
│                                         # full request/response contract in README.md, no index.ts yet
│
└── docs/                           # this architecture package
```

## What's Actually Real vs. Scaffolded

See [`docs/phase-1/12-implementation-status.md`](12-implementation-status.md) for the exhaustive, continuously-updated ledger this project maintains per requirement 10 ("generate technical documentation continuously while coding"). Summary: `shared-kernel`, `i18n`, `database-types`, `supabase-client`, `ui/tokens`, and the full `identity` bounded context (domain + application + infrastructure) are implemented and covered by 20 passing automated tests; every other bounded context is a Clean Architecture skeleton (`domain/`, `application/`, `infrastructure/` folders + a README describing its planned entities/use cases/ports) awaiting implementation in its scheduled phase.

## Rule for "scaffolding vs. application code" (unchanged)

| Allowed at any stage | Deferred until a context's implementation turn |
|---|---|
| `package.json`, `tsconfig.json`, tooling config | A context's actual `.ts` domain/application/infrastructure files |
| SQL migrations | Mobile/web screen components (still pending for every context, including Identity — see [`docs/phase-1/12-implementation-status.md`](12-implementation-status.md)) |
| `README.md` markers describing a folder's future contents and target phase | — |

Next: [Database Schema →](02-database-schema.md)
