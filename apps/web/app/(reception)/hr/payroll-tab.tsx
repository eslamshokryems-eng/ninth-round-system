"use client";

import { useCallback, useEffect, useState } from "react";
import type { PayrollEntry } from "@9thround/hr";
import type { StaffCandidate } from "@9thround/identity";
import { useAuthStore } from "../../../src/features/auth/store";
import { getHrModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { Card } from "../../../src/components/ui/card";
import { Button } from "../../../src/components/ui/button";
import { TextField } from "../../../src/components/ui/text-field";
import { StaffPicker } from "../../../src/components/staff-picker";

const today = new Date().toISOString().slice(0, 10);

/** super_admin only, enforced both by the page (parent) and the database — see supabase/migrations/20260811000001_hr_system.sql. */
export function PayrollTab() {
  const branchId = useAuthStore((state) => state.branchId);

  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedStaff, setSelectedStaff] = useState<StaffCandidate | null>(null);
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    const result = await getHrModule().listPayroll.execute(branchId);
    setIsLoading(false);
    if (result.isOk) setEntries(result.value);
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSetSalary() {
    if (!branchId || !selectedStaff) return;
    setError(null);
    setSuccessMessage(null);
    const amount = Number(monthlyAmount);
    if (Number.isNaN(amount)) {
      setError("Enter a valid amount.");
      return;
    }
    setIsSaving(true);
    const result = await getHrModule().setSalary.execute({
      profileId: selectedStaff.profileId,
      branchId,
      monthlyAmount: amount,
      effectiveFrom,
    });
    setIsSaving(false);
    if (result.isOk) {
      setSuccessMessage(`Salary set for ${selectedStaff.fullName ?? "employee"}.`);
      setSelectedStaff(null);
      setMonthlyAmount("");
      void load();
    } else {
      setError(translateErrorCode(result.error.code));
    }
  }

  const totalMonthly = entries.reduce((sum, e) => sum + e.monthlyAmount, 0);

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Set Salary</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <StaffPicker selected={selectedStaff} onSelect={setSelectedStaff} />
          </div>
          <TextField
            label="Monthly amount (EGP)"
            type="number"
            min={0}
            value={monthlyAmount}
            onChange={(event) => setMonthlyAmount(event.target.value)}
          />
          <TextField
            label="Effective from"
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </div>
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        {successMessage ? <p className="mt-3 text-sm text-emerald-400">{successMessage}</p> : null}
        <Button className="mt-4" onClick={() => void handleSetSalary()} isLoading={isSaving} disabled={!selectedStaff || !monthlyAmount}>
          Save
        </Button>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Current Payroll</h2>
          <p className="text-sm text-muted">
            Total: <span className="font-semibold text-gold">{totalMonthly.toLocaleString()} EGP/month</span>
          </p>
        </div>
        {isLoading ? (
          <p className="text-muted">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-muted">No salaries set yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-white/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Effective From</th>
                  <th className="px-4 py-3 text-right">Monthly</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-t border-white/5">
                    <td className="px-4 py-3 text-ink">{entry.fullName ?? "—"}</td>
                    <td className="px-4 py-3 capitalize text-muted">{entry.role.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-muted">{entry.effectiveFrom}</td>
                    <td className="px-4 py-3 text-right font-medium text-gold">
                      {entry.monthlyAmount.toLocaleString()} EGP
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
