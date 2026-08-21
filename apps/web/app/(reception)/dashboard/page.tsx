"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { DashboardStats, ExpiringMembership, RecentCheckInEntry, TodayCheckInEntry } from "@9thround/reception";
import { useAuthStore } from "../../../src/features/auth/store";
import { getReceptionModule } from "../../../src/lib/composition-root";
import { StatCard } from "../../../src/components/ui/stat-card";
import { Button } from "../../../src/components/ui/button";
import { Card } from "../../../src/components/ui/card";
import { CheckInTrendChart } from "../../../src/components/check-in-trend-chart";
import { DashboardCheckInBox } from "../../../src/components/dashboard-check-in-box";

const canSeeRevenue = (role: string | null) => role === "branch_manager" || role === "super_admin";
const CAN_CHECK_IN = new Set(["reception", "branch_manager", "super_admin"]);

function MembersIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 17c.7-3.5 3.5-5.5 6.5-5.5s5.8 2 6.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckInIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 7.5h15" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 2v3M14 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <rect x="2.5" y="5.5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 9h15" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function AddMemberIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <circle cx="8" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 17c.6-3.2 3.1-5 6-5s5.4 1.8 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15.5 6v5M13 8.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MembershipIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 8h9M5.5 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ReportsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M4 16.5V9M10 16.5V4M16 16.5v-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface QuickAction {
  href: string;
  label: string;
  icon: () => JSX.Element;
}

/**
 * The Dashboard — real-time check-in scanner, a today-by-hour trend
 * (bucketed client-side from listToday(), no new query beyond a plain
 * check_ins read), recent check-ins, expiring memberships, and quick
 * actions, all on top of the app's existing dark theme and role-visibility
 * rules (money stays branch_manager/super_admin-only, matching Payroll and
 * the stat cards below).
 */
export default function DashboardPage() {
  const role = useAuthStore((state) => state.role);
  const branchId = useAuthStore((state) => state.branchId);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const [todayCheckIns, setTodayCheckIns] = useState<TodayCheckInEntry[]>([]);
  const [isLoadingTrend, setIsLoadingTrend] = useState(true);

  const [recentCheckIns, setRecentCheckIns] = useState<RecentCheckInEntry[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);

  const [expiring, setExpiring] = useState<ExpiringMembership[]>([]);
  const [isLoadingExpiring, setIsLoadingExpiring] = useState(true);

  const loadStats = useCallback(async () => {
    setIsLoadingStats(true);
    const result = await getReceptionModule().getDashboardStats.execute();
    if (result.isOk) setStats(result.value);
    setIsLoadingStats(false);
  }, []);

  const loadTrend = useCallback(async () => {
    setIsLoadingTrend(true);
    const result = await getReceptionModule().getTodayCheckIns.execute();
    if (result.isOk) setTodayCheckIns(result.value);
    setIsLoadingTrend(false);
  }, []);

  const loadRecent = useCallback(async () => {
    setIsLoadingRecent(true);
    const result = await getReceptionModule().listRecentCheckIns.execute();
    if (result.isOk) setRecentCheckIns(result.value);
    setIsLoadingRecent(false);
  }, []);

  const loadExpiring = useCallback(async () => {
    if (!branchId) return;
    setIsLoadingExpiring(true);
    const result = await getReceptionModule().listExpiringMemberships.execute(branchId);
    if (result.isOk) setExpiring(result.value.slice(0, 5));
    setIsLoadingExpiring(false);
  }, [branchId]);

  useEffect(() => {
    void loadStats();
    void loadTrend();
    void loadRecent();
    void loadExpiring();
  }, [loadStats, loadTrend, loadRecent, loadExpiring]);

  function handleCheckedIn() {
    void loadTrend();
    void loadRecent();
    void loadStats();
  }

  const quickActions: QuickAction[] = [
    { href: "/members/new", label: "Add Member", icon: AddMemberIcon },
    { href: "/members", label: "Members", icon: MembersIcon },
    { href: "/memberships", label: "Memberships", icon: MembershipIcon },
    { href: "/reports", label: "Reports", icon: ReportsIcon },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>

      {isLoadingStats ? (
        <p className="text-muted">Loading…</p>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Today's Check-Ins"
            value={isLoadingTrend ? "…" : todayCheckIns.length}
            icon={CheckInIcon}
          />
          <StatCard label="Active Members" value={stats.activeMembers} icon={MembersIcon} />
          <StatCard label="Expiring Soon" value={stats.expiringThisWeek} tone="warning" hint="Next 7 days" icon={CalendarIcon} />
          {canSeeRevenue(role) ? (
            <StatCard
              label="Today's Revenue"
              value={`${stats.dailyRevenue.toLocaleString()} EGP`}
              icon={WalletIcon}
            />
          ) : (
            <StatCard label="New Members Today" value={stats.newMembersToday} icon={AddMemberIcon} />
          )}
        </div>
      ) : (
        <p className="text-red-400">Could not load dashboard data.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {role && CAN_CHECK_IN.has(role) ? (
            <Card>
              <DashboardCheckInBox onCheckedIn={handleCheckedIn} />
            </Card>
          ) : null}

          <Card>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">Check-In Overview</h2>
                <p className="text-sm text-muted">Today, by hour</p>
              </div>
              <p className="text-2xl font-semibold text-gold">{isLoadingTrend ? "…" : todayCheckIns.length}</p>
            </div>
            {isLoadingTrend ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : (
              <CheckInTrendChart checkIns={todayCheckIns} />
            )}
          </Card>
        </div>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Recent Check-Ins</h2>
            <Link href="/members" className="text-xs font-medium text-gold hover:text-gold-soft">
              View all
            </Link>
          </div>
          {isLoadingRecent ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : recentCheckIns.length === 0 ? (
            <p className="text-sm text-muted">No check-ins yet today.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {recentCheckIns.slice(0, 8).map((entry) => (
                <li key={entry.checkInId} className="flex items-center gap-3 py-2.5">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gold/10 text-xs font-semibold text-gold">
                    {entry.memberName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/members/${entry.memberId}`}
                      className="block truncate text-sm font-medium text-ink hover:text-gold"
                    >
                      {entry.memberName}
                    </Link>
                    <p className="text-xs text-muted">{entry.checkedInAt.toLocaleTimeString()}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Memberships Expiring Soon</h2>
            <Link href="/expiring" className="text-xs font-medium text-gold hover:text-gold-soft">
              View all
            </Link>
          </div>
          {isLoadingExpiring ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : expiring.length === 0 ? (
            <p className="text-sm text-muted">No memberships expiring in the next 7 days.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted">
                  <tr>
                    <th className="py-2 pr-4">Member</th>
                    <th className="py-2 pr-4">Membership #</th>
                    <th className="py-2 pr-4">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {expiring.map((membership) => (
                    <tr key={membership.membershipId} className="border-t border-white/5">
                      <td className="py-2 pr-4">
                        <Link href={`/members/${membership.memberId}`} className="font-medium text-ink hover:text-gold">
                          {membership.memberFullName}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-muted">{membership.membershipNumber}</td>
                      <td className="py-2 pr-4 text-muted">{membership.endDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold text-ink">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <Button variant="secondary" className="w-full flex-col gap-1.5 py-4 text-xs">
                  <action.icon />
                  {action.label}
                </Button>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
