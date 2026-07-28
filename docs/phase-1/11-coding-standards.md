# 11. Coding Standards

## 11.1 TypeScript

- `strict: true` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` are on for every package (`tsconfig.base.json`) — not aspirational, CI fails the build on any violation.
- `any` is a lint error (`@typescript-eslint/no-explicit-any`, see `packages/config/eslint-preset.mjs`). An untyped third-party response gets a Zod schema at the boundary (`packages/schemas`) instead of an `any` escape hatch — this is the actual mechanism, not just a rule, for "type safety end-to-end" from [`docs/02-technical-roadmap.md §2.1`](../02-technical-roadmap.md#21-guiding-principles).
- No duplicated shape definitions: if a type already exists in `packages/types` (generated from the DB) or `packages/schemas` (Zod), a feature imports it — it never redeclares an equivalent `interface` locally.

## 11.2 Import Boundaries

Enforced via ESLint `no-restricted-imports` (project-specific addition to the shared preset, configured per-package):

| Package/app | May import | May NOT import |
|---|---|---|
| `packages/ui/tokens` | nothing internal | any other package or app |
| `packages/ui/{native,web}` | `packages/ui/tokens`, `packages/types` | any `apps/*` |
| `packages/domain` | `packages/types` | `packages/api-client`, `packages/ui`, any `apps/*` — domain logic must stay framework- and I/O-free |
| `packages/api-client` | `packages/types`, `packages/schemas` | `packages/ui`, any `apps/*` |
| `apps/*/src/components` | `packages/ui`, `packages/types` | `apps/*/src/features/*` (shared components never depend on a specific feature) |
| `apps/*/src/features/<a>` | `packages/*`, its own subtree | `apps/*/src/features/<b>` internals — cross-feature reuse goes through `packages/*` or `apps/*/src/components`, never a direct feature-to-feature import |

## 11.3 Linting & Formatting

- ESLint flat config, shared preset in `packages/config/eslint-preset.mjs`, extended (never overridden) by each app/package.
- Prettier (`.prettierrc.json`) is the only formatting authority — no ESLint stylistic rules fight it; `prettier-plugin-tailwindcss` keeps class-name order deterministic across both `packages/ui/native` and `packages/ui/web`.
- `pnpm lint` and `pnpm format:check` both run in CI (`ci.yml`); a PR with lint errors or unformatted files cannot merge.

## 11.4 Testing Standards

| Layer | Tool | What's required |
|---|---|---|
| `packages/domain` | Vitest, unit tests | **Required** for every exported function — this is pure logic (timer math, macro calculations, streak scoring, entitlement rules) with no excuse to skip coverage; it's the cheapest, highest-value testing surface in the repo |
| `packages/schemas` | Vitest | Required — at least one valid-input and one invalid-input case per schema |
| `packages/api-client` | Vitest with a mocked Supabase client | Required for any hook with non-trivial logic (e.g. optimistic update rollback) |
| Components (`packages/ui`, feature components) | React Testing Library (web) / React Native Testing Library (mobile) | Required for interactive components with real logic (forms, the timer); not required for pure-presentational components with no conditional rendering |
| Edge Functions | Deno's built-in test runner | Required for the request-validation and business-logic paths; Stripe/Cloudflare calls are mocked, not hit live |
| End-to-end | Deferred — Maestro (mobile) / Playwright (web) introduced once Phase 1's core screens exist | Not a Phase 1 gate; added when there's a real app to point it at |

No PR merges with failing tests; new business logic in `packages/domain` without an accompanying test is a review blocker, not a style preference.

## 11.5 Commit & PR Conventions

- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`), enforced by commitlint in CI.
- **PRs**: one logical change per PR (a screen, a migration, an Edge Function) — not "Phase 1 batch 3," which is unreviewable. PR description states what changed and why, links the relevant doc section if it implements one of these architecture docs.
- **Review requirement**: at minimum one other engineer approves before merge once the team is >1 person; the founder-as-sole-engineer period documents the same checklist below as a self-review gate instead of skipping it.

## 11.6 Pre-Merge Checklist (applies to every PR touching app code, once implementation starts)

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` all pass locally and in CI
- [ ] No `any`, no commented-out code, no stray `console.log`
- [ ] New DB columns/tables have RLS policies in the same PR — never a follow-up
- [ ] New Edge Function has a rate limit and, if it mutates money/entitlements, an idempotency key
- [ ] New screen matches its entry in [Screen List](05-screen-list.md) and design tokens from [`docs/06-ui-flow-and-wireframes.md`](../06-ui-flow-and-wireframes.md) — no ad-hoc colors/spacing
- [ ] Secrets never hard-coded; new required env vars added to `.env.example`

## 11.7 Documentation

- Code comments explain *why*, never *what* — matches the project-wide rule already in effect for this repo's own docs. A non-obvious constraint (a Stripe quirk, an RLS edge case) gets one line; a well-named function does not need a comment restating its name.
- Every package/feature folder's `README.md` (already seeded in this scaffolding pass) is updated the moment real code lands in it — a README describing "planned" contents that no longer matches reality is worse than no README.

This closes the Phase 1 architecture package. Implementation begins feature-by-feature against [Screen List](05-screen-list.md) and [Database Schema](02-database-schema.md), in the order set by [`docs/09-development-phases.md`](../09-development-phases.md).
