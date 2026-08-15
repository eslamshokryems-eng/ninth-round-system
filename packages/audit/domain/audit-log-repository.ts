import type { Result } from "@9thround/shared-kernel";
import type { AuditLogEntry } from "./audit-log-entry";

/**
 * All filters are optional and AND-combined. `search` matches against
 * actor name/action/entity type (see infrastructure/supabase-audit-log-
 * repository.ts for the exact match) — a plain free-text box is what the
 * Audit Log page's spec actually asks for ("search logs"), on top of the
 * more structured filters ("filter by user/role/action/entity/date").
 */
export interface AuditLogFilter {
  actorId?: string;
  actorRole?: string;
  action?: string;
  entityType?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  limit?: number;
}

export interface AuditLogRepository {
  list(filter: AuditLogFilter): Promise<Result<AuditLogEntry[]>>;
  findById(id: string): Promise<Result<AuditLogEntry | null>>;
}
