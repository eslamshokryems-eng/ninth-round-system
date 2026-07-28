# 9th Round

**Premium online personal training platform** — scientific fitness, boxing-inspired interval training, nutrition coaching, AI support, and habit tracking.

- **Founder:** Eslam Shokry
- **Status:** Phase 1 (MVP: Core Training & Tracking) — engineering architecture complete, implementation not yet started
- **Design language:** Black / White / Gold, Apple-quality minimal UI, glassmorphism, motion-first

This repository contains the **full product & technical architecture** for 9th Round, plus the **Phase 1 engineering architecture**: the real monorepo skeleton, the Phase 1 database schema (as SQL migrations), and detailed API/screen/navigation/component/state/auth specs. No application code (components, screens, hooks, Edge Function logic) has been written yet, by design — see [Rules](#rules).

## Architecture Documents

| # | Document | Contents |
|---|----------|----------|
| 1 | [Product Roadmap](docs/01-product-roadmap.md) | Vision, personas, monetization, competitive positioning, KPIs |
| 2 | [Technical Roadmap](docs/02-technical-roadmap.md) | Full stack, rationale per technology, system diagram |
| 3 | [Folder Structure](docs/03-folder-structure.md) | Monorepo layout, clean architecture layering, conventions |
| 4 | [Database Schema](docs/04-database-schema.md) | ER diagram, table definitions, RLS strategy |
| 5 | [API Architecture](docs/05-api-architecture.md) | Endpoint catalog, request/response contracts, auth flow |
| 6 | [UI Flow & Wireframes](docs/06-ui-flow-and-wireframes.md) | User journeys, screen-by-screen wireframes, design tokens |
| 7 | [Security Plan](docs/07-security-plan.md) | AuthN/AuthZ, data protection, payment & video security, compliance |
| 8 | [Deployment Plan](docs/08-deployment-plan.md) | Environments, CI/CD, release process, observability |
| 9 | [Development Phases](docs/09-development-phases.md) | Phase-by-phase delivery plan with exit criteria |
| 10 | [Scalability Plan](docs/10-scalability-plan.md) | Path to 100,000+ concurrent users |

A visual low-fidelity wireframe board (mobile + admin + trainer screens, in the black/white/gold design language) was shared separately as an interactive artifact.

## Phase 1 Engineering Architecture

Implementation-ready detail for the current phase — see [`docs/phase-1/00-overview.md`](docs/phase-1/00-overview.md) for the full index (folder structure, database schema, ER diagram, API docs, screen list, navigation flow, component architecture, state management, authentication flow, naming conventions, coding standards).

The monorepo skeleton described there already exists in this repo: `apps/mobile`, `apps/web`, `packages/*`, and `supabase/*` (including 7 real Phase 1 SQL migrations in `supabase/migrations/`). Every code-bearing folder holds a `README.md` describing what belongs there and which phase implements it — no feature/business logic has been written.

## Stack at a Glance

| Layer | Technology |
|---|---|
| Mobile App | React Native (Expo, TypeScript) |
| Admin + Trainer Web | Next.js (App Router, TypeScript) |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions) |
| Payments | Stripe (Billing + Subscriptions) |
| Video | Cloudflare Stream + R2 |
| Push Notifications | Firebase Cloud Messaging |
| AI Coach | Claude API (Anthropic) |
| Monorepo | Turborepo + pnpm workspaces |

## Rules

- Never generate random code — every file has a defined place in the architecture below.
- Clean architecture, separated business logic, reusable components, SOLID principles.
- Document everything; every module must be built to scale to 100k+ users.
- **Coding begins only after the architecture in `/docs` is reviewed and approved.**
