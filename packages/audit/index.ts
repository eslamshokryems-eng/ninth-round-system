import type { TypedSupabaseClient } from "@9thround/supabase-client";
import { ListAuditLogUseCase } from "./application/list-audit-log";
import { GetAuditLogEntryUseCase } from "./application/get-audit-log-entry";
import { SupabaseAuditLogRepository } from "./infrastructure/supabase-audit-log-repository";

export type { AuditLogEntry } from "./domain/audit-log-entry";
export type { AuditLogFilter, AuditLogRepository } from "./domain/audit-log-repository";
export { ListAuditLogUseCase } from "./application/list-audit-log";
export { GetAuditLogEntryUseCase } from "./application/get-audit-log-entry";
export { SupabaseAuditLogRepository } from "./infrastructure/supabase-audit-log-repository";

/**
 * The Audit Log context's composition root — same one-entry-point shape
 * as every other context (createIdentityModule, createReceptionModule,
 * createHrModule). See docs/phase-1/17-audit-log-and-permissions.md.
 */
export function createAuditModule(client: TypedSupabaseClient) {
  const auditLogRepository = new SupabaseAuditLogRepository(client);
  return {
    listAuditLog: new ListAuditLogUseCase(auditLogRepository),
    getAuditLogEntry: new GetAuditLogEntryUseCase(auditLogRepository),
  };
}
