"use client";

import { useState, type FormEvent } from "react";
import { getReceptionModule } from "../lib/composition-root";
import { translateErrorCode } from "../lib/translate-error";
import { Button } from "./ui/button";
import { TextField } from "./ui/text-field";
import { QrScanner } from "./qr-scanner";

interface ScanResult {
  isError: boolean;
  text: string;
}

function ScanIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-10 w-10 text-gold" aria-hidden="true">
      <path
        d="M3 6.5V4.5a1.5 1.5 0 0 1 1.5-1.5h2M17 6.5V4.5A1.5 1.5 0 0 0 15.5 3h-2M3 13.5v2A1.5 1.5 0 0 0 4.5 17h2M17 13.5v2a1.5 1.5 0 0 1-1.5 1.5h-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="7.5" y="7.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Compact, embeddable check-in scanner for the Dashboard — camera stays off
 * until "Start Scanning" is clicked, matching /scan's manual-entry fallback
 * and reusing the same use case, so behavior never diverges between the two
 * entry points. onCheckedIn lets the Dashboard refresh its own stats/lists.
 */
export function DashboardCheckInBox({ onCheckedIn }: { onCheckedIn: () => void }) {
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [manualCode, setManualCode] = useState("");

  async function handleCode(code: string) {
    if (isProcessing) return;
    setIsProcessing(true);
    setResult(null);

    const outcome = await getReceptionModule().checkInByQrCode.execute(code);

    setIsProcessing(false);
    if (outcome.isErr) {
      setResult({ isError: true, text: translateErrorCode(outcome.error.code) });
      return;
    }
    setResult({ isError: false, text: `Checked in: ${outcome.value.fullName}` });
    onCheckedIn();
  }

  async function handleManualSubmit(event: FormEvent) {
    event.preventDefault();
    if (!manualCode.trim()) return;
    await handleCode(manualCode.trim());
    setManualCode("");
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Check-In</h2>
        <p className="text-sm text-muted">Scan member QR code</p>
      </div>

      {!isScanning ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-white/10 bg-black/40 py-14 text-center">
          <ScanIcon />
          <p className="text-lg font-semibold text-ink">Ready to Scan</p>
          <p className="text-sm text-muted">Point the camera at the member QR code</p>
          <Button className="mt-2" onClick={() => setIsScanning(true)}>
            Start Scanning
          </Button>
        </div>
      ) : (
        <QrScanner onDecode={(text) => void handleCode(text)} isPaused={isProcessing || result !== null} />
      )}

      {isProcessing ? <p className="text-sm text-muted">Checking in…</p> : null}

      {result ? (
        <div className={`rounded-card border p-4 ${result.isError ? "border-red-500/30" : "border-gold/30"}`}>
          <p className={`font-semibold ${result.isError ? "text-red-400" : "text-gold"}`}>{result.text}</p>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => {
              setResult(null);
            }}
          >
            Scan Next
          </Button>
        </div>
      ) : null}

      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => void handleManualSubmit(event)}>
        <div className="flex-1">
          <TextField
            label="Or enter the code manually"
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            disabled={isProcessing}
          />
        </div>
        <Button type="submit" variant="secondary" isLoading={isProcessing} disabled={!manualCode.trim()}>
          Manual Check-In
        </Button>
      </form>
    </div>
  );
}
