"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../src/features/auth/store";
import { getIdentityModule } from "../../src/lib/composition-root";
import { requestVerificationCode, submitVerificationCode } from "../../src/lib/device-verification-client";
import { Button } from "../../src/components/ui/button";
import { Card } from "../../src/components/ui/card";
import { TextField } from "../../src/components/ui/text-field";

/**
 * Shown by app/(reception)/layout.tsx in place of the normal Reception
 * shell whenever the current device isn't in this employee's
 * trusted_devices list. A code is requested automatically on mount and
 * emailed to the administrator address configured under Security — this
 * screen never displays the code itself, only lets the employee enter
 * whatever the administrator relays to them out of band.
 */
export function DeviceVerificationScreen({ onVerified }: { onVerified: () => void }) {
  const router = useRouter();
  const fullName = useAuthStore((state) => state.fullName);
  const setSignedOut = useAuthStore((state) => state.setSignedOut);

  const [isSendingCode, setIsSendingCode] = useState(true);
  const [sendError, setSendError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function send() {
      const result = await requestVerificationCode();
      if (!isMounted) return;
      setIsSendingCode(false);
      if (!result.ok) setSendError(result.message);
    }
    void send();
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleResend() {
    setIsSendingCode(true);
    setSendError(null);
    const result = await requestVerificationCode();
    setIsSendingCode(false);
    if (!result.ok) setSendError(result.message);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    const result = await submitVerificationCode(code, trustDevice, null);

    setIsSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.message);
      return;
    }
    onVerified();
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    await getIdentityModule().signOut();
    setIsSigningOut(false);
    setSignedOut();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Image src="/emblem-red.png" alt="9th Round" width={48} height={48} />
          <div className="text-center">
            <h1 className="text-lg font-semibold text-ink">New Device Verification</h1>
            <p className="mt-1 text-xs text-muted">{fullName ?? "—"}</p>
          </div>
        </div>

        <p className="mb-4 text-sm text-muted">
          We don&apos;t recognize this device. A verification code has been sent to your administrator — ask them for
          it, then enter it below.
        </p>

        {isSendingCode ? (
          <p className="mb-4 text-sm text-muted">Sending code…</p>
        ) : sendError ? (
          <p className="mb-4 text-sm text-red-400">{sendError}</p>
        ) : null}

        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
          <TextField
            label="6-digit code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            required
          />

          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(event) => setTrustDevice(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-black/30"
            />
            Trust this device for 30 days
          </label>

          {submitError ? <p className="text-sm text-red-400">{submitError}</p> : null}

          <Button type="submit" isLoading={isSubmitting} disabled={code.length !== 6} className="w-full justify-center">
            Verify
          </Button>

          <button
            type="button"
            onClick={() => void handleResend()}
            disabled={isSendingCode}
            className="text-xs font-medium text-gold hover:text-gold-soft disabled:opacity-50"
          >
            {isSendingCode ? "Sending…" : "Resend code"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={isSigningOut}
          className="mt-6 text-xs font-medium text-muted hover:text-ink disabled:opacity-50"
        >
          {isSigningOut ? "Signing out…" : "Sign out"}
        </button>
      </Card>
    </div>
  );
}
