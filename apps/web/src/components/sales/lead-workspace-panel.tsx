"use client";

import { useCallback, useEffect, useState } from "react";
import type { InterestLevel, LeadActivity, LeadAssignmentRecord, LeadWorkspaceState } from "@9thround/sales";
import { getSalesModule } from "../../lib/composition-root";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { StatusBadge } from "../ui/status-badge";
import { TextAreaField } from "../ui/text-field";
import { InteractionForm, NextActionForm } from "./interaction-form";

const KIND_LABEL: Record<string, string> = {
  call: "Phone call", whatsapp: "WhatsApp contact", visit: "Gym visit", follow_up: "Follow-up", note: "Note", status_change: "Change",
  assignment: "Assigned", reassignment: "Reassigned", conversion: "Converted to membership",
};
const OUTCOME_LABEL: Record<string, string> = {
  no_answer: "No answer", message_sent: "Message sent", interested: "Interested", wants_visit: "Wants to visit", ready_to_join: "Ready to join",
  not_ready: "Not ready", attended_visit: "Attended a visit", no_show: "No show", not_interested: "Not interested", other: "Other",
};
const INTEREST_TONE = { hot: "danger", warm: "warning", cold: "info" } as const;
const when = (d: Date) => d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

function describe(a: LeadActivity): string {
  const d = a.detail as Record<string, string | null | undefined>;
  if (a.kind === "status_change") return d.field === "interest_level" ? `Priority ${d.from} → ${d.to}` : `Status ${d.from} → ${d.to}`;
  if (a.kind === "assignment" || a.kind === "reassignment") return `${d.from_name ?? "nobody"} → ${d.to_name ?? "nobody"}${a.note ? ` — ${a.note}` : ""}`;
  const parts = [a.outcome ? OUTCOME_LABEL[a.outcome] ?? a.outcome : null, a.note].filter(Boolean);
  return parts.join(" — ");
}

export interface LeadWorkspacePanelProps {
  leadId: string;
  leadName: string;
  /** closed leads (converted/lost) get history only, no new actions */
  isClosed: boolean;
  onChanged: () => void;
}

/** Record contact / schedule next action / priority / note + the append-only activity history and ownership history of one lead. */
export function LeadWorkspacePanel({ leadId, leadName, isClosed, onChanged }: LeadWorkspacePanelProps) {
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [assignments, setAssignments] = useState<LeadAssignmentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<"contact" | "schedule" | "note" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<LeadWorkspaceState | null>(null);
  const interestLevel: InterestLevel = state?.interestLevel ?? "warm";

  const load = useCallback(async () => {
    const [a, b, st] = await Promise.all([getSalesModule().listLeadActivities.execute(leadId), getSalesModule().listLeadAssignments.execute(leadId), getSalesModule().getLeadWorkspaceState.execute(leadId)]);
    if (st.isOk) setState(st.value);
    if (a.isErr) { setError(a.error.message); return; }
    if (b.isErr) { setError(b.error.message); return; }
    setActivities(a.value);
    setAssignments(b.value);
  }, [leadId]);

  useEffect(() => { void load(); }, [load]);

  async function finished(message: string) { setNotice(message); setMode(null); setNote(""); await load(); onChanged(); }

  async function saveNote() {
    setBusy(true); setError(null);
    const r = await getSalesModule().addLeadNote.execute({ leadId, note });
    setBusy(false);
    if (r.isErr) { setError(r.error.message); return; }
    await finished("Note added.");
  }

  async function setInterest(level: InterestLevel) {
    setBusy(true); setError(null);
    const r = await getSalesModule().setLeadInterest.execute({ leadId, level });
    setBusy(false);
    if (r.isErr) { setError(r.error.message); return; }
    await finished(`Priority set to ${level}.`);
  }

  return (
    <Card className="space-y-4" data-testid="lead-workspace-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Contact &amp; activity</h2>
        <StatusBadge label={`Priority: ${interestLevel}`} tone={INTEREST_TONE[interestLevel]} />
      </div>
      {state ? (
        <p className="text-xs text-muted">
          Last contact: {state.lastContactedAt ? when(state.lastContactedAt) : "never"} · Next action: {state.nextActionAt ? `${state.nextActionKind ?? ""} ${when(state.nextActionAt)}` : "none scheduled"}
        </p>
      ) : null}
      {!isClosed ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setMode("contact")}>Record contact</Button>
          <Button variant="secondary" onClick={() => setMode("schedule")}>Schedule follow-up</Button>
          <Button variant="ghost" onClick={() => setMode("note")}>Add note</Button>
          {(["hot", "warm", "cold"] as const).filter((l) => l !== interestLevel).map((l) => (
            <Button key={l} variant="ghost" disabled={busy} onClick={() => void setInterest(l)}>Mark {l}</Button>
          ))}
        </div>
      ) : null}
      {notice ? <p className="text-sm text-gold" role="status">{notice}</p> : null}
      {error ? <p className="text-sm text-red-400" role="alert">{error}</p> : null}
      {mode === "contact" ? <InteractionForm leadId={leadId} leadName={leadName} onDone={(m) => void finished(m)} onCancel={() => setMode(null)} /> : null}
      {mode === "schedule" ? <NextActionForm leadId={leadId} leadName={leadName} onDone={(m) => void finished(m)} onCancel={() => setMode(null)} /> : null}
      {mode === "note" ? (
        <div className="space-y-2 rounded-card border border-gold/30 bg-surface p-4">
          <TextAreaField label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2"><Button onClick={() => void saveNote()} isLoading={busy}>Save note</Button><Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button></div>
        </div>
      ) : null}

      <div className="space-y-2" data-testid="activity-history">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Activity history (cannot be edited or deleted)</p>
        {activities.length === 0 ? <p className="text-sm text-muted">No activity recorded yet.</p> : null}
        {activities.map((a) => (
          <div key={a.id} className="border-l-2 border-gold/30 pl-3 text-sm">
            <p className="text-ink">{KIND_LABEL[a.kind] ?? a.kind}{describe(a) ? ` — ${describe(a)}` : ""}</p>
            <p className="text-xs text-muted">{a.actorName ?? "—"} · {when(a.occurredAt)}{a.nextActionAt ? ` · next: ${a.nextActionKind ?? ""} ${when(a.nextActionAt)}` : ""}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2" data-testid="assignment-history">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Ownership history</p>
        {assignments.length === 0 ? <p className="text-sm text-muted">No ownership change recorded yet.</p> : null}
        {assignments.map((x) => (
          <div key={x.id} className="border-l-2 border-white/10 pl-3 text-sm">
            <p className="text-ink">{x.fromName ?? "nobody"} → {x.toName ?? "nobody"}{x.reason ? ` — ${x.reason}` : ""}</p>
            <p className="text-xs text-muted">by {x.performedByName ?? "—"} · {when(x.createdAt)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
