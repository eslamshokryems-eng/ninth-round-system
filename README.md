# 9th Round

**Premium online personal training platform** — scientific fitness, boxing-inspired interval training, nutrition coaching, AI support, and habit tracking. Bilingual (English/Arabic, LTR/RTL) and multi-role (Client, Trainer, Nutritionist, Reception, Admin, Super Admin) from day one.

- **Founder:** Eslam Shokry
- **Status:** Phase 1 (MVP: Core Training & Tracking) — architecture approved with modifications; implementation underway. See [Implementation Status](docs/phase-1/12-implementation-status.md) for exactly what's built and tested right now.
- **Design language:** Black / White / Gold, Apple-quality minimal UI, glassmorphism, motion-first

This repository contains the full product & technical architecture for 9th Round, the Phase 1 engineering architecture (real monorepo, real database schema, detailed specs), and the first real implementation slice (the Identity bounded context, fully built and tested).

## Architecture Documents

| # | Document | Contents |
|---|----------|----------|
| 1 | [Product Roadmap](docs/01-product-roadmap.md) | Vision, personas, monetization, competitive positioning, KPIs |
| 2 | [Technical Roadmap](docs/02-technical-roadmap.md) | Full stack, rationale per technology, system diagram |
| 3 | [Folder Structure](docs/03-folder-structure.md) | Original monorepo layout (superseded by #13 for `packages/`) |
| 4 | [Database Schema](docs/04-database-schema.md) | ER diagram, table definitions, RLS strategy |
| 5 | [API Architecture](docs/05-api-architecture.md) | Endpoint catalog, request/response contracts, auth flow |
| 6 | [UI Flow & Wireframes](docs/06-ui-flow-and-wireframes.md) | User journeys, screen-by-screen wireframes, design tokens, RTL/responsive rules |
| 7 | [Security Plan](docs/07-security-plan.md) | AuthN/AuthZ, RLS helper functions, data protection, payment & video security, compliance |
| 8 | [Deployment Plan](docs/08-deployment-plan.md) | Environments, CI/CD, release process, App Store/Play readiness checklist |
| 9 | [Development Phases](docs/09-development-phases.md) | Phase-by-phase delivery plan with exit criteria |
| 10 | [Scalability Plan](docs/10-scalability-plan.md) | Path to 100,000+ concurrent users, module independence |
| 11 | [Internationalization](docs/11-internationalization.md) | Bilingual (en/ar) strategy, RTL/LTR, translatable content |
| 12 | [Roles & Permissions](docs/12-roles-and-permissions.md) | The 6-role model, admin vs. super_admin, full permission matrix |
| 13 | [DDD Architecture](docs/13-ddd-architecture.md) | Clean Architecture + bounded contexts — the current `packages/` layout |

A visual low-fidelity wireframe board (mobile + admin + trainer screens, in the black/white/gold design language) was shared separately as an interactive artifact.

## Phase 1 Engineering Architecture

Implementation-ready detail for the current phase — see [`docs/phase-1/00-overview.md`](docs/phase-1/00-overview.md) for the full index.

## What's Actually Built (not just designed)

- **`packages/shared-kernel`**, **`packages/i18n`**, **`packages/database-types`**, **`packages/supabase-client`**, **`packages/ui/tokens`** — real, working, tested code.
- **`packages/identity`** — a complete Clean Architecture bounded context: domain entities (`Profile`, `Role`), application use cases (`CompleteOnboardingUseCase`, `AssignStaffRoleUseCase`), and a Supabase-backed infrastructure repository. **20 automated tests pass**, the whole repo **typechecks** and **lints clean** (including type-aware ESLint rules).
- **7 SQL migrations** in `supabase/migrations/` implementing the full Phase 1 schema: the 6-role model, bilingual (`translated_text`) content, row-level security on every table, and the AI-readiness event log.
- Every other bounded context (`training`, `nutrition`, `tracking`, `billing`, `notifications`, `ai`) and every mobile/web screen is still a scaffold — see [Implementation Status](docs/phase-1/12-implementation-status.md) for the exact ledger and what's next.

## Stack at a Glance

| Layer | Technology |
|---|---|
| Mobile App | React Native (Expo, TypeScript) |
| Admin + Trainer + Reception Web | Next.js (App Router, TypeScript) |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions) — API-first, shared by every client |
| i18n | i18next / react-i18next (English + Arabic, RTL/LTR) |
| Payments | Stripe (Billing + Subscriptions) |
| Video | Cloudflare Stream + R2 |
| Push Notifications | Firebase Cloud Messaging |
| AI Coach | Claude API (Anthropic), via a dependency-inverted port every bounded context can extend |
| Monorepo | Turborepo + pnpm workspaces, one package per bounded context (Clean Architecture + DDD) |

## Rules

- Never generate random code — every file has a defined place in the architecture above.
- Clean Architecture + Domain-Driven Design: `domain/` → `application/` → `infrastructure/`, dependencies point inward only.
- Every table has Row Level Security; every screen is bilingual and responsive; every bounded context is independently scalable.
- Document everything, continuously — see [Implementation Status](docs/phase-1/12-implementation-status.md), updated in the same PR as any code change it describes.
