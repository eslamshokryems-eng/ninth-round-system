"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../src/features/auth/store";
import { STAFF_ROLES } from "../src/lib/staff-roles";

/** The root routing gate — mirrors apps/mobile/app/index.tsx's decision, scoped to this app's Reception-only purpose. */
export default function RootPage() {
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.role);
  const router = useRouter();

  useEffect(() => {
    if (status === "hydrating") return;
    if (status === "signedOut") {
      router.replace("/login");
      return;
    }
    if (role && STAFF_ROLES.has(role)) {
      router.replace("/dashboard");
      return;
    }
    router.replace("/login");
  }, [status, role, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-bg">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
    </div>
  );
}
