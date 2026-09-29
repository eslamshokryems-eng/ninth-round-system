"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getIdentityModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { useAuthStore } from "../../../src/features/auth/store";
import { RaceButton, RaceHeader, RaceInput, RaceNotice, RacePage } from "../../../src/components/race/race-ui";

/** Only ever send someone back into /race — never to an arbitrary URL. */
function safeNext(raw: string | null): string {
  return raw && /^\/race(\/[A-Za-z0-9._~\-/]*)?$/.test(raw) ? raw : "/race";
}

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const status = useAuthStore((state) => state.status);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === "signedIn") router.replace(next);
  }, [status, next, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    // Same credentials as the rest of the platform: Employee ID (or email) + password.
    let email = identifier.trim();
    if (!email.includes("@")) {
      const resolved = await getIdentityModule().resolveEmployeeCode.execute(email);
      if (resolved.isErr || !resolved.value) {
        setIsSubmitting(false);
        setError(translateErrorCode("SIGN_IN_FAILED"));
        return;
      }
      email = resolved.value;
    }
    const result = await getIdentityModule().signIn.execute({ email, password });
    setIsSubmitting(false);
    if (result.isErr) setError(translateErrorCode(result.error.code));
    // Success: useAuthBootstrap updates the store, and the effect above redirects.
  }

  return (
    <RacePage>
      <div className="mt-8 flex flex-col gap-6">
        <div>
          <p className="race-kicker">Staff &amp; officials</p>
          <h1 className="race-display mt-2 text-5xl">Sign in</h1>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
          <RaceInput id="race-login-id" label="Employee ID or email" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
          <RaceInput id="race-login-pw" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error ? <RaceNotice>{error}</RaceNotice> : null}
          <RaceButton type="submit" isLoading={isSubmitting} className="w-full">
            Sign in
          </RaceButton>
        </form>
      </div>
    </RacePage>
  );
}

export default function RaceLoginPage() {
  return (
    <>
      <RaceHeader />
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </>
  );
}
