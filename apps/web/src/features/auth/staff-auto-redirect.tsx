"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "./store";
import { STAFF_ROLES } from "../../lib/staff-roles";

/**
 * Mounted on the public homepage only. A signed-in staff member who lands
 * on "/" (e.g. an old bookmark, or typing the bare domain) is bounced
 * straight to /dashboard, same as the old root gate used to do — but as a
 * non-blocking side effect, not a full-page spinner: an anonymous visitor
 * (the overwhelming majority of "/" traffic once this is a public site)
 * sees the marketing page immediately, with nothing waiting on auth state.
 */
export function StaffAutoRedirect() {
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.role);
  const router = useRouter();

  useEffect(() => {
    if (status === "signedIn" && role && STAFF_ROLES.has(role)) {
      router.replace("/dashboard");
    }
  }, [status, role, router]);

  return null;
}
