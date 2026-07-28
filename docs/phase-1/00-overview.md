# Phase 1 — Engineering Architecture

This folder is the implementation-ready architecture for **Phase 1: MVP — Core Training & Tracking**, as scoped in [`docs/09-development-phases.md`](../09-development-phases.md). It refines the whole-product architecture in `docs/01`–`docs/10` down to exactly what Phase 1 needs to build.

**What exists in the repo right now** (see [12-implementation-status.md](12-implementation-status.md) for the exhaustive, continuously-maintained ledger):

- Full monorepo skeleton (`apps/mobile`, `apps/web`, `packages/*`, `supabase/*`), restructured around bounded contexts per [`docs/13-ddd-architecture.md`](../13-ddd-architecture.md).
- Phase 1 database schema as real SQL migrations in `supabase/migrations/`, covering the 6-role model, bilingual content, and AI-readiness tables — see [02-database-schema.md](02-database-schema.md), verified end-to-end against a real Postgres engine (§13 of Implementation Status).
- **The Identity bounded context is fully implemented and tested**, covering registration, login, forgot-password, onboarding, and role assignment (41 tests). Every other context (`nutrition`, `tracking`, `billing`, `notifications`, `ai`) is still a skeleton; `training` has the 9th Round Timer's architecture prepared but not implemented.
- **16 real mobile screens** exist and are runnable: language selection through Dashboard Home, targeting **Expo SDK 57** (upgraded from an initial SDK 51 build so the app actually loads in the current Expo Go app). See [13-local-setup.md](13-local-setup.md) to run it.

**Documents in this folder:**

| # | Document | Answers |
|---|---|---|
| 01 | [Folder Structure](01-folder-structure.md) | What was scaffolded/implemented and why |
| 02 | [Database Schema](02-database-schema.md) | What Phase 1 actually stores |
| 03 | [ER Diagram](03-er-diagram.md) | How Phase 1 tables relate |
| 04 | [API Documentation](04-api-documentation.md) | Every endpoint Phase 1 clients call |
| 05 | [Screen List](05-screen-list.md) | Every screen Phase 1 ships |
| 06 | [Navigation Flow](06-navigation-flow.md) | How screens connect |
| 07 | [Component Architecture](07-component-architecture.md) | How UI code is organized |
| 08 | [State Management](08-state-management.md) | Where state lives and how it flows |
| 09 | [Authentication Flow](09-authentication-flow.md) | How sign-up/login/session/roles work |
| 10 | [File Naming Conventions](10-file-naming-conventions.md) | How files/folders are named |
| 11 | [Coding Standards](11-coding-standards.md) | Lint/format/test/commit/PR rules |
| 12 | [Implementation Status](12-implementation-status.md) | What's real, tested, and pending — right now |
| 13 | [Local Setup](13-local-setup.md) | Run the app on a real iPhone via Expo Go, step by step |

**Explicitly out of scope for this pass** (per the phase plan): AI Coach endpoints, community feed, challenges/leaderboard, chat-with-coach, QR check-in, referral program, and the full Trainer/Admin dashboards. Their folders exist in the skeleton (marked with their target phase) but are not designed in implementation detail here — that happens when their phase starts, per [`docs/09-development-phases.md`](../09-development-phases.md).

Next: [Folder Structure →](01-folder-structure.md)
