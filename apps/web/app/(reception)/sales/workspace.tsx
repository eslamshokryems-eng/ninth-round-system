"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { WorklistBucket, WorklistItem, WorklistSummary } from "@9thround/sales";
import { WORKLIST_BUCKET_ORDER, telLink, whatsappLink } from "@9thround/sales";
import { getSalesModule } from "../../../src/lib/composition-root";
import { Button } from "../../../src/components/ui/button";
import { Card } from "../../../src/components/ui/card";
import { EmptyState } from "../../../src/components/ui/empty-state";
import { PageHeader } from "../../../src/components/ui/page-header";
import { SkeletonCardRow } from "../../../src/components/ui/loading-skeleton";
import { StatCard } from "../../../src/components/ui/stat-card";
import { StatusBadge } from "../../../src/components/ui/status-badge";
import { TextAreaField } from "../../../src/components/ui/text-field";
import { InteractionForm, NextActionForm } from "../../../src/components/sales/interaction-form";

const BUCKET_TITLE: Record<WorklistBucket, string> = {
  overdue: "Overdue — do these first",
  due_today: "Due today",
  first_contact: "New — needs a first contact",
  ready_to_convert: "Ready to join — convert",
  hot: "Hot leads",
  awaiting_response: "Awaiting a reply",
  no_next_action: "No next action — schedule one",
  scheduled: "Scheduled later",
};
const BUCKET_TONE: Record<WorklistBucket, "danger" | "warning" | "info" | "success" | "brand" | "neutral"> = {
  overdue: "danger", due_today: "warning", first_contact: "info", ready_to_convert: "success", hot: "brand", awaiting_response: "neutral", no_next_action: "danger", scheduled: "neutral",
};
const NEXT_LABEL: Record<string, string> = { call: "Call", whatsapp: "WhatsApp", visit: "Gym visit", other: "Other" };
const SOURCE_LABEL: Record<string, string> = { walk_in: "Walk-in", phone: "Phone", facebook: "Facebook", instagram: "Instagram", referral: "Referral", website: "Website", other: "Other" };
const STATUS_LABEL: Record<string, string> = { new: "New", contacted: "Contacted", follow_up: "Follow-up" };
const INTEREST_TONE = { hot: "danger", warm: "warning", cold: "info" } as const;
const fmt = (d: Date | null) => (d ? d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—");

type Panel = { leadId: string; kind: "contact" | "schedule" | "note"; defaultKind?: "call" | "whatsapp" | "visit" } | null;

/**
 * Sales Employee Workspace (Release B): "what should I do now?". One ordered list of the employee's OWN active leads, grouped by the
 * explainable bucket the database computed, each with the reason shown. Nothing here decides who may see what: get_my_worklist() is
 * authorised by auth.uid() in the database.
 */
export function SalesWorkspace() {
  const [items, setItems] = useState<WorklistItem[]>([]);
  const [summary, setSummary] = useState<WorklistSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [noteText, setNoteText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [list, sum] = await Promise.all([getSalesModule().getMyWorklist.execute({ limit: 200 }), getSalesModule().getWorklistSummary.execute()]);
    setIsLoading(false);
    if (list.isErr) { setError(list.error.message); return; }
    if (sum.isErr) { setError(sum.error.message); return; }
    setItems(list.value);
    setSummary(sum.value);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function done(message: string) { setNotice(message); setPanel(null); setNoteText(""); await load(); }

  async function toggleHot(item: WorklistItem) {
    setBusyId(item.leadId);
    const r = await getSalesModule().setLeadInterest.execute({ leadId: item.leadId, level: item.interestLevel === "hot" ? "warm" : "hot" });
    setBusyId(null);
    if (r.isErr) { setError(r.error.message); return; }
    setNotice(item.interestLevel === "hot" ? `${item.fullName} is no longer marked hot.` : `${item.fullName} marked as a hot lead.`);
    await load();
  }

  async function saveNote(item: WorklistItem) {
    setBusyId(item.leadId);
    const r = await getSalesModule().addLeadNote.execute({ leadId: item.leadId, note: noteText });
    setBusyId(null);
    if (r.isErr) { setError(r.error.message); return; }
    await done("Note added.");
  }

  const grouped = WORKLIST_BUCKET_ORDER.map((b) => ({ bucket: b, rows: items.filter((i) => i.bucket === b) })).filter((g) => g.rows.length > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6" data-testid="sales-workspace">
      <PageHeader
        title="My Sales Workspace"
        subtitle="Your leads, ordered by what needs attention first."
        action={
          <div className="flex gap-3">
            <Link href="/sales/leads/new"><Button>+ New Lead</Button></Link>
            <Link href="/sales/leads"><Button variant="secondary">All my leads</Button></Link>
          </div>
        }
      />

      {isLoading ? (
        <SkeletonCardRow count={4} />
      ) : error ? (
        <EmptyState variant="error" message={error} actionLabel="Try Again" onAction={() => { setIsLoading(true); void load(); }} />
      ) : (
        <>
          {summary ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="workspace-summary">
              <StatCard label="Overdue" value={summary.overdue} tone="danger" />
              <StatCard label="Due today" value={summary.dueToday} tone="warning" />
              <StatCard label="New — never contacted" value={summary.newUncontacted} tone="info" />
              <StatCard label="Hot leads" value={summary.hot} tone="brand" />
              <StatCard label="No next action" value={summary.noNextAction} tone="danger" />
              <StatCard label="Contacted (7 days)" value={summary.contactedRecently} />
              <StatCard label="Awaiting a reply" value={summary.awaitingResponse} />
              <StatCard label="Ready to convert" value={summary.readyToConvert} tone="success" />
              <StatCard label="Converted (30 days)" value={summary.recentlyConverted} tone="success" />
              <StatCard label="Active leads" value={summary.totalActive} tone="info" />
            </div>
          ) : null}
          {notice ? <p className="text-sm text-gold" role="status">{notice}</p> : null}

          {grouped.length === 0 ? (
            <EmptyState variant="empty" message="Nothing needs your attention. Add a lead or ask your manager to assign leads to you." />
          ) : (
            grouped.map((g) => (
              <section key={g.bucket} className="space-y-3" data-testid={`bucket-${g.bucket}`}>
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-ink">{BUCKET_TITLE[g.bucket]}</h2>
                  <StatusBadge label={String(g.rows.length)} tone={BUCKET_TONE[g.bucket]} />
                </div>
                {g.rows.map((item) => {
                  const wa = whatsappLink(item.phone);
                  const tel = telLink(item.phone);
                  const open = panel?.leadId === item.leadId ? panel : null;
                  return (
                    <Card key={item.leadId} className="space-y-3" data-testid="lead-card">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <Link href={`/sales/leads/${item.leadId}`} className="text-base font-semibold text-ink hover:text-gold">{item.fullName}</Link>
                          <p className="text-sm text-muted">{item.phone} · {SOURCE_LABEL[item.source] ?? item.source}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge label={STATUS_LABEL[item.status] ?? item.status} tone="neutral" />
                          <StatusBadge label={`Priority: ${item.interestLevel}`} tone={INTEREST_TONE[item.interestLevel]} />
                        </div>
                      </div>
                      <p className="text-sm font-medium text-gold">{item.reason}</p>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-4">
                        <div><dt>Assigned to</dt><dd className="text-ink">{item.ownerName ?? "—"}</dd></div>
                        <div><dt>Last contact</dt><dd className="text-ink">{fmt(item.lastContactedAt)}{item.daysSinceContact != null ? ` (${item.daysSinceContact} day(s) ago)` : ""}</dd></div>
                        <div><dt>Next action</dt><dd className="text-ink">{item.nextActionKind ? NEXT_LABEL[item.nextActionKind] : "None"}</dd></div>
                        <div><dt>Next follow-up</dt><dd className="text-ink">{fmt(item.nextActionAt)}</dd></div>
                      </dl>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/sales/leads/${item.leadId}`}><Button variant="ghost">Open lead</Button></Link>
                        {tel ? <a href={tel}><Button variant="secondary" type="button">Call customer</Button></a> : null}
                        {wa ? <a href={wa} target="_blank" rel="noopener noreferrer"><Button variant="secondary" type="button">Open WhatsApp</Button></a> : null}
                        <Button onClick={() => setPanel({ leadId: item.leadId, kind: "contact" })}>Record contact</Button>
                        <Button variant="secondary" onClick={() => setPanel({ leadId: item.leadId, kind: "schedule" })}>Schedule follow-up</Button>
                        <Button variant="ghost" onClick={() => setPanel({ leadId: item.leadId, kind: "note" })}>Add note</Button>
                        <Button variant="ghost" isLoading={busyId === item.leadId} onClick={() => void toggleHot(item)}>
                          {item.interestLevel === "hot" ? "Unmark hot" : "Mark as hot"}
                        </Button>
                        {item.bucket === "ready_to_convert" ? (
                          <Link href={`/sales/leads/${item.leadId}`}><Button variant="secondary">Convert to membership</Button></Link>
                        ) : null}
                      </div>
                      {wa ? <p className="text-xs text-muted">“Open WhatsApp” only opens the chat. After you reply, press “Record contact” — the system never sends messages.</p> : null}
                      {open?.kind === "contact" ? (
                        <InteractionForm leadId={item.leadId} leadName={item.fullName} onDone={(m) => void done(m)} onCancel={() => setPanel(null)} />
                      ) : null}
                      {open?.kind === "schedule" ? (
                        <NextActionForm leadId={item.leadId} leadName={item.fullName} onDone={(m) => void done(m)} onCancel={() => setPanel(null)} />
                      ) : null}
                      {open?.kind === "note" ? (
                        <div className="space-y-2 rounded-card border border-gold/30 bg-surface p-4">
                          <TextAreaField label="Note" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                          <div className="flex gap-2">
                            <Button onClick={() => void saveNote(item)} isLoading={busyId === item.leadId}>Save note</Button>
                            <Button variant="ghost" onClick={() => setPanel(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : null}
                    </Card>
                  );
                })}
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}
