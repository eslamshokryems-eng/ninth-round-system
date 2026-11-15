-- LOCAL ONLY. Production has this trigger although no repository migration at 527f705 creates it (applied outside the migration
-- history; its source is 20261020000001_lead_assignment_guard.sql on the development branch). Recreated here byte-for-byte
-- (function body md5 ab01bbd9…, trigger definition md5 53b66bc8…, read-only inspection 2026-11-15) so local tests run on
-- Production's real shape.
CREATE OR REPLACE FUNCTION public.enforce_lead_assignment_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_target_branch_id uuid;
begin
  if new.assigned_to is distinct from old.assigned_to then
    if not (public.auth_role() in ('branch_manager', 'super_admin')) then
      if not (old.assigned_to is null and new.assigned_to = auth.uid()) then
        raise exception 'Only a branch manager or super admin can reassign a lead. A sales employee may only claim an unassigned lead for themselves.';
      end if;
    end if;

    if new.assigned_to is not null then
      select branch_id into v_target_branch_id from public.profiles where id = new.assigned_to;
      if v_target_branch_id is distinct from new.branch_id then
        raise exception 'Cannot assign a lead to a staff member from a different branch.';
      end if;
    end if;
  end if;

  return new;
end;
$function$;
CREATE TRIGGER trg_enforce_lead_assignment_rules BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION enforce_lead_assignment_rules();
