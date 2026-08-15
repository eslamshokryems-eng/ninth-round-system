"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthStore } from "../features/auth/store";
import { getIdentityModule } from "../lib/composition-root";

/** The Payments/Receipts page is now a daily-income calendar, not just a table — a calendar glyph flags that at a glance. */
function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 flex-shrink-0" aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 7.5h15" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 2v3M14 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Clock in/out, schedule, leave, payroll — a distinct glyph from the receipts calendar so the two are never confused in the nav. */
function HrIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 flex-shrink-0" aria-hidden="true">
      <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 17c.7-3.5 3.5-5.5 6.5-5.5s5.8 2 6.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AuditLogIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 flex-shrink-0" aria-hidden="true">
      <path d="M5 2.5h7l3 3v12h-10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7.5 9h5M7.5 12h5M7.5 15h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PermissionsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 flex-shrink-0" aria-hidden="true">
      <path
        d="M10 2.5l6 2.2v4.7c0 4-2.6 6.9-6 8.1-3.4-1.2-6-4.1-6-8.1V4.7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7.5 10l1.8 1.8L12.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon?: () => JSX.Element;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/members", label: "Members" },
  { href: "/members/new", label: "Add Member" },
  { href: "/memberships", label: "Memberships" },
  { href: "/expiring", label: "Expiring" },
  { href: "/hr", label: "HR", icon: HrIcon },
  { href: "/reports", label: "Reports" },
  { href: "/profile", label: "Profile" },
];

/**
 * Money-visibility items — only Branch Manager/Super Admin, same split as
 * the Dashboard's revenue cards and Payroll (docs/phase-1/15-reception-web-app.md
 * §15.9). Kept out of the base nav so Reception/Sales Employee accounts
 * never see a link they'd be turned away from.
 */
const OWNER_NAV_ITEMS: NavItem[] = [
  { href: "/receipts", label: "Payments / Receipts", icon: CalendarIcon },
  { href: "/staff", label: "Manage Staff" },
];

/**
 * Super Admin-only — matches the permission matrix exactly (view audit
 * logs / manage permissions are listed only under SUPER ADMIN, not
 * MANAGER — see docs/phase-1/17-audit-log-and-permissions.md). Kept out
 * of OWNER_NAV_ITEMS (branch_manager/super_admin) deliberately: a plain
 * branch_manager should never see these links, not just be denied at the
 * database if they somehow reach the page.
 */
const SUPER_ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/audit-log", label: "Audit Log", icon: AuditLogIcon },
  { href: "/permissions", label: "Permissions", icon: PermissionsIcon },
];

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
        {(role === "super_admin"
          ? [...NAV_ITEMS, ...OWNER_NAV_ITEMS, ...SUPER_ADMIN_NAV_ITEMS]
          : role === "branch_manager"
            ? [...NAV_ITEMS, ...OWNER_NAV_ITEMS]
            : NAV_ITEMS
        ).map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? "bg-gold/10 text-gold" : "text-muted hover:bg-white/[0.06] hover:text-ink"
              }`}
            >
              {Icon ? <Icon /> : null}
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
