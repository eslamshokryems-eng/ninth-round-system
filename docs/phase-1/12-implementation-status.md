# 12. Implementation Status

Maintained continuously as code lands, per the requirement to generate technical documentation *while* coding, not after. Update this table in the same PR as any code change it describes — a stale status here is treated the same as a stale README (see [Coding Standards §11.7](11-coding-standards.md#117-documentation)).

## What's Implemented and Tested Right Now

| Package | Layer | Status | Tests |
|---|---|---|---|
| `packages/shared-kernel` | — (cross-cutting) | ✅ Implemented | 6 passing (Result, Locale value object) |
| `packages/i18n` | — (cross-cutting) | ✅ Implemented | 3 passing (en/ar key parity, locale resolution + fallback) |
| `packages/database-types` | — (cross-cutting) | ✅ Implemented (hand-authored placeholder — see file header for the `pnpm db:types` replacement note) | — (generated/mapping data, no logic to test) |
| `packages/supabase-client` | — (cross-cutting) | ✅ Implemented | — (thin factory; exercised indirectly via `identity`'s repository) |
| `packages/ui` | `tokens/` | ✅ Implemented (real color/spacing/type-scale values) | — |
| `packages/ui` | `native/`, `web/` | 📋 Skeleton only | — |
| `packages/config` | — | ✅ Implemented (ESLint flat-config preset, shared tsconfigs) | — |
| **`packages/identity`** | `domain/` | ✅ Implemented — `Profile` entity, `Role` value object, `ProfileRepository` port | 4 (`Role` rules) |
| **`packages/identity`** | `application/` | ✅ Implemented — `CompleteOnboardingUseCase`, `AssignStaffRoleUseCase` | 6 (2 + 4, using in-memory fake repository) |
| **`packages/identity`** | `infrastructure/` | ✅ Implemented — `SupabaseProfileRepository`, row↔entity mapper | Untested against a live Supabase project (none provisioned yet); the mapping logic itself is straightforward field renaming, exercised transitively by the typecheck |
| `packages/training`, `packages/nutrition`, `packages/tracking`, `packages/billing`, `packages/notifications` | all | 📋 Skeleton only (`domain/`, `application/`, `infrastructure/` folders + README) | — |
| `packages/ai` | all | 📋 Skeleton only (Phase 3) | — |
| `apps/mobile` | all screens | 📋 Not started — zero `.tsx` files | — |
| `apps/web` | all screens | 📋 Not started — zero `.tsx` files | — |
| `supabase/functions/*` | all | 📋 Contract documented in each function's README; zero `index.ts` implementations | — |

**Total: 19 automated tests, all passing** (`pnpm test` via Turborepo). **7 typecheck targets, all passing** (`pnpm typecheck`). **Lint clean across the entire repository** (`pnpm lint`), including type-aware rules (`@typescript-eslint/no-floating-promises`) via typescript-eslint's Project Service.

## Why Identity First

Every other bounded context depends on knowing who the caller is and what role they hold — Training needs to know if a caller is the assigned trainer, Billing needs to know if a caller is a client, Notifications needs a profile's `preferred_locale`. Building Identity first, completely, with real domain logic (`Role.canAssignRole`) and a real (if not-yet-connected-to-a-live-database) infrastructure implementation, gives every subsequent context a working example to copy the pattern from rather than a description of the pattern.

## Known Gaps / Honest Caveats

- **No live Supabase project exists yet.** `packages/database-types` is a hand-authored placeholder; `SupabaseProfileRepository` has never executed against a real Postgres instance. It typechecks against a pinned `@supabase/supabase-js@2.45.4` and follows the exact shape `supabase gen types typescript` produces, so swapping in real generated types and a real project URL should be a non-event — but "should be" is not "has been verified."
- **No screens exist.** The Identity context's use cases are ready to be called from a screen, but no Expo Router route or Next.js page has been built yet. The next implementation slice is the mobile language-picker → sign-up → log-in → onboarding flow (screens 1–8 in [Screen List](05-screen-list.md)) wired to `createIdentityModule`.
- **`packages/ui/native` and `packages/ui/web` are empty.** Building real screens requires at least `Button`, `TextInput`, and `Text` primitives first — these don't exist yet.
- **CI's `build` step is expected to fail right now** for `apps/mobile` (`expo export`) and `apps/web` (`next build`), since neither app has any route content yet. This is expected at this stage, not a regression — `lint`/`typecheck`/`test` are the meaningful gates until the first screens land.

## Next Slice (proposed)

1. `packages/ui/native`: `Button`, `Text`, `TextInput`, `Card` — minimal, token-driven, RTL-aware (logical properties from the start).
2. `apps/mobile`: language picker → sign-up → log-in → onboarding screens, calling `createIdentityModule(supabaseClient).completeOnboarding` from a container component per [Component Architecture §7.2](07-component-architecture.md#72-container--presentation-split-within-a-feature).
3. A real (free-tier) Supabase project provisioned for `development`, migrations applied, `pnpm db:types` run for real, `packages/database-types` replaced with generated output.

Not started until explicitly requested — see [`docs/09-development-phases.md`](../09-development-phases.md) for how this fits the overall Phase 1 sequence.
