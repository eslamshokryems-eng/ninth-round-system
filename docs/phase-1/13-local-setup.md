# 13. Local Setup — Run 9th Round on Your iPhone with Expo Go

This is the concrete, step-by-step path from a fresh clone to the app running on a physical iPhone via Expo Go. Follow it in order — each step depends on the one before it.

> **Where this runs**: entirely on **your own computer**. A Claude Code web/remote session runs in an isolated cloud container with no network path to your iPhone (its firewall policy blocks arbitrary outbound hosts, including Supabase's and Expo's own cloud services — confirmed while preparing this guide) and no way to keep a dev server alive for your phone to reach. Everything below is written for your local machine's terminal.

## 0. Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io) installed locally.
- The **Expo Go** app installed on your iPhone from the App Store.
- Your iPhone and your computer on the **same Wi-Fi network**.
- A free [Supabase](https://supabase.com) account (no credit card required for the free tier).
- This repository cloned locally, on the `claude/9th-round-platform-architecture-1id262` branch.

## 1. Create Your Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Pick an organization, name it (e.g. `9th-round-dev`), set a database password (save it somewhere — you'll want it for step 3), pick a region close to you, and create it. Provisioning takes 1–2 minutes.
3. Once it's ready, go to **Project Settings → API**. You'll need two values from this page in step 4:
   - **Project URL** (e.g. `https://abcdefghijk.supabase.co`)
   - **anon / public** key (a long JWT-looking string)

## 2. Push the Database Schema

From the repo root, on your local machine:

```bash
npx supabase login          # opens a browser to authenticate the CLI
npx supabase link --project-ref <your-project-ref>   # the ref is the subdomain in your Project URL
npx supabase db push        # applies every migration in supabase/migrations/, in order
```

This creates all 7 migrations' worth of tables, enums, RLS policies, triggers, and functions — the 6-role model, bilingual content columns, and the AI-readiness event log — exactly as described in [Database Schema](02-database-schema.md). It also runs `supabase/seed.sql`, which populates the subscription plan catalog and exercise categories.

**Verified before you run it**: every migration file and the seed data have been applied successfully against a real Postgres engine as part of preparing this guide (via an embedded Postgres test harness, since this sandbox can't run Docker) — including a working end-to-end check that `handle_new_user()` auto-creates a profile on sign-up and that Row Level Security actually isolates one user's data from another's. See [Implementation Status §13](12-implementation-status.md) for that verification log.

## 3. Configure Auth Settings

In the Supabase dashboard, go to **Authentication → URL Configuration** and add this to **Redirect URLs**:

```
9thround://reset-password
```

This is the deep link the Forgot Password screen sends Supabase to redirect to after a password reset (`apps/mobile/app/(auth)/forgot-password.tsx`), matching the app's URL scheme (`scheme: "9thround"` in `apps/mobile/app.config.ts`).

Email/password sign-up works out of the box with Supabase's default settings — no further auth configuration is required to run the app. (Google/Apple sign-in aren't wired up yet — see [Implementation Status](12-implementation-status.md).)

## 4. Configure Environment Variables

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

Edit `apps/mobile/.env` and fill in the two values from step 1:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

Expo only auto-loads a `.env` file from the app's own directory (`apps/mobile/`), not the monorepo root — this is why the file goes there specifically. It's already gitignored; never commit it.

## 5. Install Dependencies

From the repo root:

```bash
pnpm install
```

## 6. Start the Dev Server

```bash
pnpm --filter @9thround/mobile dev
```

(equivalent to `cd apps/mobile && npx expo start`). A QR code appears in your terminal, and Metro starts bundling.

## 7. Run It on Your iPhone

1. Open the **Camera** app on your iPhone (not Expo Go directly) and point it at the QR code in your terminal.
2. Tap the notification banner that appears — it opens **Expo Go** and loads the app.
   - Alternatively: open Expo Go directly, tap "Scan QR Code," and scan it from there.
3. First load takes 10–30 seconds while Metro bundles ~1,850 modules. You should land on the **language selection** screen.

**If the QR code doesn't work** (e.g. your phone can't reach your computer — different Wi-Fi networks, a restrictive router, or a corporate VPN on either device): stop the dev server (`Ctrl+C`) and restart it with `npx expo start --tunnel` instead. This routes the connection through Expo's relay service so phone and computer don't need to be on the same network — it's slower, but works around most network restrictions. (`--tunnel` needs the `@expo/ngrok` package; Expo CLI will offer to install it automatically the first time.)

## 8. What to Expect

Walk through: language selection (try both English and Arabic — Arabic will show a "restart to apply" notice the first time, since RTL only takes effect after a full app restart; close and reopen Expo Go's connection to the app after picking Arabic) → welcome carousel → sign up with a real email and a password of 10+ characters → onboarding (name, goal, experience, body metrics) → Dashboard Home.

To confirm the backend is really connected: after signing up, check your Supabase dashboard's **Table Editor → profiles** — a new row should appear immediately (created by the `handle_new_user()` trigger), and once you finish onboarding, that row's `goal`/`experience_level`/`height_cm`/`weight_kg`/`onboarding_completed_at` columns should be filled in.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Missing Supabase configuration" error on the sign-up/login screen | `apps/mobile/.env` wasn't created, or Expo was started before it existed (restart `expo start` after creating/editing `.env` — env vars are only read at server start) |
| Expo Go shows "Something went wrong" / a red error screen | Check the terminal running `expo start` — the real error and stack trace print there, not on the phone |
| QR scan does nothing / times out | Phone and computer aren't on the same Wi-Fi, or a firewall/VPN is blocking the connection — use `--tunnel` (see step 7) |
| Sign-up succeeds but no row appears in `profiles` | The `handle_new_user()` trigger didn't run — double check `supabase db push` in step 2 completed without errors |
| Password reset email link doesn't open the app | The redirect URL from step 3 wasn't added, or was added with a typo |

## Why Expo Go (not a custom dev build)

This project targets **Expo SDK 54** specifically because the Expo Go app only supports whatever SDK(s) its current App Store build ships with — an older SDK (this project originally targeted SDK 51) silently fails to load with "incompatible" errors, but so does a *too-new* one: this project was briefly on SDK 57 (the newest published to npm) until real-device testing showed the App Store's Expo Go was still capped at SDK 54, since a new SDK's npm release and Expo Go's App Store rollout of that SDK happen at different times. If you hit an SDK-mismatch error despite following this guide, check `apps/mobile/package.json`'s `expo` version against whatever the **"What's New" version number on Expo Go's own App Store page** currently shows and let me know — the ecosystem moves fast enough that this may need adjusting again by the time you read this.

Once you've confirmed the app runs, we can go back to building more features on top of it.
