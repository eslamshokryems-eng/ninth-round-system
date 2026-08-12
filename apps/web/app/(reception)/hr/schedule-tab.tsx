"use client";

import { useCallback, useEffect, useState } from "react";
import type { DayOfWeek, Shift } from "@9thround/hr";
import type { StaffCandidate } from "@9thround/identity";
import { useAuthStore } from "../../../src/features/auth/store";
import { getHrModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { Card } from "../../../src/components/ui/card";
import { Button } from "../../../src/components/ui/button";
import { SelectField } from "../../../src/components/ui/select-field";
import { TextField } from "../../../src/components/ui/text-field";
import { StaffPicker } from "../../../src/components/staff-picker";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const isAdmin = (role: string | null) => role === "branch_manager" || role === "super_admin";

export function ScheduleTab() {
  const branchId = useAuthStore((state) => state.branchId);
  const role = useAuthStore((state) => state.role);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedStaff, setSelectedStaff] = useState<StaffCandidate | null>(null);
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(0);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [isCreating, setIsCreating] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    const result = await getHrModule().listShifts.execute(branchId);
    setIsLoading(false);
    if (result.isOk) setShifts(result.value);
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!branchId || !selectedStaff) return;
    setError(null);
    setIsCreating(true);
    const result = await getHrModule().createShift.execute({
      profileId: selectedStaff.profileId,
      branchId,
      dayOfWeek,
      startTime,
      endTime,
    });
    setIsCreating(false);
    if (result.isOk) {
      setShifts((prev) => [...prev, result.value]);
      setSelectedStaff(null);
    } else {
      setError(translateErrorCode(result.error.code));
    }
  }

  async function handleDelete(shiftId: string) {
    setPendingDeleteId(shiftId);
    const result = await getHrModule().deleteShift.execute(shiftId);
    setPendingDeleteId(null);
    if (result.isOk) setShifts((prev) => prev.filter((s) => s.id !== shiftId));
  }

  return (
    <div className="space-y-6">
      {isAdmin(role) ? (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-ink">Add a Shift</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <StaffPicker selected={selectedStaff} onSelect={setSelectedStaff} />
            </div>
            <SelectField
              label="Day"
              value={dayOfWeek}
              onChange={(event) => setDayOfWeek(Number(event.target.value) as DayOfWeek)}
            >
              {DAY_LABELS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </SelectField>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Start" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              <TextField label="End" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </div>
          </div>
          {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
          <Button className="mt-4" onClick={() => void handleCreate()} isLoading={isCreating} disabled={!selectedStaff}>
            Add Shift
          </Button>
        </Card>
      ) : null}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Weekly Schedule</h2>
        {isLoading ? (
          <p className="text-muted">Loading…</p>
        ) : shifts.length === 0 ? (
          <p className="text-muted">No shifts set yet.</p>
        ) : (
          DAY_LABELS.map((label, dayIndex) => {
            const dayShifts = shifts.filter((s) => s.dayOfWeek === dayIndex);
            if (dayShifts.length === 0) return null;
            return (
              <div key={label}>
                <p className="mb-2 text-xs font-semibold uppercase text-muted">{label}</p>
                <div className="space-y-2">
                  {dayShifts.map((shift) => (
                    <div
                      key={shift.id}
                      className="flex items-center justify-between rounded-lg border border-white/5 bg-surface px-4 py-2.5"
                    >
                      <span className="text-sm text-ink">
                        {shift.profileFullName ?? "—"}{" "}
                        <span className="text-muted">
                          {shift.startTime}–{shift.endTime}
                        </span>
                      </span>
                      {isAdmin(role) ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(shift.id)}
                          disabled={pendingDeleteId === shift.id}
                          className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
