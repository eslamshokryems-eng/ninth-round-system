import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { AdminAuditLogRow } from "@9thround/database-types";
import type { AuditLogEntry } from "../domain/audit-log-entry";
import type { AuditLogFilter, AuditLogRepository } from "../domain/audit-log-repository";

function rowToEntry(row: AdminAuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    occurredAt: new Date(row.created_at),
    actorId: row.admin_id,
    actorRole: row.actor_role,
    actorFullName: row.actor_full_name,
    action: row.action,
    entityType: row.target_table,
    entityId: row.target_id,
    previousValue: row.before,
    newValue: row.after,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}

const DEFAULT_LIMIT = 200;

/**
 * RLS on `admin_audit_log` (has_permission('audit_logs.view'), super_admin
 * by default) is the real gate — this repository issues the same query
 * for every caller and simply gets back whatever rows RLS allows, same
 * pattern as every other repository in this app.
 */
export class SupabaseAuditLogRepository implements AuditLogRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async list(filter: AuditLogFilter): Promise<Result<AuditLogEntry[]>> {
    let query = this.client
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(filter.limit ?? DEFAULT_LIMIT);

    if (filter.actorId) query = query.eq("admin_id", filter.actorId);
    if (filter.actorRole) query = query.eq("actor_role", filter.actorRole);
    if (filter.action) query = query.eq("action", filter.action);
    if (filter.entityType) query = query.eq("target_table", filter.entityType);
    if (filter.fromDate) query = query.gte("created_at", filter.fromDate);
    if (filter.toDate) query = query.lte("created_at", filter.toDate);
    if (filter.search) {
      const term = filter.search.replace(/[%,]/g, "");
      query = query.or(`actor_full_name.ilike.%${term}%,action.ilike.%${term}%,target_table.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) return err(domainError("AUDIT_LOG_LIST_FAILED", error.message));
    return ok((data ?? []).map(rowToEntry));
  }

  async findById(id: string): Promise<Result<AuditLogEntry | null>> {
    const { data, error } = await this.client.from("admin_audit_log").select("*").eq("id", id).maybeSingle();
    if (error) return err(domainError("AUDIT_LOG_FETCH_FAILED", error.message));
    return ok(data ? rowToEntry(data) : null);
  }
}
