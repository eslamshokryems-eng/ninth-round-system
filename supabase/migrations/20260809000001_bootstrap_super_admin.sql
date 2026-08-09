-- One-time bootstrap: promote the founder's own account to super_admin.
-- Targeted by exact profile id (shown on that account's own Profile screen
-- in the Reception Web App) rather than "first user becomes admin" or any
-- other automatic rule — a real deployed platform must never auto-grant an
-- elevated role based on signup order or email pattern. See
-- docs/12-roles-and-permissions.md §12.3/§12.6: only an existing
-- super_admin can grant super_admin, so the very first one has to be
-- created this way once, out of band.
do $$
begin
  update profiles
  set role = 'super_admin'
  where id = 'aea7db27-3aaa-4701-aed2-f1b49127bdda';

  if not found then
    raise exception
      'Bootstrap super_admin: no profile found with id aea7db27-3aaa-4701-aed2-f1b49127bdda. '
      'Double-check the Account ID on the Reception Web App Profile screen and update this migration before re-running.';
  end if;
end $$;
