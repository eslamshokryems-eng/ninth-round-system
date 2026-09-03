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
- **Zero database schema changes.** Trial preferences, the visitor's
  language and the ad-campaign tag are packed into the existing
  `leads.interest_notes` column (Safety Audit decision D6-A).

## Bilingual routing (ar / en)

Every page exists under both locales:

```
/ar/...   Egyptian Arabic — the default, RTL
/en/...   English — LTR
```

- `middleware.ts` redirects any un-prefixed path (307) to a locale, picking
  from `Accept-Language` and defaulting to **Arabic**. It sends
  `Vary: Accept-Language` and never rewrites, so **every page stays
  statically generated** (32 pages prerendered, two per route).
- The root layout lives at `app/[lang]/layout.tsx`, not `app/layout.tsx`,
  because `<html lang>` / `<html dir>` must change per locale and only a
  layout inside the dynamic segment can read the param.
- **Slugs stay English** (`/ar/programs/boxing`, `/en/programs/boxing`), so
  each page has one canonical id in two languages — what hreflang needs.
- `lib/seo.ts` emits canonical + `hreflang` (`ar-EG`, `en`, `x-default`) on
  every indexable page; `app/sitemap.ts` repeats the alternates per URL.

### Adding or changing copy

| What | Where |
|---|---|
| UI strings | `content/i18n/en.ts` and `content/i18n/ar.ts` |
| Business facts (phone, address, prices, coaches) | `content/site.config.ts` |
| Programs | `content/programs.ts` |
| FAQs | `content/faqs.ts` |
| Session times & training groups | `content/schedule.ts` |
| Events | `content/events.ts` |
| Ad landing pages | `content/campaigns.ts` |

`ar.ts` is typed as `Dict` (derived from `en.ts`), so **a missing Arabic
string fails the build** rather than shipping English onto an Arabic page.

### RTL rules baked into `globals.css`

- Arabic gets its own font stack (Cairo display + IBM Plex Sans Arabic),
  because Oswald and IBM Plex have no Arabic glyphs. All fonts are
  self-hosted by `next/font`, so `font-src 'self'` holds.
- `letter-spacing` is neutralised in RTL — Arabic is a connected script and
  tracking breaks the joins. This is a correctness fix, not a preference.
- `uppercase` is a no-op in RTL; headline line-height is relaxed.
- Layout uses **logical** utilities (`ps-`, `pe-`, `start-`, `text-start`)
  so it mirrors automatically. Phone numbers, emails and round numbers are
  wrapped in `dir="ltr"`.

## Routes

```
/[lang]                     home
/[lang]/programs            list
/[lang]/programs/[slug]     fitness · boxing · kickboxing · personal-training · kids
/[lang]/schedule            open circuit + set-time sessions + training groups
/[lang]/about               why 9th Round
/[lang]/coaches
/[lang]/memberships
/[lang]/location            address, map, hours, what to bring  (LocalBusiness JSON-LD)
/[lang]/gallery
/[lang]/faq                 (FAQPage JSON-LD)
/[lang]/events              in-house competitions + the event format
/[lang]/trial               the conversion page
/[lang]/thank-you           noindex
/[lang]/contact
/[lang]/privacy · /terms
/[lang]/go/[campaign]       ad landing pages — noindex, no nav, no footer
/api/trial                  the one server action
```

### Ad landing pages (`/go/*`)

Paid traffic lands here, not on `/trial`. They sit in the `(landing)`
route group, which deliberately ships **no header, footer or sticky bar** —
every nav item on a landing page is a way to spend a paid click on
something other than the form. Each campaign in `content/campaigns.ts`
carries a `leadTag` that rides through to `leads.interest_notes`, so
cost-per-lead is readable **per campaign** instead of as one undifferentiated
"website" bucket. They are `noindex` and disallowed in `robots.txt`.

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

## Content required from 9th Round

Nothing is invented. Each item below currently renders as a hidden section
or a clearly-labelled placeholder — in **both** languages:

- **Brand:** real vector logo (SVG) — `components/logo.tsx` and
  `public/favicon.svg` are placeholders.
- **Contact:** address, city, Google Maps URL, geo lat/lng, phone,
  WhatsApp number, email, opening hours (`content/site.config.ts`).
- **Schedule:** the current set-time sessions — `SESSIONS` in
  `content/schedule.ts` ships **empty** on purpose, because a stale
  session time on a public page is a wasted trip and a lost member.
- **Pricing:** decide publish vs. "contact us" (`memberships.showPrices`);
  if publishing, a **current, signed-off** price list.
- **Coaches:** name, photo, specialty, experience, certifications per coach.
- **Photography/video:** real facility media for the hero and `/gallery`.
- **Events:** confirmed dates for `EVENTS` in `content/events.ts`.
- **Testimonials:** real quotes + names + consent (section hidden until then).
- **Legal:** finalised privacy + terms copy.
- **Social:** real profile URLs (only ones that exist).

## Deployment (NOT done here)

A separate Vercel project, root directory `apps/site`, domain
`9throundegypt.com`. The internal app stays on its own project/subdomain.
No DNS or deploy has been performed.
