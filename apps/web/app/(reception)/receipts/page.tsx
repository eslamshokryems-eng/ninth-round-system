"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProgramType, Receipt } from "@9thround/reception";
import type { StaffCandidate } from "@9thround/identity";
import { useAuthStore } from "../../../src/features/auth/store";
import { getReceptionModule } from "../../../src/lib/composition-root";
import { ReceiptsCalendar, monthRange, toDateKey } from "../../../src/components/receipts-calendar";
import { Button } from "../../../src/components/ui/button";
import { Card } from "../../../src/components/ui/card";
import { TextField, TextAreaField } from "../../../src/components/ui/text-field";
import { OptionCard } from "../../../src/components/ui/option-card";
import { StaffPicker } from "../../../src/components/staff-picker";
import { BreakdownBars } from "../../../src/components/breakdown-bars";

const today = new Date();

const PROGRAM_TYPES: { value: ProgramType; label: string }[] = [
  { value: "ninth_round", label: "9th Round" },
  { value: "boxing", label: "Boxing" },
  { value: "kickboxing", label: "Kickboxing" },
  { value: "mma", label: "MMA" },
];

function programLabel(programType: ProgramType | null): string {
  return PROGRAM_TYPES.find((option) => option.value === programType)?.label ?? "—";
}

/** Receipts (Phase 5, "Payments / Receipts") — a calendar of daily income for the displayed month; select one or more days to total just those, and the table below follows the selection. Real data from membership_payments, no mock numbers. */
export default function ReceiptsPage() {
  const branchId = useAuthStore((state) => state.branchId);
  const role = useAuthStore((state) => state.role);

  const [year, setYear] = useState(today.getUTCFullYear());
  const [month, setMonth] = useState(today.getUTCMonth());
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editDateValue, setEditDateValue] = useState("");
  const [isSavingDate, setIsSavingDate] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Receipt | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  const [filterProgramType, setFilterProgramType] = useState<ProgramType | null>(null);
  const [filterCoach, setFilterCoach] = useState<StaffCandidate | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    setErrorMessage(null);
    const { startDate, endDate } = monthRange(year, month);
    const result = await getReceptionModule().listReceiptsByDateRange.execute({
      branchId,
      startDate,
      endDate,
      programType: filterProgramType,
      coachId: filterCoach?.profileId ?? null,
    });
    setIsLoading(false);
    if (result.isErr) {
      setErrorMessage("Could not load receipts.");
      return;
    }
    setReceipts(result.value);
  }, [branchId, year, month, filterProgramType, filterCoach]);

  useEffect(() => {
    void load();
  }, [load]);

  // Changing month invalidates any day selection from the previous month.
  useEffect(() => {
    setSelectedDates(new Set());
  }, [year, month]);

  const dailyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const receipt of receipts) {
      const key = toDateKey(new Date(receipt.paymentDate));
      totals.set(key, (totals.get(key) ?? 0) + receipt.amount);
    }
    return totals;
  }, [receipts]);

  function toggleDate(dateKey: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  }

  function startEditDate(receipt: Receipt) {
    setEditingPaymentId(receipt.paymentId);
    setEditDateValue(receipt.paymentDate.slice(0, 10));
    setEditError(null);
  }

  function cancelEditDate() {
    setEditingPaymentId(null);
    setEditError(null);
  }

  async function saveEditDate(paymentId: string) {
    setIsSavingDate(true);
    setEditError(null);
    const result = await getReceptionModule().updateReceiptDate.execute({ paymentId, newDate: editDateValue });
    setIsSavingDate(false);
    if (result.isErr) {
      setEditError(result.error.message);
      return;
    }
    setEditingPaymentId(null);
    await load();
  }

  function openDeleteConfirm(receipt: Receipt) {
    setDeleteTarget(receipt);
    setDeleteReason("");
    setDeleteError(null);
  }

  function cancelDelete() {
    setDeleteTarget(null);
    setDeleteReason("");
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    const result = await getReceptionModule().deleteReceipt.execute({
      paymentId: deleteTarget.paymentId,
      reason: deleteReason,
    });
    setIsDeleting(false);
    if (result.isErr) {
      setDeleteError(result.error.message);
      return;
    }
    setDeleteSuccess(`Receipt ${deleteTarget.receiptNumber} for ${deleteTarget.memberFullName} was deleted.`);
    setDeleteTarget(null);
    setDeleteReason("");
    await load();
  }

  function changeMonth(delta: number) {
    const next = new Date(Date.UTC(year, month + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth());
  }

  const hasSelection = selectedDates.size > 0;
  const visibleReceipts = hasSelection
    ? receipts.filter((r) => selectedDates.has(toDateKey(new Date(r.paymentDate))))
    : receipts;
  const totalForView = visibleReceipts.reduce((sum, r) => sum + r.amount, 0);

  const byCoach = useMemo(() => {
    const totals = new Map<string, number>();
    for (const receipt of visibleReceipts) {
      const label = receipt.coachFullName ?? "Unassigned";
      totals.set(label, (totals.get(label) ?? 0) + receipt.amount);
    }
    return [...totals.entries()].map(([label, value]) => ({ label, value }));
  }, [visibleReceipts]);

  const bySalesPerson = useMemo(() => {
    const totals = new Map<string, number>();
    for (const receipt of visibleReceipts) {
      const label = receipt.soldByFullName ?? "Unassigned";
      totals.set(label, (totals.get(label) ?? 0) + receipt.amount);
    }
    return [...totals.entries()].map(([label, value]) => ({ label, value }));
  }, [visibleReceipts]);

  if (role !== "branch_manager" && role !== "super_admin") {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <p className="text-ink">
            Payments / Receipts is only available to Branch Manager and Super Admin accounts.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Payments / Receipts</h1>

      <div className="mb-6 grid gap-6 md:grid-cols-[320px_1fr]">
        <ReceiptsCalendar
          year={year}
          month={month}
          dailyTotals={dailyTotals}
          selectedDates={selectedDates}
          onToggleDate={toggleDate}
          onPrevMonth={() => changeMonth(-1)}
          onNextMonth={() => changeMonth(1)}
        />

        <div className="rounded-card border border-white/5 bg-surface p-4">
          <p className="text-xs uppercase text-muted">
            {hasSelection ? `${selectedDates.size} day${selectedDates.size > 1 ? "s" : ""} selected` : "Whole month"}
          </p>
          <p className="mt-1 text-3xl font-semibold text-gold">{totalForView.toLocaleString()} EGP</p>
          {hasSelection ? (
            <Button variant="ghost" className="mt-3" onClick={() => setSelectedDates(new Set())}>
              Clear selection
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="mb-6 space-y-3">
        <p className="text-xs font-medium text-muted">Filter by Program and/or Coach — combinable. The breakdown below always reflects every coach and sales person, filtered or not.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Program</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PROGRAM_TYPES.map((option) => (
                <OptionCard
                  key={option.value}
                  label={option.label}
                  isSelected={filterProgramType === option.value}
                  onClick={() => setFilterProgramType((current) => (current === option.value ? null : option.value))}
                />
              ))}
            </div>
          </div>
          <StaffPicker selected={filterCoach} onSelect={setFilterCoach} roleFilter="coach" label="Coach" />
        </div>
        {filterProgramType || filterCoach ? (
          <Button
            variant="ghost"
            className="!px-3 !py-1 text-xs"
            onClick={() => {
              setFilterProgramType(null);
              setFilterCoach(null);
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </Card>

      {deleteSuccess ? <p className="mb-4 text-sm text-gold">{deleteSuccess}</p> : null}

      {deleteTarget ? (
        <Card className="mb-6 space-y-3 border-red-500/40">
          <p className="text-sm font-semibold text-red-400">Delete this receipt?</p>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="text-muted">Member: </span>
              <span className="text-ink">{deleteTarget.memberFullName}</span>
            </p>
            <p>
              <span className="text-muted">Receipt #: </span>
              <span className="text-ink">{deleteTarget.receiptNumber}</span>
            </p>
            <p>
              <span className="text-muted">Payment Date: </span>
              <span className="text-ink">{deleteTarget.paymentDate}</span>
            </p>
            <p>
              <span className="text-muted">Amount: </span>
              <span className="text-ink">{deleteTarget.amount.toLocaleString()} EGP</span>
            </p>
          </div>
          <p className="text-sm text-muted">
            This will permanently delete this receipt/payment record. This action cannot be undone.
          </p>
          <TextAreaField
            label="Reason for deletion"
            value={deleteReason}
            onChange={(event) => setDeleteReason(event.target.value)}
          />
          {deleteError ? <p className="text-sm text-red-400">{deleteError}</p> : null}
          <div className="flex gap-3">
            <Button
              variant="danger"
              onClick={() => void confirmDelete()}
              isLoading={isDeleting}
              disabled={isDeleting || !deleteReason.trim()}
            >
              Yes, Delete Permanently
            </Button>
            <Button variant="secondary" type="button" onClick={cancelDelete} disabled={isDeleting}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      {!isLoading && !errorMessage && visibleReceipts.length > 0 ? (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-ink">By Coach</h2>
            <BreakdownBars entries={byCoach} formatValue={(v) => `${v.toLocaleString()} EGP`} />
          </Card>
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-ink">By Sales Person</h2>
            <BreakdownBars entries={bySalesPerson} formatValue={(v) => `${v.toLocaleString()} EGP`} />
          </Card>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : errorMessage ? (
        <p className="text-red-400">{errorMessage}</p>
      ) : visibleReceipts.length === 0 ? (
        <p className="text-muted">No receipts {hasSelection ? "on the selected day(s)" : "this month"}.</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Receipt #</th>
                <th className="px-4 py-3">Membership #</th>
                <th className="px-4 py-3">Program</th>
                <th className="px-4 py-3">Coach</th>
                <th className="px-4 py-3">Sales Person</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Amount</th>
                {role === "super_admin" ? <th className="px-4 py-3">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {visibleReceipts.map((receipt) => (
                <tr key={receipt.paymentId} className="border-t border-white/5">
                  <td className="px-4 py-3 text-muted">
                    {editingPaymentId === receipt.paymentId ? (
                      <div className="flex items-center gap-2">
                        <TextField
                          label=""
                          aria-label="Payment date"
                          type="date"
                          value={editDateValue}
                          onChange={(event) => setEditDateValue(event.target.value)}
                          className="!py-1"
                        />
                        <Button
                          variant="primary"
                          className="!px-3 !py-1 text-xs"
                          isLoading={isSavingDate}
                          onClick={() => void saveEditDate(receipt.paymentId)}
                        >
                          Save
                        </Button>
                        <Button variant="ghost" className="!px-3 !py-1 text-xs" onClick={cancelEditDate} disabled={isSavingDate}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span>{receipt.paymentDate}</span>
                        {role === "super_admin" ? (
                          <button
                            type="button"
                            onClick={() => startEditDate(receipt)}
                            className="text-xs font-medium text-gold hover:underline"
                          >
                            Edit
                          </button>
                        ) : null}
                      </div>
                    )}
                    {editingPaymentId === receipt.paymentId && editError ? (
                      <p className="mt-1 text-xs text-red-400">{editError}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-ink">{receipt.memberFullName}</td>
                  <td className="px-4 py-3 text-muted">{receipt.receiptNumber}</td>
                  <td className="px-4 py-3 text-muted">{receipt.membershipNumber}</td>
                  <td className="px-4 py-3 text-muted">{programLabel(receipt.programType)}</td>
                  <td className="px-4 py-3 text-muted">{receipt.coachFullName ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{receipt.soldByFullName ?? "—"}</td>
                  <td className="px-4 py-3 text-muted capitalize">{receipt.paymentMethod.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-right font-medium text-gold">{receipt.amount.toLocaleString()} EGP</td>
                  {role === "super_admin" ? (
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openDeleteConfirm(receipt)}
                        className="text-xs font-medium text-red-400 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
