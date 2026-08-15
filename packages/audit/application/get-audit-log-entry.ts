import type { Result, UseCase } from "@9thround/shared-kernel";
import type { AuditLogEntry } from "../domain/audit-log-entry";
import type { AuditLogRepository } from "../domain/audit-log-repository";

/** Backs the Audit Log page's "open an individual event" detail view (previous/new values, metadata). */
export class GetAuditLogEntryUseCase implements UseCase<string, AuditLogEntry | null> {
  constructor(private readonly auditLog: AuditLogRepository) {}

  async execute(id: string): Promise<Result<AuditLogEntry | null>> {
    return this.auditLog.findById(id);
  }
}
