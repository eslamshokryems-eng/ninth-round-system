/**
 * A single row of `admin_audit_log` (supabase/migrations/20260801000007_
 * notifications_and_audit.sql, extended by 20260815000001_audit_log.sql).
 * Read-only by design — there is no `save()`/mutation method anywhere in
 * this context, matching the database's own append-only guarantee (no
 * UPDATE/DELETE policy exists on admin_audit_log; every row is written by
 * a SECURITY DEFINER function, never by this app directly). See
 * docs/phase-1/17-audit-log-and-permissions.md.
 */
export interface AuditLogEntry {
  id: string;
  occurredAt: Date;
  actorId: string | null;
  actorRole: string | null;
  actorFullName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  previousValue: unknown;
  newValue: unknown;
  metadata: Record<string, unknown>;
}
