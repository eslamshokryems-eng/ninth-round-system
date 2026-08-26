"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import Image from "next/image";
import { useAuthStore } from "../../src/features/auth/store";
import { STAFF_ROLES } from "../../src/lib/staff-roles";
import { ReceptionSidebar } from "../../src/components/reception-sidebar";
import { getIdentityModule } from "../../src/lib/composition-root";
import { AttendanceTab } from "./hr/attendance-tab";

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
  const pathname = usePathname();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    if (status === "signedOut") {
      router.replace("/login");
    }
  }, [status, router]);

  // Close the drawer whenever the route changes (e.g. via browser back/forward, not just a nav click).
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsDrawerOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDrawerOpen]);

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

  // Coach accounts get exactly one screen, no matter what URL they're on —
  // `children` (the actually-routed page) is deliberately never rendered
  // here, so there's no page to navigate to besides this one. Reuses
  // AttendanceTab as-is: it already shows only the self clock-in card to a
  // non-admin role, no separate "coach view" component to keep in sync.
  if (role === "coach") {
    return <CoachCheckInOnly />;
  }

  return (
    <div className="flex h-screen flex-col bg-bg lg:flex-row">
      <ReceptionSidebar variant="desktop" />

      <header className="flex flex-shrink-0 items-center justify-between border-b border-white/5 bg-surface px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <Image src="/emblem-red.png" alt="9th Round" width={24} height={24} />
          <p className="text-sm font-semibold text-ink">9th Round</p>
        </div>
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-white/[0.06]"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
            <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Dismiss navigation"
            onClick={() => setIsDrawerOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col shadow-xl">
            <div className="flex justify-end px-3 pt-3">
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setIsDrawerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-ink"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ReceptionSidebar variant="drawer" onNavigate={() => setIsDrawerOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}

      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}

/** The entirety of a coach account's experience of this app — see the role === "coach" branch above for why. */
function CoachCheckInOnly() {
  const router = useRouter();
  const fullName = useAuthStore((state) => state.fullName);
  const setSignedOut = useAuthStore((state) => state.setSignedOut);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    await getIdentityModule().signOut();
    setIsSigningOut(false);
    setSignedOut();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex items-center justify-between border-b border-white/5 bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <Image src="/emblem-red.png" alt="9th Round" width={24} height={24} />
          <p className="text-sm font-semibold text-ink">9th Round</p>
        </div>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={isSigningOut}
          className="text-xs font-medium text-gold hover:text-gold-soft disabled:opacity-50"
        >
          {isSigningOut ? "Signing out…" : "Logout"}
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-ink">Check-In</h1>
            <p className="mt-1 text-sm text-muted">{fullName ?? "—"}</p>
          </div>
          <AttendanceTab />
        </div>
      </main>
    </div>
  );
}
