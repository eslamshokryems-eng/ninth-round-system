"use client";

import { useCallback, useEffect, useState } from "react";
import type { BranchLocation } from "@9thround/hr";
import { getHrModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { getCurrentPosition } from "../../../src/lib/geolocation";
import { Card } from "../../../src/components/ui/card";
import { Button } from "../../../src/components/ui/button";
import { TextField } from "../../../src/components/ui/text-field";

interface BranchLocationCardProps {
  branchId: string;
}

/**
 * Branch Manager/Super Admin only — configures the GPS point + radius
 * Clock In checks every employee against (clock_in_at_location(),
 * supabase/migrations/20260826000001). Until this is set, Clock In skips
 * the distance check entirely — so an admin sees plainly whether it's on.
 */
export function BranchLocationCard({ branchId }: BranchLocationCardProps) {
  const [location, setLocation] = useState<BranchLocation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [radiusText, setRadiusText] = useState("75");
  const [pendingCoords, setPendingCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await getHrModule().getBranchLocation.execute(branchId);
    setIsLoading(false);
    if (result.isOk) {
      setLocation(result.value);
      setRadiusText(String(result.value.radiusMeters));
    }
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCapture() {
    setError(null);
    setIsCapturing(true);
    try {
      const coords = await getCurrentPosition();
      setPendingCoords(coords);
    } catch (err) {
      setError(translateErrorCode(err instanceof Error ? err.message : "GEOLOCATION_UNAVAILABLE"));
    } finally {
      setIsCapturing(false);
    }
  }

  async function handleSave() {
    const coords = pendingCoords ?? (location?.latitude != null && location.longitude != null ? { latitude: location.latitude, longitude: location.longitude } : null);
    if (!coords) return;
    const radius = Number(radiusText);
    if (!Number.isFinite(radius)) return;

    setError(null);
    setSavedAt(null);
    setIsSaving(true);
    const result = await getHrModule().setBranchLocation.execute({
      branchId,
      latitude: coords.latitude,
      longitude: coords.longitude,
      radiusMeters: radius,
    });
    setIsSaving(false);

    if (result.isErr) {
      setError(translateErrorCode(result.error.code));
      return;
    }
    setSavedAt(Date.now());
    setPendingCoords(null);
    void load();
  }

  const displayCoords =
    pendingCoords ?? (location?.latitude != null && location.longitude != null ? { latitude: location.latitude, longitude: location.longitude } : null);
  const canSave = displayCoords != null;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Branch Location</h2>
        <p className="text-sm text-muted">
          Employees must be within this radius of the branch to Clock In. Not set yet? Clock In works normally with no location check.
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm">
              <p className="text-xs font-medium text-muted">Current Coordinates</p>
              <p className="mt-1 text-ink">
                {displayCoords ? `${displayCoords.latitude.toFixed(6)}, ${displayCoords.longitude.toFixed(6)}` : "Not configured yet"}
              </p>
              {pendingCoords ? <p className="mt-1 text-xs text-gold">Captured just now — click Save to apply.</p> : null}
            </div>
            <TextField
              label="Check-in Radius (meters)"
              type="number"
              min={10}
              max={2000}
              value={radiusText}
              onChange={(e) => setRadiusText(e.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {savedAt ? <p className="text-sm text-gold">Branch location saved.</p> : null}

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => void handleCapture()} isLoading={isCapturing}>
              Use My Current Location
            </Button>
            <Button onClick={() => void handleSave()} isLoading={isSaving} disabled={!canSave}>
              Save
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
