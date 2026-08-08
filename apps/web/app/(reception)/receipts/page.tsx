"use client";

import { useCallback, useEffect, useState } from "react";
import type { Receipt } from "@9thround/reception";
import { useAuthStore } from "../../../src/features/auth/store";
import { getReceptionModule } from "../../../src/lib/composition-root";

/** Receipts (Phase 5, "Payments / Receipts") — a read-only, chronological view of every membership payment, real data from membership_payments. */
export default function ReceiptsPage() {
  const branchId = useAuthStore((state) => state.branchId);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    setErrorMessage(null);
    const result = await getReceptionModule().listReceipts.execute(branchId);
    setIsLoading(false);
    if (result.isErr) {
      setErrorMessage("Could not load receipts.");
      return;
    }
    setReceipts(result.value);
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Payments / Receipts</h1>

      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : errorMessage ? (
        <p className="text-red-400">{errorMessage}</p>
      ) : receipts.length === 0 ? (
        <p className="text-muted">No receipts yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Receipt #</th>
                <th className="px-4 py-3">Membership #</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt.paymentId} className="border-t border-white/5">
                  <td className="px-4 py-3 text-muted">{receipt.paymentDate}</td>
                  <td className="px-4 py-3 text-ink">{receipt.memberFullName}</td>
                  <td className="px-4 py-3 text-muted">{receipt.receiptNumber}</td>
                  <td className="px-4 py-3 text-muted">{receipt.membershipNumber}</td>
                  <td className="px-4 py-3 text-muted capitalize">{receipt.paymentMethod.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-right font-medium text-gold">{receipt.amount.toLocaleString()} EGP</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
