"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { AttentionKind, AttentionLead, TeamEmployeeRow, TeamSummary, WorklistItem } from "@9thround/sales";
import { needsSupport } from "@9thround/sales";
import { useAuthStore } from "../../../../src/features/auth/store";
import { getSalesModule } from "../../../../src/lib/composition-root";
import { Button } from "../../../../src/components/ui/button";
import { Card } from "../../../../src/components/ui/card";
import { EmptyState } from "../../../../src/components/ui/empty-state";
import { PageHeader } from "../../../../src/components/ui/page-header";
import { SelectField } from "../../../../src/components/ui/select-field";
import { SkeletonCardRow } from "../../../../src/components/ui/loading-skeleton";
import { StatCard } from "../../../../src/components/ui/stat-card";
import { StatusBadge } from "../../../../src/components/ui/status-badge";
import { TextAreaField, TextField } from "../../../../src/components/ui/text-field";

const KINDS: { key: AttentionKind; label: string; hint: string }[] = [
  { key: "overdue", label: "Overdue", hint: "Leads with a follow-up that is past due (each lead counted once)." },
  { key: "no_next_action", label: "No next action", hint: "Active leads with no follow-up scheduled — they will not appear in anybody's worklist as due." },
  { key: "no_recent_contact", label: "No recent contact", hint: "Last contact (or creation, if never contacted) is more than 7 days ago." },
  { key: "unassigned", label: "Unassigned inbox", hint: "Leads nobody owns. Only managers can see them — assign them to a specific employee." },
];
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const fmt = (d: Date | null) => (d ? d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—");

/**
 * Sales Manager Dashboard (Release C part 1) — read-only metrics + neglected-lead lists + assignment. Every number comes from a database
 * function that authorises by role and branch (a manager sees only their branch); this screen decides nothing.
 */
export default function SalesTeamPage() {
  const role = useAuthStore((s) => s.role);
  const allowed = role === "branch_manager" || role === "super_admin";
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [summary, setSummary] = useState<TeamSummary | null>(null);
  const [rows, setRows] = useState<TeamEmployeeRow[]>([]);
  const [kind, setKind] = useState<AttentionKind>("overdue");
  const [owner, setOwner] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [leads, setLeads] = useState<AttentionLead[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState("");
  const [reason, setReason] = useState("");
  const [worklist, setWorklist] = useState<{ name: string; items: WorklistItem[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const period = useMemo(() => ({ branchId: null, startDate: startDate || undefined, endDate: endDate || undefined }), [startDate, endDate]);

  const load = useCallback(async () => {
    if (!allowed) return;
    setError(null);
    const [s, o, l] = await Promise.all([
      getSalesModule().getTeamSummary.execute(period),
      getSalesModule().getTeamOverview.execute(period),
      getSalesModule().listAttentionLeads.execute({ ...period, kind, ownerId: owner || null, limit: 200 }),
    ]);
    setIsLoading(false);
    if (s.isErr) { setError(s.error.message); return; }
    if (o.isErr) { setError(o.error.message); return; }
    if (l.isErr) { setError(l.error.message); return; }
    setSummary(s.value); setRows(o.value); setLeads(l.value); setSelected(new Set());
  }, [allowed, period, kind, owner]);

  useEffect(() => { void load(); }, [load]);

  if (!allowed) {
    return <div className="mx-auto max-w-2xl"><Card><p className="text-ink">The team dashboard is available to Branch Managers and Super Admin only.</p></Card></div>;
  }

  const employees = rows.filter((r) => r.employeeId);
  const visible = leads.filter((l) => (!statusFilter || l.status === statusFilter) && (!sourceFilter || l.source === sourceFilter));
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function assign() {
    setBusy(true); setError(null); setNotice(null);
    const r = await getSalesModule().assignLeads.execute({ leadIds: [...selected], newOwnerId: assignTo, reason });
    setBusy(false);
    if (r.isErr) { setError(r.error.message); return; }
    setNotice(`${r.value} lead(s) assigned. The change is recorded in each lead's ownership history.`);
    setReason(""); setAssignTo("");
    await load();
  }

  async function showWorklist(row: TeamEmployeeRow) {
    if (!row.employeeId) return;
    const r = await getSalesModule().getMyWorklist.execute({ ownerId: row.employeeId, limit: 30 });
    if (r.isErr) { setError(r.error.message); return; }
    setWorklist({ name: row.employeeName, items: r.value });
  }

  const current = KINDS.find((k) => k.key === kind)!;

  return (
    <div className="mx-auto max-w-6xl space-y-6" data-testid="team-dashboard">
      <PageHeader title="Sales Team" subtitle="Workload, discipline and conversion for your branch." action={<Link href="/sales"><Button variant="secondary">Branch dashboard</Button></Link>} />

      <Card className="grid gap-3 sm:grid-cols-3">
        <TextField label="From (blank = this month)" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <TextField label="To" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <p className="self-end text-xs text-muted">Dates are Cairo calendar days. Period numbers: new leads, contacts recorded, converted, lost.</p>
      </Card>

      {isLoading ? <SkeletonCardRow count={4} /> : null}
      {error ? <EmptyState variant="error" message={error} actionLabel="Try Again" onAction={() => void load()} /> : null}

      {summary ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="team-summary">
            <StatCard label="Active leads" value={summary.activeLeads} tone="info" />
            <StatCard label="Unassigned" value={summary.unassignedLeads} tone="warning" />
            <StatCard label="New in period" value={summary.newInPeriod} tone="brand" />
            <StatCard label="Due today" value={summary.dueToday} tone="warning" />
            <StatCard label="Overdue leads" value={summary.overdueLeads} tone="danger" />
            <StatCard label="Hot leads" value={summary.hotLeads} tone="brand" />
            <StatCard label="No next action" value={summary.noNextAction} tone="danger" />
            <StatCard label="No recent contact (7d+)" value={summary.noRecentContact} tone="danger" />
            <StatCard label="Contacts recorded" value={summary.interactionsInPeriod} />
            <StatCard label="Converted" value={summary.convertedInPeriod} tone="success" />
          </div>
          <Card className="space-y-1 text-sm">
            <p>Lost in period: <span className="text-ink">{summary.lostInPeriod}</span></p>
            <p>Conversion rate (decided): <span className="font-semibold text-gold">{pct(summary.conversionRateDecided)}</span> <span className="text-xs text-muted">= converted ÷ (converted + lost) among leads decided in the period</span></p>
            <p>Conversion rate (cohort): <span className="font-semibold text-gold">{pct(summary.conversionRateCohort)}</span> <span className="text-xs text-muted">= converted ÷ leads created in the period</span></p>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">Team workload</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="team-table">
                <thead className="text-xs text-muted"><tr>
                  <th className="px-2 py-2">Employee</th><th className="px-2">Active</th><th className="px-2">Overdue</th><th className="px-2">Due today</th><th className="px-2">Hot</th>
                  <th className="px-2">No next action</th><th className="px-2">No contact 7d+</th><th className="px-2">Contacts</th><th className="px-2">Converted</th><th className="px-2">Lost</th><th className="px-2" />
                </tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const flags = needsSupport(r);
                    return (
                      <tr key={r.employeeId ?? "unassigned"} className="border-t border-white/5">
                        <td className="px-2 py-2 text-ink">{r.employeeName}{flags.length ? <div className="mt-1"><StatusBadge label={`Needs support: ${flags.join("; ")}`} tone="warning" /></div> : null}</td>
                        <td className="px-2">{r.activeLeads}</td><td className="px-2 text-danger">{r.overdueLeads}</td><td className="px-2">{r.dueToday}</td><td className="px-2">{r.hotLeads}</td>
                        <td className="px-2">{r.noNextAction}</td><td className="px-2">{r.noRecentContact}</td><td className="px-2">{r.interactionsInPeriod}</td><td className="px-2">{r.convertedInPeriod}</td><td className="px-2">{r.lostInPeriod}</td>
                        <td className="px-2">{r.employeeId ? <Button variant="ghost" onClick={() => void showWorklist(r)}>Worklist</Button> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {worklist ? (
            <Card className="space-y-2" data-testid="employee-worklist">
              <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-ink">{worklist.name}&apos;s worklist (top {worklist.items.length})</h2><Button variant="ghost" onClick={() => setWorklist(null)}>Close</Button></div>
              {worklist.items.length === 0 ? <p className="text-sm text-muted">No active leads.</p> : worklist.items.map((i) => (
                <p key={i.leadId} className="text-sm"><Link href={`/sales/leads/${i.leadId}`} className="text-ink hover:text-gold">{i.fullName}</Link> <span className="text-muted">— {i.reason}</span></p>
              ))}
            </Card>
          ) : null}

          <Card className="space-y-4">
            <div className="flex flex-wrap gap-2" role="tablist">
              {KINDS.map((k) => (
                <Button key={k.key} variant={kind === k.key ? "primary" : "secondary"} role="tab" aria-selected={kind === k.key} onClick={() => setKind(k.key)}>{k.label}</Button>
              ))}
            </div>
            <p className="text-xs text-muted">{current.hint}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField label="Employee" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="">All employees</option>
                {employees.map((e) => <option key={e.employeeId} value={e.employeeId ?? ""}>{e.employeeName}</option>)}
              </SelectField>
              <SelectField label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Any status</option><option value="new">New</option><option value="contacted">Contacted</option><option value="follow_up">Follow-up</option>
              </SelectField>
              <SelectField label="Source" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="">Any source</option>
                {["walk_in", "phone", "facebook", "instagram", "referral", "website", "other"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </SelectField>
            </div>
            {visible.length === 0 ? <p className="text-sm text-muted" data-testid="attention-empty">Nothing here.</p> : (
              <div className="space-y-2" data-testid="attention-list">
                {visible.map((l) => (
                  <label key={l.leadId} className="flex cursor-pointer items-start gap-3 rounded-card border border-white/5 p-3 text-sm">
                    <input type="checkbox" className="mt-1" checked={selected.has(l.leadId)} onChange={() => toggle(l.leadId)} aria-label={`Select ${l.fullName}`} />
                    <span className="flex-1">
                      <Link href={`/sales/leads/${l.leadId}`} className="font-semibold text-ink hover:text-gold">{l.fullName}</Link>
                      <span className="text-muted"> · {l.phone} · {l.status.replace("_", " ")} · priority {l.interestLevel} · owner {l.ownerName ?? "none"}</span>
                      <span className="block text-xs text-muted">Last contact: {fmt(l.lastContactedAt)}{l.daysSinceContact != null ? ` (${l.daysSinceContact}d ago)` : ""} · next follow-up: {fmt(l.nextActionAt)}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div className="space-y-3 rounded-card border border-gold/30 bg-surface p-4">
              <p className="text-sm font-semibold text-ink">Assign / reassign the {selected.size} selected lead(s)</p>
              <SelectField label="New owner (a specific employee)" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                <option value="">Choose an employee…</option>
                {employees.map((e) => <option key={e.employeeId} value={e.employeeId ?? ""}>{e.employeeName}</option>)}
              </SelectField>
              <TextAreaField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button onClick={() => void assign()} isLoading={busy} disabled={selected.size === 0 || !assignTo || !reason.trim()}>Assign</Button>
              {notice ? <p className="text-sm text-gold" role="status">{notice}</p> : null}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
