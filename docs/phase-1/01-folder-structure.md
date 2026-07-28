# 1. Folder Structure (as scaffolded)

The full tree matches [`docs/03-folder-structure.md`](../03-folder-structure.md). This document records exactly what was created in this pass and the rule for what belongs where — every leaf folder either holds a config file or a `README.md` marker; no `.ts`/`.tsx` implementation exists yet.

```
9th-round/
├── package.json                 # root workspace scripts (build/dev/lint/typecheck/test)
├── pnpm-workspace.yaml           # apps/* + packages/*
├── turbo.json                   # build/dev/lint/typecheck/test pipeline
├── tsconfig.base.json            # strict TS config every package extends
├── .prettierrc.json / .editorconfig / .gitignore / .nvmrc / .env.example
│
├── apps/
│   ├── mobile/                  # Expo Router app — package.json, tsconfig.json,
│   │   │                        # babel.config.js, app.config.ts, eas.json all real
│   │   ├── app/                 # (auth), (tabs), workout/[id] — README per route group
│   │   └── src/features/*       # 12 feature folders, each a README describing its
│   │                             # planned components/hooks/api.ts/store.ts + target phase
│   └── web/                     # Next.js app — package.json, tsconfig.json,
│       │                        # next.config.ts, tailwind.config.ts all real
│       └── app/(admin)/*, (trainer)/*   # one README per route, phase-tagged
│
├── packages/
│   ├── ui/          # tokens/, native/, web/ — package.json + README (content: Phase 1 build task)
│   ├── types/       # generated Supabase types will live here
│   ├── schemas/     # Zod schemas — package.json declares the zod dependency
│   ├── api-client/  # Supabase client wrapper + TanStack Query hooks
│   ├── domain/      # pure business logic (timer math, macros, streaks, entitlements)
│   └── config/      # @9thround/config — real eslint-preset.mjs, tsconfig.mobile/web.json
│
├── supabase/
│   ├── config.toml               # real Supabase CLI config (auth providers, storage limits)
│   ├── migrations/                # 7 real SQL migrations — see 02-database-schema.md
│   ├── seed.sql                    # dev-only seed data (plan catalog, exercise categories)
│   └── functions/                  # one folder per Edge Function; Phase 1 functions have a
│                                     # full request/response contract in README.md, no index.ts yet
│
└── docs/                          # this architecture package
```

## Rule for "scaffolding vs. application code"

| Allowed now (Phase 1 architecture pass) | Deferred to implementation |
|---|---|
| `package.json`, `tsconfig.json`, `turbo.json`, `eslint-preset.mjs`, `babel.config.js`, `next.config.ts`, `tailwind.config.ts`, `app.config.ts`, `eas.json`, `supabase/config.toml` | Any `.tsx` component, screen, or hook |
| SQL migrations (`supabase/migrations/*.sql`) — this **is** the requested "database schema" deliverable | Edge Function `index.ts` implementations |
| `README.md` markers describing a folder's future contents and target phase | `packages/ui/tokens` values, `packages/domain` logic, Zustand stores |

This keeps every later phase's starting point unambiguous: a contributor opens any feature folder and immediately sees what belongs there and which phase builds it, without any half-finished code sitting around.

Next: [Database Schema →](02-database-schema.md)
