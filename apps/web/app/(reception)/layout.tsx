"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAuthStore } from "../../src/features/auth/store";
import { STAFF_ROLES } from "../../src/lib/staff-roles";
import { ReceptionSidebar } from "../../src/components/reception-sidebar";

/**
 * The auth guard for every Reception screen (Phase 3): unauthenticated
 * users are sent to /login; an authenticated but non-staff account (a
 * `member`/`coach` who happens to sign in here) sees an explicit access
 * message rather than any Reception data — this is a UX nicety, not the
 * real security boundary, which is enforced by RLS at the database
 * regardless of what this layout does (see e.g.
 * supabase/migrations/20260806000002's "reception/branch_manager insert
 * members" policy).
 */
export default function ReceptionLayout({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.role);
  const router = useRouter();

  useEffect(() => {
    if (status === "signedOut") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "hydrating") {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      </div>
    );
  }

  if (status === "signedOut") {
    return null;
  }

  if (!role || !STAFF_ROLES.has(role)) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg px-4 text-center">
        <div>
          <p className="text-lg font-semibold text-ink">This account isn&apos;t authorized for Reception.</p>
          <p className="mt-2 text-sm text-muted">Sign in with a Reception, Branch Manager, or Super Admin account.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-bg">
      <ReceptionSidebar />
      <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
    </div>
  );
}
