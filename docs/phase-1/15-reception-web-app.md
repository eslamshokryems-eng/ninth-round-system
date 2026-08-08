# 15. Reception Web App

A dedicated desktop web application for Reception staff (`apps/web`), so a front-desk Windows computer needs nothing but a browser — no phone, no Expo Go, no ngrok tunnel, no developer's laptop. It talks directly to the same production Supabase project the mobile app uses, through the same public anon key + RLS security model — there is no second backend, no service_role key in the browser, and no privileged bypass of any policy described in [§14](14-reception-membership.md).

```
Reception computer → Chrome/Edge → 9th Round Reception Web App → Supabase (existing project)
```

## 15.1 What it reuses vs. what's new

Everything in `packages/reception` and `packages/identity` is framework-agnostic TypeScript (domain/application/infrastructure layers never import React Native or the DOM) — this is what made a desktop web app buildable in one pass without rewriting a single use case. `apps/web` is a thin presentation layer on top of the exact same:

- `createReceptionModule(client)` / `createIdentityModule(client)` composition roots (mirrors `apps/mobile/src/lib/composition-root.ts`)
- `RegisterMembershipUseCase`, `UploadMemberPhotoUseCase`, `GetNextMembershipNumberUseCase`, `RenewMembershipUseCase`, `CheckInMemberUseCase`, `UpdateMemberUseCase`, `GetMemberDetailUseCase`, `SearchMembersUseCase`, `GetDashboardStatsUseCase`, `ListReceiptsUseCase`
- One new, equally thin addition: `ListExpiringMembershipsUseCase` (+ `SupabaseExpiringMembershipRepository`), matching `reception_dashboard_stats`' "expiring this week" window exactly, backing the Expiring page's member list (the Dashboard already had the *count*; this is the *list*).

What's new is presentation only: a Tailwind-styled component set built directly in `apps/web/src/components/ui/` (Button, Card, TextField, SelectField, OptionCard, StatCard, QrCodeImage) — **not** in `packages/ui/web`, despite that export path already existing. `packages/ui` pins `react@19.1.0` as an exact peer/dev dependency for the mobile app's sake; adding web components there would risk a duplicate-React resolution conflict with `apps/web`'s `react@18.2.0`. Building them app-local avoids that risk entirely. `packages/ui/tokens`' color values (`#0B0B0C` / `#C9A227` / etc.) are still the single source of truth — `apps/web/tailwind.config.ts` copies them, mirroring how `apps/mobile/tailwind.config.js` already does.

## 15.2 Auth

Reception has its own login screen (`app/(auth)/login/page.tsx`), backed by `SignInUseCase` — the identical Supabase Auth email/password flow the mobile app uses, not a second auth system. The Supabase client persists its session in `window.localStorage` (supabase-js's own default in a browser — no custom storage adapter needed, unlike mobile's SecureStore adapter). Role/branch authorization is enforced two places, deliberately unequal in trust level:

- **The database (real boundary):** every RLS policy from [§14](14-reception-membership.md) applies exactly as-is — a `member`/`coach` account, or no account at all, gets nothing beyond what those policies already allow, regardless of what this app's UI does.
- **`app/(reception)/layout.tsx` (UX nicety, not security):** redirects a signed-out visitor to `/login`, and shows a plain "not authorized" message instead of Reception screens for a signed-in `member`/`coach` account. This exists so a wrong-role sign-in produces a clear message instead of a wall of RLS-empty tables — it is not what makes the data safe.

## 15.3 Scope decisions made without asking (documented, not silent)

- **English-only for this pass.** `@9thround/i18n`'s en/ar locale files and the mobile app's bilingual UI are untouched; this app writes plain English strings directly rather than wiring up react-i18next. This is an internal, Windows-desktop-only staff tool — bilingual support is a real, valuable follow-up, not something quietly dropped.
- **No in-browser photo cropping.** Add Member's photo step is a plain `<input type="file">` (no crop UI, unlike the mobile app's native `expo-image-picker` crop step) — the upload architecture (`UploadMemberPhotoUseCase` → `member-photos` bucket → signed URL) is identical either way; only the client-side crop step is mobile-only for now.
- **QR rendering uses `qrcode`** (a small, dependency-light, framework-agnostic npm package that renders to a data URL client-side), not `react-native-qrcode-svg` (RN-only, can't run in a browser). No QR image is generated server-side or stored anywhere in either app — only the value it encodes (`members.qr_code`).
- **Memberships / Expiring / Reports scope:** "Memberships" is the configurable type catalog (`ListMembershipTypesUseCase`) plus a member search that jumps into that member's Renew action — not a separate renewal engine. "Expiring" is a real, live list (new `ListExpiringMembershipsUseCase`), not a placeholder. "Reports" *is* an honest placeholder — no reporting use case exists anywhere in `@9thround/reception` yet, and revenue trends/exports would be real new scope, not a UI-only exercise; the page says so plainly rather than inventing numbers.

## 15.4 A real bug found and fixed along the way

`next build` failed outright (`next.config.ts` isn't supported on the pinned Next.js 14 — TypeScript config support only landed in Next 15) — fixed by converting to `next.config.mjs`. This was a **pre-existing, latent bug**: the file existed before this slice, but `next build` had never actually been run against it, since `apps/web` had zero real pages until now.

A second, deeper one: even after that fix, `next build` crashed while pre-rendering Next's own built-in `/404` and `/500` fallback pages (`TypeError: Cannot read properties of null (reading 'useContext')`, inside `styled-jsx`) — every one of the 13 real Reception routes built and rendered correctly; only Next's two auto-generated fallback pages failed, but that failure makes `next build` exit non-zero and skip writing `prerender-manifest.json`, which `next start` requires — so the build genuinely wasn't deployable, not just noisy. Root cause: this repo needs two different React majors at once (`apps/mobile` pins React 19 exactly for RN 0.81; `apps/web` needs React 18 for Next 14), which forces pnpm to nest a private `react`/`react-dom` copy for `next` to satisfy its peer dependency — and pnpm doesn't reuse that already-correct nested copy for `styled-jsx`'s *own* peer requirement, so it nests a *third*, separate physical copy. Three physically distinct 18.2.0 `react` instances, each with independent internal dispatcher state, is what actually crashes — not a version mismatch (`pnpm.overrides` alone didn't fix it, confirmed by testing). Fixed by `scripts/fix-next-react-dedup.mjs`, wired as this repo's root `postinstall` script: it forces `next/node_modules/{react,react-dom}` and `styled-jsx/node_modules/react` to be the same physical directory as `apps/web/node_modules/{react,react-dom}` via a directory junction (no elevated privileges needed on Windows, a plain symlink on macOS/Linux) — a dedup, not a version change. Verified three ways: a clean `pnpm install` (confirming the postinstall hook self-heals automatically), a full `next build` (exit 0, all 13 routes + `/_not-found`), and a real `next start` serving `/login` and `/dashboard` with 200s and an unknown route with a correct 404.

## 15.5 Environment configuration

Two new variables in `.env` (already reserved as placeholders in `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Same values as `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — the same Supabase project, just Next.js's own required env-var prefix for browser-exposed values (`NEXT_PUBLIC_*`) instead of Expo's (`EXPO_PUBLIC_*`). `SUPABASE_SERVICE_ROLE_KEY` is never read by any file under `apps/web` — grep confirms zero references.

## 15.6 Running it

```
pnpm install               # also runs the postinstall react-dedup fix automatically
pnpm --filter @9thround/web dev     # local development, http://localhost:3000
pnpm --filter @9thround/web build   # production build
pnpm --filter @9thround/web start   # run the production build
```

Deployment (Vercel, or any Node host) is a normal Next.js app deploy — no Expo/Metro/ngrok/tunnel of any kind is involved anywhere in this app's stack. See the session report for the exact next steps to take it live.

## 15.7 What's not built yet

- Bilingual (Arabic/RTL) UI — see §15.3.
- In-browser photo cropping — see §15.3.
- Reports (revenue trends, exports) — honest placeholder, see §15.3.
- A QR-camera-scanning Check-In flow for the web app (mirrors the same gap already documented for mobile in [§14.6](14-reception-membership.md)) — today's web Check-In, like mobile's, is a manual button tap.
- Expenses / Other Sales screens on the web (they exist on mobile — see §14.7's sibling section once ported; this app's Phase 5 sidebar spec didn't include them, so they were deliberately left out of this slice rather than half-built).
