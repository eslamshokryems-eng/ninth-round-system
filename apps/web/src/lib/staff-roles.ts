/** Mirrors apps/mobile/app/index.tsx's STAFF_ROLES — this app is Reception-only, so a `member`/`coach` account can sign in but has nothing here to see. */
export const STAFF_ROLES = new Set(["reception", "branch_manager", "super_admin"]);
