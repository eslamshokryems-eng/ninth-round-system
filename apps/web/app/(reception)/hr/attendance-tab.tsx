"use client";

import { useCallback, useEffect, useState } from "react";
import type { AttendanceRecord } from "@9thround/hr";
import { useAuthStore } from "../../../src/features/auth/store";
import { getHrModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { getCurrentPosition } from "../../../src/lib/geolocation";
import { Card } from "../../../src/components/ui/card";
import { Button } from "../../../src/components/ui/button";
import { BranchLocationCard } from "./branch-location-card";

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(start: Date, end: Date | null): string {
  const ms = (end ?? new Date()).getTime() - start.getTime();
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

const isAdmin = (role: string | null) => role === "branch_manager" || role === "super_admin";

export function AttendanceTab() {
  const profileId = useAuthStore((state) => state.profileId);
  const branchId = useAuthStore((state) => state.branchId);
  const role = useAuthStore((state) => state.role);

  const [openRecord, setOpenRecord] = useState<AttendanceRecord | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [branchRecords, setBranchRecords] = useState<AttendanceRecord[]>([]);
  const [isLoadingBranch, setIsLoadingBranch] = useState(true);

  const loadOwnStatus = useCallback(async () => {
    if (!profileId) return;
    const result = await getHrModule().getOpenAttendance.execute(profileId);
    setIsLoadingStatus(false);
    if (result.isOk) setOpenRecord(result.value);
  }, [profileId]);

  const loadBranchAttendance = useCallback(async () => {
    if (!branchId || !isAdmin(role)) {
      setIsLoadingBranch(false);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const result = await getHrModule().listAttendance.execute({ branchId, startDate: today, endDate: today });
    setIsLoadingBranch(false);
    if (result.isOk) setBranchRecords(result.value);
  }, [branchId, role]);

  useEffect(() => {
    void loadOwnStatus();
    void loadBranchAttendance();
  }, [loadOwnStatus, loadBranchAttendance]);

  async function handleToggle() {
    if (!profileId || !branchId) return;
    setError(null);

    if (openRecord) {
      setIsToggling(true);
      const result = await getHrModule().clockOut.execute(profileId);
      setIsToggling(false);
      if (result.isOk) {
        setOpenRecord(null);
        void loadBranchAttendance();
      } else {
        setError(translateErrorCode(result.error.code));
      }
      return;
    }

    // Clock In requires the device's current GPS position — real,
    // server-side enforcement happens in clock_in_at_location() (the
    // branch's radius, not anything this client claims).
    setIsLocating(true);
    let coords: { latitude: number; longitude: number };
    try {
      coords = await getCurrentPosition();
    } catch (err) {
      setIsLocating(false);
      setError(translateErrorCode(err instanceof Error ? err.message : "GEOLOCATION_UNAVAILABLE"));
      return;
    }
    setIsLocating(false);

    setIsToggling(true);
    const result = await getHrModule().clockIn.execute({ profileId, branchId, ...coords });
    setIsToggling(false);
    if (result.isOk) {
      setOpenRecord(result.value);
      void loadBranchAttendance();
    } else {
      // TOO_FAR_FROM_BRANCH's message is built server-side with the exact
      // distance — shown verbatim rather than through the generic map.
      setError(result.error.code === "TOO_FAR_FROM_BRANCH" ? result.error.message : translateErrorCode(result.error.code));
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        {isLoadingStatus ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase text-muted">Your status</p>
              <p className="mt-1 text-lg font-semibold text-ink">
                {openRecord ? `Clocked in since ${formatTime(openRecord.clockIn)}` : "Not clocked in"}
              </p>
              {openRecord ? (
                <p className="text-sm text-muted">{formatDuration(openRecord.clockIn, null)} so far</p>
              ) : null}
            </div>
            <Button onClick={() => void handleToggle()} isLoading={isToggling || isLocating} variant={openRecord ? "danger" : "primary"}>
              {isLocating ? "Getting your location…" : openRecord ? "Clock Out" : "Clock In"}
            </Button>
          </div>
        )}
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      </Card>

      {isAdmin(role) && branchId ? <BranchLocationCard branchId={branchId} /> : null}

      {isAdmin(role) ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-ink">Today — Whole Branch</h2>
          {isLoadingBranch ? (
            <p className="text-muted">Loading…</p>
          ) : branchRecords.length === 0 ? (
            <p className="text-muted">No one has clocked in today yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-card border border-white/5">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface text-xs uppercase text-muted">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Clock In</th>
                    <th className="px-4 py-3">Clock Out</th>
                    <th className="px-4 py-3">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {branchRecords.map((record) => (
                    <tr key={record.id} className="border-t border-white/5">
                      <td className="px-4 py-3 text-ink">{record.profileFullName ?? "—"}</td>
                      <td className="px-4 py-3 text-ink">{formatTime(record.clockIn)}</td>
                      <td className="px-4 py-3 text-muted">
                        {record.clockOut ? formatTime(record.clockOut) : "Still clocked in"}
                      </td>
                      <td className="px-4 py-3 text-muted">{formatDuration(record.clockIn, record.clockOut)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
