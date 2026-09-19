"use client";

import { useCallback, useEffect, useState } from "react";
import type { PerformanceCategory, PerformancePeriodType, PerformanceTarget } from "@9thround/reception";
import type { StaffCandidate } from "@9thround/identity";
import { useAuthStore } from "../../../src/features/auth/store";
import { getReceptionModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { Card } from "../../../src/components/ui/card";
import { Button } from "../../../src/components/ui/button";
import { SelectField } from "../../../src/components/ui/select-field";
import { TextField, TextAreaField } from "../../../src/components/ui/text-field";
import { StaffPicker } from "../../../src/components/staff-picker";
import { DateRangePicker, type DateRange } from "../../../src/components/date-range-picker";
import { monthRange } from "../../../src/components/receipts-calendar";

const today = new Date();

const PERIOD_TYPES: { value: PerformancePeriodType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

/** Sets/tracks per-employee revenue targets — read by the Sales/Coach Performance tabs for achievement % and remaining-to-target. */
export function TargetsTab() {
  const branchId = useAuthStore((state) => state.branchId);
  const [range, setRange] = useState<DateRange>(monthRange(today.getUTCFullYear(), today.getUTCMonth()));
  const [category, setCategory] = useState<PerformanceCategory>("sales");
  const [targets, setTargets] = useState<PerformanceTarget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [newStaff, setNewStaff] = useState<StaffCandidate | null>(null);
  const [newPeriodType, setNewPeriodType] = useState<PerformancePeriodType>("monthly");
  const [newPeriodStart, setNewPeriodStart] = useState(range.startDate);
  const [newPeriodEnd, setNewPeriodEnd] = useState(range.endDate);
  const [newAmount, setNewAmount] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    setErrorMessage(null);
    const result = await getReceptionModule().listPerformanceTargets.execute({ branchId, category, ...range });
    setIsLoading(false);
    if (result.isErr) {
      setErrorMessage(translateErrorCode(result.error.code));
      return;
    }
    setTargets(result.value);
  }, [branchId, category, range]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!branchId || !newStaff) return;
    const targetAmount = Number(newAmount);
    if (!Number.isFinite(targetAmount) || targetAmount < 0) {
      setFormError("Enter a valid target amount.");
      return;
    }
    setFormError(null);
    setIsSaving(true);
    const result = await getReceptionModule().createPerformanceTarget.execute({
      staffId: newStaff.profileId,
      branchId,
      category,
      periodType: newPeriodType,
      periodStart: newPeriodStart,
      periodEnd: newPeriodEnd,
      targetAmount,
      notes: newNotes.trim() || null,
    });
    setIsSaving(false);
    if (result.isErr) {
      setFormError(translateErrorCode(result.error.code));
      return;
    }
    setNewStaff(null);
    setNewAmount("");
    setNewNotes("");
    await load();
  }

  function startEdit(target: PerformanceTarget) {
    setEditingId(target.id);
    setEditAmount(String(target.targetAmount));
    setEditNotes(target.notes ?? "");
  }

  async function handleSaveEdit(id: string) {
    const targetAmount = Number(editAmount);
    if (!Number.isFinite(targetAmount) || targetAmount < 0) return;
    setIsSaving(true);
    const result = await getReceptionModule().updatePerformanceTarget.execute({
      id,
      targetAmount,
      notes: editNotes.trim() || null,
    });
    setIsSaving(false);
    if (result.isOk) {
      setEditingId(null);
      await load();
    }
  }

  async function handleDelete(id: string) {
    setIsSaving(true);
    const result = await getReceptionModule().deletePerformanceTarget.execute(id);
    setIsSaving(false);
    if (result.isOk) {
      setConfirmingDeleteId(null);
      await load();
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-4 text-sm font-semibold text-ink">New Target</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value as PerformanceCategory)}>
            <option value="sales">Sales</option>
            <option value="coach">Coach</option>
          </SelectField>
          <div>
            {category === "coach" ? (
              <StaffPicker selected={newStaff} onSelect={setNewStaff} roleFilter="coach" label="Employee" />
            ) : (
              <StaffPicker selected={newStaff} onSelect={setNewStaff} label="Employee" />
            )}
          </div>
          <SelectField
            label="Period Type"
            value={newPeriodType}
            onChange={(e) => setNewPeriodType(e.target.value as PerformancePeriodType)}
          >
            {PERIOD_TYPES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </SelectField>
          <TextField label="Period Start" type="date" value={newPeriodStart} onChange={(e) => setNewPeriodStart(e.target.value)} />
          <TextField label="Period End" type="date" value={newPeriodEnd} onChange={(e) => setNewPeriodEnd(e.target.value)} />
          <TextField
            label="Target Amount (EGP)"
            type="number"
            min="0"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
          />
          <div className="md:col-span-2 lg:col-span-3">
            <TextAreaField label="Notes (optional)" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
          </div>
        </div>
        {formError ? <p className="mt-3 text-sm text-red-400">{formError}</p> : null}
        <div className="mt-4">
          <Button onClick={() => void handleCreate()} disabled={!newStaff || !newAmount} isLoading={isSaving}>
            Save Target
          </Button>
        </div>
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <DateRangePicker value={range} onChange={setRange} />
        <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value as PerformanceCategory)}>
          <option value="sales">Sales</option>
          <option value="coach">Coach</option>
        </SelectField>
      </div>

      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : errorMessage ? (
        <p className="text-red-400">{errorMessage}</p>
      ) : (
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-ink">Targets ({targets.length})</h2>
          {targets.length === 0 ? (
            <p className="text-sm text-muted">No targets set for this range.</p>
          ) : (
            <div className="space-y-3">
              {targets.map((target) => (
                <div key={target.id} className="rounded-lg border border-white/5 p-4">
                  {editingId === target.id ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-medium text-ink">{target.staffName}</span>
                        <span className="text-xs capitalize text-muted">
                          {target.periodType} · {target.periodStart} → {target.periodEnd}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <TextField
                          label="Target Amount (EGP)"
                          type="number"
                          min="0"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-48"
                        />
                        <TextField label="Notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="flex-1" />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => void handleSaveEdit(target.id)} isLoading={isSaving}>
                          Save
                        </Button>
                        <Button variant="secondary" onClick={() => setEditingId(null)} disabled={isSaving}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-ink">{target.staffName}</p>
                        <p className="text-xs capitalize text-muted">
                          {target.periodType} · {target.periodStart} → {target.periodEnd}
                        </p>
                        {target.notes ? <p className="mt-1 text-xs text-muted">{target.notes}</p> : null}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold text-gold">{target.targetAmount.toLocaleString()} EGP</span>
                        {confirmingDeleteId === target.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted">Delete this target?</span>
                            <Button variant="danger" onClick={() => void handleDelete(target.id)} isLoading={isSaving}>
                              Yes, Delete
                            </Button>
                            <Button variant="secondary" onClick={() => setConfirmingDeleteId(null)} disabled={isSaving}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => startEdit(target)} className="text-xs text-gold hover:text-gold-soft">
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingDeleteId(target.id)}
                              className="text-xs text-red-400 hover:text-red-300"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
