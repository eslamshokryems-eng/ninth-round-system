# @9thround/site — public website (9throundegypt.com)

The **public marketing + lead-capture website** for 9th Round Egypt. Built
as an **additive, isolated app**: it shares no Next.js router, global
stylesheet, Tailwind config, build, or deploy pipeline with
`@9thround/web` (the internal Reception app). See
`docs/` companions: the Phase 1 Blueprint and the Production Safety Audit.

## Isolation guarantees

- Imports **nothing** from `packages/*` or `apps/web` (no `transpilePackages`).
- Own `app/globals.css` + `tailwind.config.ts`, content-scoped to `apps/site/**` only.
- Ships with **no Supabase client and no keys in the browser**.
- The one server touchpoint — `app/api/trial/route.ts` — inserts **one row**
  into the **existing** `leads` table (`source = 'website'`) using a
  **server-only** `SUPABASE_SERVICE_ROLE_KEY`. It never reads any table.
- **Zero database schema changes.** Trial preferences are packed into the
  existing `leads.interest_notes` column (Safety Audit decision D6-A).

## Local dev

```bash
pnpm --filter @9thround/site dev      # http://localhost:3100
pnpm --filter @9thround/site typecheck
pnpm --filter @9thround/site lint
pnpm --filter @9thround/site build
```

Without `.env.local`, the site runs fully — the trial form returns a
"booking unavailable" state with a WhatsApp fallback instead of writing a
lead.

## Environment (set ONLY in this app's own Vercel project)

See `.env.example`. Summary:

| Var | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | public | canonical base URL |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` / `NEXT_PUBLIC_PHONE_NUMBER` | public | click-to-contact (CTAs hide until set) |
| `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` | public | analytics (optional; separate project recommended) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public | bot-protection widget (optional) |
| `SUPABASE_URL` | **server** | project URL for the lead insert |
| `SUPABASE_SERVICE_ROLE_KEY` | **server** | lead insert only — never `NEXT_PUBLIC_` |
| `NINTH_ROUND_DEFAULT_BRANCH_ID` | **server** | `branches.id` every website lead attaches to |
| `TURNSTILE_SECRET_KEY` | **server** | Turnstile verification |

> Before launch, back `lib/rate-limit.ts` with the shared Upstash Redis
> already used by the platform (`UPSTASH_REDIS_REST_URL` / `_TOKEN`), so the
> rate limit is enforced across instances.

## Content required from 9th Round (edit `content/site.config.ts`)

Nothing is invented. Each item below currently renders as a hidden section
or a clearly-labelled placeholder:

- **Brand:** real vector logo (SVG) — `components/logo.tsx` and
  `public/favicon.svg` are placeholders.
- **Contact:** address, city, Google Maps URL, geo lat/lng, phone,
  WhatsApp number, email, opening hours.
- **Pricing:** decide publish vs. "contact us" (`memberships.showPrices`);
  if publishing, a **current, signed-off** price list.
- **Coaches:** name, photo, specialty, experience, certifications per coach.
- **Photography/video:** real facility media for the hero and gallery.
- **Testimonials:** real quotes + names + consent (section hidden until then).
- **Legal:** finalised privacy + terms copy.
- **Social:** real profile URLs (only ones that exist).

## Deployment (NOT done here)

A separate Vercel project, root directory `apps/site`, domain
`9throundegypt.com`. The internal app stays on its own project/subdomain.
No DNS or deploy has been performed.
