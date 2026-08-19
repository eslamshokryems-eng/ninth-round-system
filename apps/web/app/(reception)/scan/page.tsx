"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuthStore } from "../../../src/features/auth/store";
import { getReceptionModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { Card } from "../../../src/components/ui/card";
import { Button } from "../../../src/components/ui/button";
import { TextField } from "../../../src/components/ui/text-field";
import { QrScanner } from "../../../src/components/qr-scanner";

// Same role split as check_in_member()'s own RLS
// (20260806000006_check_ins.sql: reception/branch_manager/super_admin —
// sales_employee is deliberately excluded from check-in). Enforced again
// here as a page guard; the database is what actually stops a
// sales_employee account either way.
const CAN_CHECK_IN = new Set(["reception", "branch_manager", "super_admin"]);

interface ScanResult {
  isError: boolean;
  text: string;
}

/**
 * Scan Check-In — point the phone's camera at a member's QR (their own
 * phone screen or a physical card) to check them in without searching by
 * name first. See docs/phase-1/21-scan-check-in.md.
 */
export default function ScanCheckInPage() {
  const role = useAuthStore((state) => state.role);

  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [recentCount, setRecentCount] = useState(0);

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
    setRecentCount((count) => count + 1);
  }

  async function handleManualSubmit(event: FormEvent) {
    event.preventDefault();
    if (!manualCode.trim()) return;
    await handleCode(manualCode.trim());
    setManualCode("");
  }

  if (role && !CAN_CHECK_IN.has(role)) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <p className="text-ink">Scan Check-In is only available to Reception, Branch Manager, and Super Admin accounts.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Scan Check-In</h1>
        <p className="text-sm text-muted">Point the camera at the member&apos;s QR code.</p>
      </div>

      <QrScanner onDecode={(text) => void handleCode(text)} isPaused={isProcessing || result !== null} />

      {isProcessing ? <p className="text-sm text-muted">Checking in…</p> : null}

      {result ? (
        <Card className={result.isError ? "border-red-500/30" : "border-gold/30"}>
          <p className={`text-lg font-semibold ${result.isError ? "text-red-400" : "text-gold"}`}>{result.text}</p>
          {result.isError ? (
            <p className="mt-1 text-xs text-muted">
              Not the right member? Try again, or find them from{" "}
              <Link href="/members" className="text-gold hover:text-gold-soft">
                Members
              </Link>
              .
            </p>
          ) : null}
          <Button className="mt-3" variant="secondary" onClick={() => setResult(null)}>
            Scan Next
          </Button>
        </Card>
      ) : null}

      {recentCount > 0 ? <p className="text-xs text-muted">{recentCount} checked in this session.</p> : null}

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Or enter the code manually</p>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => void handleManualSubmit(event)}>
          <div className="flex-1">
            <TextField
              label="Member QR code"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              disabled={isProcessing}
            />
          </div>
          <Button type="submit" variant="secondary" isLoading={isProcessing} disabled={!manualCode.trim()} className="w-full sm:w-auto">
            Check In
          </Button>
        </form>
      </div>
    </div>
  );
}
