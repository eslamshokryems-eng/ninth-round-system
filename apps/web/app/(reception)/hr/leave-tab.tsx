"use client";

import { useCallback, useEffect, useState } from "react";
import type { LeaveRequest } from "@9thround/hr";
import { useAuthStore } from "../../../src/features/auth/store";
import { getHrModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { Card } from "../../../src/components/ui/card";
import { Button } from "../../../src/components/ui/button";
import { TextField, TextAreaField } from "../../../src/components/ui/text-field";

const isAdmin = (role: string | null) => role === "branch_manager" || role === "super_admin";

const STATUS_CLASS: Record<LeaveRequest["status"], string> = {
  pending: "text-gold",
  approved: "text-emerald-400",
  rejected: "text-red-400",
};

export function LeaveTab() {
  const profileId = useAuthStore((state) => state.profileId);
  const branchId = useAuthStore((state) => state.branchId);
  const role = useAuthStore((state) => state.role);

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    const result = await getHrModule().listLeaveRequests.execute(branchId);
    setIsLoading(false);
    if (result.isOk) setRequests(result.value);
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit() {
    if (!profileId || !branchId) return;
    setError(null);
    setIsSubmitting(true);
    const result = await getHrModule().requestLeave.execute({ profileId, branchId, startDate, endDate, reason });
    setIsSubmitting(false);
    if (result.isOk) {
      setRequests((prev) => [result.value, ...prev]);
      setStartDate("");
      setEndDate("");
      setReason("");
    } else {
      setError(translateErrorCode(result.error.code));
    }
  }

  async function handleReview(requestId: string, decision: "approved" | "rejected") {
    if (!profileId) return;
    setPendingReviewId(requestId);
    const result = await getHrModule().reviewLeaveRequest.execute({ requestId, decision, reviewedBy: profileId });
    setPendingReviewId(null);
    if (result.isOk) {
      setRequests((prev) => prev.map((r) => (r.id === requestId ? result.value : r)));
    }
  }

  const ownRequests = requests.filter((r) => r.profileId === profileId);
  const pendingForReview = requests.filter((r) => r.status === "pending" && r.profileId !== profileId);

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Request Time Off</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Start date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <TextField label="End date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          <div className="sm:col-span-2">
            <TextAreaField label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        <Button className="mt-4" onClick={() => void handleSubmit()} isLoading={isSubmitting} disabled={!startDate || !endDate}>
          Submit Request
        </Button>
      </Card>

      {isAdmin(role) && pendingForReview.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-ink">Pending Review</h2>
          {pendingForReview.map((request) => (
            <Card key={request.id}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {request.startDate} → {request.endDate}
                  </p>
                  <p className="text-sm text-muted">{request.reason}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    isLoading={pendingReviewId === request.id}
                    onClick={() => void handleReview(request.id, "approved")}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    isLoading={pendingReviewId === request.id}
                    onClick={() => void handleReview(request.id, "rejected")}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Your Requests</h2>
        {isLoading ? (
          <p className="text-muted">Loading…</p>
        ) : ownRequests.length === 0 ? (
          <p className="text-muted">No requests yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-white/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Dates</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {ownRequests.map((request) => (
                  <tr key={request.id} className="border-t border-white/5">
                    <td className="px-4 py-3 text-ink">
                      {request.startDate} → {request.endDate}
                    </td>
                    <td className="px-4 py-3 text-muted">{request.reason}</td>
                    <td className={`px-4 py-3 font-medium capitalize ${STATUS_CLASS[request.status]}`}>
                      {request.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
