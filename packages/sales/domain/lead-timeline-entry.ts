/**
 * One row of a Lead's Timeline — sourced from the existing admin_audit_log
 * via the narrow get_lead_timeline() RPC (supabase/migrations/
 * 20260821000001_sales_leads_crm.sql), not a bespoke activity table. Shape
 * mirrors @9thround/audit's AuditLogEntry deliberately (same underlying
 * table), scoped to one lead only.
 */
export interface LeadTimelineEntry {
  id: string;
  action: string;
  actorRole: string | null;
  actorFullName: string | null;
  before: unknown;
  after: unknown;
  metadata: Record<string, unknown>;
  occurredAt: Date;
}
