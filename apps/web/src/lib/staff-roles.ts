/** Mirrors apps/mobile/app/index.tsx's STAFF_ROLES — this app is Reception-only, so a `member`/`coach` account can sign in but has nothing here to see. */
export const STAFF_ROLES = new Set(["reception", "sales_employee", "branch_manager", "super_admin"]);

/** Sales/Leads CRM — a distinct workflow from the front desk; plain reception/coach accounts have no access (matches can_manage_leads() in supabase/migrations/20260821000001_sales_leads_crm.sql). */
export const SALES_ROLES = new Set(["sales_employee", "branch_manager", "super_admin"]);
