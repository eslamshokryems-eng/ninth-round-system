# 19. Attendance History

"How many times has this member attended?" — a new **Attendance**
section on the Member Detail page, showing the total visit count and a
date/time list of every check-in, most recent first.

## Why no migration

`check_ins` (`supabase/migrations/20260806000006_check_ins.sql`) and its
RLS (`branch staff read check-ins`, `is_branch_staff(branch_id)`) already
existed and already allow exactly the read this needs — the app just
never had a *list* use case for it, only the write side (`Check In`
button → `check_in_member()`). This is a pure application-layer addition:
`ListCheckInsForMemberUseCase` / `CheckInRepository.listByMember()` /
`SupabaseCheckInRepository.listByMember()`, following the same
port/adapter shape as every other read in `packages/reception`.

## Scope

- Capped at the 500 most recent visits per member (matches this app's
  other list caps, e.g. `members.list()`'s 200) — `check_ins` is
  append-only and grows forever; nothing currently needs more than "how
  many/when," so an unbounded fetch isn't warranted.
- "Checked In By" shows the staff member who ran the Check In action —
  always populated in practice, since there's only one check-in path in
  this app (Reception's Check In button); shown as "—" if ever absent.
- The count refreshes immediately after a new check-in on the same page,
  not just on next page load.

## A note on the embed

`checked_in_by` (the FK on `check_ins` pointing at `profiles`) is a
to-one embed — see docs/phase-1/17's fix and the comment in
`supabase-check-in-repository.ts` for why this is read as a plain object,
not indexed with `[0]`, and why the result is cast past supabase-js's
own unreliable inferred type for it.
