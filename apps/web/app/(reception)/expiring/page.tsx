"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ExpiringMembership } from "@9thround/reception";
import { useAuthStore } from "../../../src/features/auth/store";
import { getReceptionModule } from "../../../src/lib/composition-root";

function daysRemaining(endDate: string): number {
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/** Expiring (Phase 5) — every active membership ending within 7 days, real data (matches the Dashboard's "Expiring This Week" count). */
export default function ExpiringPage() {
  const branchId = useAuthStore((state) => state.branchId);
  const [memberships, setMemberships] = useState<ExpiringMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    setErrorMessage(null);
    const result = await getReceptionModule().listExpiringMemberships.execute(branchId);
    setIsLoading(false);
    if (result.isErr) {
      setErrorMessage("Could not load expiring memberships.");
      return;
    }
    setMemberships(result.value);
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Expiring This Week</h1>

      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : errorMessage ? (
        <p className="text-red-400">{errorMessage}</p>
      ) : memberships.length === 0 ? (
        <p className="text-muted">No memberships expiring in the next 7 days.</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Membership #</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Days Left</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((membership) => {
                const remaining = daysRemaining(membership.endDate);
                return (
                  <tr key={membership.membershipId} className="border-t border-white/5">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{membership.memberFullName}</p>
                      <p className="text-xs text-muted">{membership.memberPhone}</p>
                    </td>
                    <td className="px-4 py-3 text-muted">{membership.membershipNumber}</td>
                    <td className="px-4 py-3 text-muted">{membership.endDate}</td>
                    <td className={`px-4 py-3 font-medium ${remaining <= 3 ? "text-red-400" : "text-gold"}`}>
                      {remaining <= 0 ? "Today" : `${remaining} day${remaining === 1 ? "" : "s"}`}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/members/${membership.memberId}?action=renew`} className="text-xs font-medium text-gold hover:text-gold-soft">
                        Renew
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
