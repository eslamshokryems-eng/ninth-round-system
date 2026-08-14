# 16. Employee ID Login

Add Employee (HR's Employees tab / Manage Staff) no longer asks for an email or password — just name, phone, address, and role. Every staff account now has a real, human-readable **Employee ID** (`EMP-000001`, sequential — mirrors `members.member_code`'s pattern exactly, [§14.3](14-reception-membership.md)), and logging in uses that ID instead of an email address.

```
Reception computer → Login screen (Employee ID + password) → resolve ID to the account's real/synthetic email → existing email+password sign-in, unchanged
```

## 16.1 Why login didn't actually change underneath

Supabase Auth's password sign-in is fundamentally email+password — there's no separate "sign in by arbitrary ID" primitive. Rather than replace that mechanism, the Employee ID is a friendly alias resolved to an email *before* the existing, already-tested `SignInUseCase`/`AuthPort.signInWithEmail` runs — those are completely unchanged, and so is `apps/mobile`'s login (members still use their own email there; this is a web/staff-only concern).

`resolve_login_email(employee_code)` (`supabase/migrations/20260812000001_employee_login.sql`) is a `SECURITY DEFINER` SQL function, callable by `anon` (the caller isn't authenticated yet at login time — same reasoning as `reception_member_lookup`), that returns exactly one thing: the email an Employee ID's account was created with. Nothing else about the account is exposed. Employee IDs aren't secret (spoken aloud, written down) — this is the same category of exposure as any "username or email" login field, not a new one.

**Safety net, not a compromise on the request:** the login field is labeled "Employee ID" and that's the only thing anyone is told to type. But if the text contains `@`, the app treats it as a literal email and skips the resolve step, signing in with it directly. This means every account that existed before this feature — including the founder's own, actively-used-in-production `super_admin` account — was never at risk of being locked out by a bug in the new resolution path; it's an invisible fallback, not a second visible login mode.

## 16.2 Two-step account creation

1. **Add Employee** (`POST /api/staff/create-account`) — takes `fullName`, `phone`, `address` (optional), `role`, `branchId`. Generates a real Employee ID (`next_employee_code()`), creates the `auth.users` row behind a synthetic email (`emp-000001@staff.9thround.internal`) and a random 64-character password that is **never shown or logged anywhere** — the account exists (so Schedule/Attendance/Leave/Payroll can reference its `profile_id` immediately) but is not usable to sign in yet.
2. **Set Password** (`POST /api/staff/set-password`) — an admin picks the employee (reusing `StaffPicker`, the same search-by-name component Manage Staff/Payroll use) and sets a real password via the Admin API (`auth.admin.updateUserById`). *This* is what actually enables login. Can be run immediately after step 1, or any time later (also doubles as a password-reset action for an existing employee).

Both routes share `apps/web/src/lib/verify-staff-admin.ts` — the same caller-identity-from-access-token verification pattern as the original single-step `create-account` route, now factored out since two routes need it.

## 16.3 Schema

`profiles` gained three columns (`supabase/migrations/20260812000001_employee_login.sql`): `phone`, `address` (new — profiles never had either before; unrelated to `members.phone`/`members`' own contact fields, a completely separate table), and `employee_code` (unique, backfilled for every existing non-`member` profile in signup order at migration time — including whichever account runs the migration).

Verified against a real Postgres engine (pglite, same methodology as §14.3/§16 predecessors): the backfill assigns every existing staff profile a unique code, `next_employee_code()` issues fresh non-repeating codes, and `resolve_login_email()` correctly resolves a valid Employee ID to its email as the unauthenticated `anon` role while returning `null` (not an error) for an unknown one.

## 16.4 What's not built

- No self-service "employee sets their own first password" flow — an admin always runs Set Password.
- No password-strength requirements beyond the existing 6-character minimum used elsewhere in this app.
