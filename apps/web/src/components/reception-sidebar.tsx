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

/** Sales/Leads — a distinct pipeline glyph, so it's never confused with the Members list icon. */
function SalesIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 flex-shrink-0" aria-hidden="true">
      <path d="M3 15.5l4-5 3 3 6-7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 5.5h4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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

function ScanIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 flex-shrink-0" aria-hidden="true">
      <path
        d="M3 6.5V4.5a1.5 1.5 0 0 1 1.5-1.5h2M17 6.5V4.5A1.5 1.5 0 0 0 15.5 3h-2M3 13.5v2A1.5 1.5 0 0 0 4.5 17h2M17 13.5v2a1.5 1.5 0 0 1-1.5 1.5h-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="7.5" y="7.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
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
 * Check-in-capable roles only — matches check_in_member()'s own RLS
 * exactly (20260806000006_check_ins.sql: reception/branch_manager/
 * super_admin; sales_employee is deliberately excluded from check-in).
 * Kept out of the base nav for the same reason OWNER_NAV_ITEMS is: a
 * sales_employee account should never see a link they'd be turned away
 * from.
 */
const CHECK_IN_NAV_ITEMS: NavItem[] = [{ href: "/scan", label: "Scan Check-In", icon: ScanIcon }];

/**
 * Sales/Leads CRM — sales_employee/branch_manager/super_admin only, matching
 * can_manage_leads() (supabase/migrations/20260821000001_sales_leads_crm.sql)
 * exactly. Plain reception/coach accounts never see this link.
 */
const SALES_NAV_ITEMS: NavItem[] = [{ href: "/sales", label: "Sales", icon: SalesIcon }];

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

/**
 * Composes the nav for a role by additive tiers rather than a chain of
 * ternaries — each tier's membership matches a real RLS-enforced
 * capability boundary (check-in, money-visibility, super-admin-only), so
 * a new tier is one `if`, not a rewrite of nested branches.
 */
function navItemsForRole(role: string | null): NavItem[] {
  const items = [...NAV_ITEMS];
  // Inserted right after Dashboard — a fast-path daily action, not buried below Reports/Profile.
  if (role && role !== "sales_employee") items.splice(1, 0, ...CHECK_IN_NAV_ITEMS);
  if (role === "sales_employee" || role === "branch_manager" || role === "super_admin") {
    items.splice(1, 0, ...SALES_NAV_ITEMS);
  }
  if (role === "branch_manager" || role === "super_admin") items.push(...OWNER_NAV_ITEMS);
  if (role === "super_admin") items.push(...SUPER_ADMIN_NAV_ITEMS);
  return items;
}

export interface ReceptionSidebarProps {
  /** "desktop" renders as the permanent `lg:`-and-up sidebar; "drawer" renders full-bleed for the mobile slide-out panel. Same nav/role logic either way — one component, no duplicated authorization list. */
  variant?: "desktop" | "drawer";
  /** Drawer only: closes the drawer after a nav link is tapped, so picking a page doesn't leave the panel open behind it. */
  onNavigate?: () => void;
}

/** The Reception web app's sidebar — permanent on desktop (`variant="desktop"`), or the panel content for the mobile drawer (`variant="drawer"`). See Phase 5 of the reception-web brief. */
export function ReceptionSidebar({ variant = "desktop", onNavigate }: ReceptionSidebarProps) {
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
    <aside
      className={
        variant === "desktop"
          ? "hidden h-screen w-64 flex-shrink-0 flex-col border-r border-white/5 bg-surface lg:flex"
          : "flex h-full w-full flex-col bg-surface"
      }
    >
      <div className="flex items-center gap-3 px-6 py-6">
        <Image src="/emblem-red.png" alt="9th Round" width={32} height={32} />
        <div>
          <p className="text-sm font-semibold text-ink">9th Round</p>
          <p className="text-xs text-muted">Reception</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {navItemsForRole(role).map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onNavigate?.()}
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
