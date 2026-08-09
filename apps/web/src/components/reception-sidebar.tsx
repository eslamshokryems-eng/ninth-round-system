"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthStore } from "../features/auth/store";
import { getIdentityModule } from "../lib/composition-root";

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/members", label: "Members" },
  { href: "/members/new", label: "Add Member" },
  { href: "/memberships", label: "Memberships" },
  { href: "/receipts", label: "Payments / Receipts" },
  { href: "/expiring", label: "Expiring" },
  { href: "/reports", label: "Reports" },
  { href: "/profile", label: "Profile" },
];

/** Only Branch Manager/Super Admin can approve staff accounts (docs/12-roles-and-permissions.md §12.4) — kept out of the base nav so Reception accounts never see a link they'd be turned away from. */
const STAFF_MANAGEMENT_NAV_ITEM = { href: "/staff", label: "Manage Staff" };

/** The Reception web app's permanent desktop sidebar — see Phase 5 of the reception-web brief. */
export function ReceptionSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const fullName = useAuthStore((state) => state.fullName);
  const role = useAuthStore((state) => state.role);
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
    <aside className="flex h-screen w-64 flex-shrink-0 flex-col border-r border-white/5 bg-surface">
      <div className="flex items-center gap-3 px-6 py-6">
        <Image src="/emblem-red.png" alt="9th Round" width={32} height={32} />
        <div>
          <p className="text-sm font-semibold text-ink">9th Round</p>
          <p className="text-xs text-muted">Reception</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {(role === "branch_manager" || role === "super_admin"
          ? [...NAV_ITEMS, STAFF_MANAGEMENT_NAV_ITEM]
          : NAV_ITEMS
        ).map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? "bg-gold/10 text-gold" : "text-muted hover:bg-white/[0.06] hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/5 px-6 py-4">
        <p className="truncate text-sm font-medium text-ink">{fullName ?? "—"}</p>
        <p className="text-xs capitalize text-muted">{role?.replace("_", " ") ?? "—"}</p>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={isSigningOut}
          className="mt-3 text-xs font-medium text-gold hover:text-gold-soft disabled:opacity-50"
        >
          {isSigningOut ? "Signing out…" : "Logout"}
        </button>
      </div>
    </aside>
  );
}
