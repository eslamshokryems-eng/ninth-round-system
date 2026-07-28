# 9th Round

**Premium online personal training platform** — scientific fitness, boxing-inspired interval training, nutrition coaching, AI support, and habit tracking.

- **Founder:** Eslam Shokry
- **Status:** Pre-development — architecture & planning phase
- **Design language:** Black / White / Gold, Apple-quality minimal UI, glassmorphism, motion-first

This repository currently contains the **full product & technical architecture** for 9th Round. No application code has been written yet, by design — the plan below must be reviewed and approved before implementation begins (see [Rules](#rules)).

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
