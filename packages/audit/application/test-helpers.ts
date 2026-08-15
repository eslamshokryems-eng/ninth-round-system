import { ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { AuditLogEntry } from "../domain/audit-log-entry";
import type { AuditLogFilter, AuditLogRepository } from "../domain/audit-log-repository";

export class InMemoryAuditLogRepository implements AuditLogRepository {
  entries: AuditLogEntry[] = [];

  async list(filter: AuditLogFilter): Promise<Result<AuditLogEntry[]>> {
    let results = this.entries;
    if (filter.actorId) results = results.filter((e) => e.actorId === filter.actorId);
    if (filter.actorRole) results = results.filter((e) => e.actorRole === filter.actorRole);
    if (filter.action) results = results.filter((e) => e.action === filter.action);
    if (filter.entityType) results = results.filter((e) => e.entityType === filter.entityType);
    return ok(results);
  }

  async findById(id: string): Promise<Result<AuditLogEntry | null>> {
    return ok(this.entries.find((e) => e.id === id) ?? null);
  }
}

export function buildAuditLogEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: "log-1",
    occurredAt: new Date("2026-08-15T10:00:00Z"),
    actorId: "actor-1",
    actorRole: "reception",
    actorFullName: "Reception Test",
    action: "create_member",
    entityType: "member",
    entityId: "member-1",
    previousValue: null,
    newValue: { full_name: "Test Member" },
    metadata: {},
    ...overrides,
  };
}
