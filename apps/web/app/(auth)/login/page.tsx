"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuthStore } from "../../../src/features/auth/store";
import { STAFF_ROLES } from "../../../src/lib/staff-roles";
import { getIdentityModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { Button } from "../../../src/components/ui/button";
import { Card } from "../../../src/components/ui/card";
import { TextField } from "../../../src/components/ui/text-field";

/** Reception's own login screen (Phase 3) — reuses SignInUseCase from @9thround/identity, the same Supabase Auth/RLS the mobile app already uses. */
export default function LoginPage() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.role);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === "signedIn" && role && STAFF_ROLES.has(role)) {
      router.replace("/dashboard");
    }
  }, [status, role, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const result = await getIdentityModule().signIn.execute({ email, password });

    setIsSubmitting(false);

    if (result.isErr) {
      setErrorMessage(translateErrorCode(result.error.code));
      return;
    }
    // useAuthBootstrap's onAuthStateChange listener picks up the new
    // session and updates the store; the effect above then redirects.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Image src="/emblem-red.png" alt="9th Round" width={48} height={48} />
          <div className="text-center">
            <h1 className="text-lg font-semibold text-ink">9th Round Reception</h1>
            <p className="text-xs text-muted">Staff sign in</p>
          </div>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {errorMessage ? <p className="text-sm text-red-400">{errorMessage}</p> : null}
          <Button type="submit" isLoading={isSubmitting} className="w-full justify-center">
            Sign In
          </Button>
        </form>
      </Card>
    </div>
  );
}
