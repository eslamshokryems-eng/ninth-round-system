import type { Result, UseCase } from "@9thround/shared-kernel";
import type { AuditLogEntry } from "../domain/audit-log-entry";
import type { AuditLogFilter, AuditLogRepository } from "../domain/audit-log-repository";

/**
 * Backs the Audit Log admin page's list/search/filter view. Authorization
 * is not re-checked here — same posture as the rest of this app's
 * read-heavy use cases (e.g. ListReceiptsByDateRangeUseCase): the real
 * gate is `admin_audit_log`'s RLS policy (has_permission('audit_logs.view'),
 * super_admin by default), so a non-authorized caller gets back an empty
 * list, not a bypassable "you're not allowed" check this layer could get
 * wrong. UI-level page and nav gating exist purely as UX, documented as
 * such.
 */
export class ListAuditLogUseCase implements UseCase<AuditLogFilter, AuditLogEntry[]> {
  constructor(private readonly auditLog: AuditLogRepository) {}

  async execute(input: AuditLogFilter): Promise<Result<AuditLogEntry[]>> {
    return this.auditLog.list(input);
  }
}
