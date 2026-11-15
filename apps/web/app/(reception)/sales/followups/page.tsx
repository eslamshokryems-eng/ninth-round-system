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

  async function handleComplete(followupId: string) {
    await getSalesModule().completeFollowup.execute({ followupId, note: null });
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
                    <button type="button" onClick={() => void handleComplete(followup.followupId)} className="text-xs font-medium text-gold hover:text-gold-soft">
                      Complete
                    </button>
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
