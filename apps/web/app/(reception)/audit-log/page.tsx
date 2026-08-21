"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuditLogEntry, AuditLogFilter } from "@9thround/audit";
import { useAuthStore } from "../../../src/features/auth/store";
import { getAuditModule } from "../../../src/lib/composition-root";
import { Card } from "../../../src/components/ui/card";
import { TextField } from "../../../src/components/ui/text-field";
import { SelectField } from "../../../src/components/ui/select-field";
import { Button } from "../../../src/components/ui/button";
import { translateErrorCode } from "../../../src/lib/translate-error";

const ACTIONS = [
  "login",
  "failed_login",
  "logout",
  "password_reset",
  "create_member",
  "update_member",
  "create_membership",
  "renew_membership",
  "update_membership",
  "cancel_membership",
  "create_payment",
  "check_in",
  "create_user",
  "disable_user",
  "enable_user",
  "change_role",
  "update_staff",
  "change_permissions",
  "create_lead",
  "update_lead",
  "convert_lead",
  "create_lead_followup",
  "update_lead_followup",
];

const ENTITY_TYPES = [
  "auth",
  "member",
  "membership",
  "payment",
  "check_in",
  "staff",
  "role_permissions",
  "user_permission_overrides",
  "lead",
  "lead_followup",
];

const ROLES = ["member", "coach", "reception", "sales_employee", "branch_manager", "super_admin"];

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return JSON.stringify(value, null, 2);
}

/**
 * Audit Log (docs/phase-1/17-audit-log-and-permissions.md) — Super Admin
 * only, matching the permission matrix exactly (not branch_manager). RLS
 * on admin_audit_log (has_permission('audit_logs.view')) is the real
 * gate; this page-level guard is UX only, same posture documented on
 * every other role-gated page in this app.
 */
export default function AuditLogPage() {
  const role = useAuthStore((state) => state.role);

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [actorRole, setActorRole] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const filter: AuditLogFilter = {
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(actorRole ? { actorRole } : {}),
      ...(fromDate ? { fromDate } : {}),
      ...(toDate ? { toDate: `${toDate}T23:59:59` } : {}),
    };
    const result = await getAuditModule().listAuditLog.execute(filter);
    setIsLoading(false);
    if (result.isErr) {
      setErrorMessage(translateErrorCode(result.error.code));
      return;
    }
    setEntries(result.value);
  }, [search, action, entityType, actorRole, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  if (role !== "super_admin") {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <p className="text-ink">The Audit Log is only available to Super Admin accounts.</p>
        </Card>
      </div>
    );
  }

  const selected = entries.find((entry) => entry.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Audit Log</h1>

      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <TextField label="Search" placeholder="Name, action…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <SelectField label="Action" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a.replace(/_/g, " ")}
              </option>
            ))}
          </SelectField>
          <SelectField label="Entity" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="">All entities</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </SelectField>
          <SelectField label="Role" value={actorRole} onChange={(e) => setActorRole(e.target.value)}>
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace("_", " ")}
              </option>
            ))}
          </SelectField>
          <TextField label="From" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <TextField label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </Card>

      {errorMessage ? <p className="text-sm text-red-400">{errorMessage}</p> : null}

      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-muted">No matching audit log entries.</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-white/5">
                  <td className="px-4 py-3 text-muted">{entry.occurredAt.toLocaleString()}</td>
                  <td className="px-4 py-3 text-ink">{entry.actorFullName ?? "System"}</td>
                  <td className="px-4 py-3 capitalize text-muted">{entry.actorRole?.replace("_", " ") ?? "—"}</td>
                  <td className="px-4 py-3 capitalize text-ink">{entry.action.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 capitalize text-muted">{entry.entityType.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedId(entry.id === selectedId ? null : entry.id)}
                      className="text-xs font-medium text-gold hover:text-gold-soft"
                    >
                      {entry.id === selectedId ? "Hide" : "View"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-ink">
            {selected.action.replace(/_/g, " ")} — {selected.entityType.replace(/_/g, " ")}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-muted">Previous value</p>
              <pre className="overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-muted">
                {formatValue(selected.previousValue)}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-muted">New value</p>
              <pre className="overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-ink">{formatValue(selected.newValue)}</pre>
            </div>
          </div>
          {Object.keys(selected.metadata).length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-muted">Metadata</p>
              <pre className="overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-muted">{formatValue(selected.metadata)}</pre>
            </div>
          ) : null}
          <Button variant="secondary" onClick={() => setSelectedId(null)}>
            Close
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
