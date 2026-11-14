"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { LeadFollowup } from "@9thround/sales";
import { useAuthStore } from "../../../../src/features/auth/store";
import { getSalesModule } from "../../../../src/lib/composition-root";
import { translateErrorCode } from "../../../../src/lib/translate-error";
import { Button } from "../../../../src/components/ui/button";
import { Card } from "../../../../src/components/ui/card";
import { SALES_ROLES } from "../../../../src/lib/staff-roles";
import { TextField } from "../../../../src/components/ui/text-field";
import { InteractionForm, toLocalInput } from "../../../../src/components/sales/interaction-form";

type Tab = "today" | "overdue";

/** Today's/Overdue Follow-ups (Phase 6) — the Sales Dashboard's two drill-down views. */
export default function FollowupsPage() {
  const searchParams = useSearchParams();
  const role = useAuthStore((state) => state.role);
  const [tab, setTab] = useState<Tab>(searchParams.get("tab") === "overdue" ? "overdue" : "today");

  const [followups, setFollowups] = useState<LeadFollowup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async (activeTab: Tab) => {
    setIsLoading(true);
    setErrorMessage(null);
    const result =
      activeTab === "today" ? await getSalesModule().listTodaysFollowups.execute() : await getSalesModule().listOverdueFollowups.execute();
    setIsLoading(false);
    if (result.isErr) {
      setErrorMessage(translateErrorCode(result.error.code));
      return;
    }
    setFollowups(result.value);
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  const [recording, setRecording] = useState<LeadFollowup | null>(null);
  const [rescheduling, setRescheduling] = useState<LeadFollowup | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleReschedule() {
    if (!rescheduling || !rescheduleAt) return;
    setRescheduleError(null);
    const result = await getSalesModule().rescheduleFollowup.execute({ followupId: rescheduling.followupId, dueAt: new Date(rescheduleAt).toISOString() });
    if (result.isErr) {
      setRescheduleError(result.error.message || translateErrorCode(result.error.code));
      return;
    }
    setNotice(`Follow-up for ${rescheduling.leadFullName} rescheduled.`);
    setRescheduling(null);
    void load(tab);
  }

  if (!role || !SALES_ROLES.has(role)) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <p className="text-ink">Sales is only available to Sales, Branch Manager, and Super Admin accounts.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Follow-ups</h1>

      {notice ? <p className="text-sm text-gold" role="status">{notice}</p> : null}
      {recording ? (
        <InteractionForm
          leadId={recording.leadId}
          leadName={recording.leadFullName}
          onDone={(message) => {
            setNotice(message);
            setRecording(null);
            void load(tab);
          }}
          onCancel={() => setRecording(null)}
        />
      ) : null}
      {rescheduling ? (
        <Card className="space-y-3">
          <p className="text-sm text-ink">Reschedule the follow-up for {rescheduling.leadFullName}</p>
          <TextField label="New date and time" type="datetime-local" value={rescheduleAt} onChange={(e) => setRescheduleAt(e.target.value)} />
          {rescheduleError ? <p className="text-sm text-red-400" role="alert">{rescheduleError}</p> : null}
          <div className="flex gap-2">
            <Button onClick={() => void handleReschedule()} disabled={!rescheduleAt}>Save</Button>
            <Button variant="ghost" onClick={() => setRescheduling(null)}>Cancel</Button>
          </div>
        </Card>
      ) : null}

      <div className="flex gap-3">
        <Button variant={tab === "today" ? "primary" : "secondary"} onClick={() => setTab("today")}>
          Due Today
        </Button>
        <Button variant={tab === "overdue" ? "primary" : "secondary"} onClick={() => setTab("overdue")}>
          Overdue
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : errorMessage ? (
        <p className="text-red-400">{errorMessage}</p>
      ) : followups.length === 0 ? (
        <p className="text-muted">{tab === "today" ? "No follow-ups due today." : "No overdue follow-ups."}</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {followups.map((followup) => (
                <tr key={followup.followupId} className="border-t border-white/5">
                  <td className="px-4 py-3">
                    <Link href={`/sales/leads/${followup.leadId}`} className="font-medium text-ink hover:text-gold">
                      {followup.leadFullName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{followup.leadPhone}</td>
                  <td className={`px-4 py-3 ${tab === "overdue" ? "text-red-400" : "text-muted"}`}>{followup.dueAt.toLocaleString()}</td>
                  <td className="px-4 py-3 text-muted">{followup.note ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-3">
                      <button type="button" onClick={() => { setNotice(null); setRescheduling(null); setRecording(followup); }} className="text-xs font-medium text-gold hover:text-gold-soft">
                        Record contact
                      </button>
                      <button
                        type="button"
                        onClick={() => { setNotice(null); setRecording(null); setRescheduling(followup); setRescheduleAt(toLocalInput(new Date(Date.now() + 86_400_000))); }}
                        className="text-xs font-medium text-muted hover:text-ink"
                      >
                        Reschedule
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
