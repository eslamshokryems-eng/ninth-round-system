# Auth

**Phase:** 1 — implemented (email/password; Google/Apple sign-in not yet added)

Sign up, log in, forgot password, session bootstrap, and sign-out, backed by `@9thround/identity`'s use cases — no direct Supabase calls from this feature (see `src/lib/composition-root.ts`).

- `store.ts` — `useAuthStore`, the routing-relevant session state (docs/phase-1/08-state-management.md §8.2).
- `use-auth-bootstrap.ts` — mounted once at the app root; resolves the initial session and subscribes to auth state changes.

Screens: `app/(auth)/sign-up.tsx`, `log-in.tsx`, `forgot-password.tsx`.
