"use client";

import { useCallback, useEffect, useState } from "react";
import type { StaffCandidate, StaffPresence, UserRoleName } from "@9thround/identity";
import { Role, USER_ROLES } from "@9thround/identity";
import { getIdentityModule } from "../../../src/lib/composition-root";
import { useAuthStore } from "../../../src/features/auth/store";
import { Card } from "../../../src/components/ui/card";
import { TextField } from "../../../src/components/ui/text-field";
import { SelectField } from "../../../src/components/ui/select-field";
import { Button } from "../../../src/components/ui/button";
import { CreateStaffAccountForm } from "../../../src/components/create-staff-account-form";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { authorizedFetch, type ApiErrorBody } from "../../../src/lib/authorized-fetch";

// A little over 2x the 45s heartbeat interval (use-heartbeat.ts) — allows
// for one missed beat (a slow network tick) without flipping to offline.
const ONLINE_WINDOW_MS = 100_000;
const ROSTER_REFRESH_MS = 30_000;

function timeAgo(date: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/**
 * "Approve staff accounts" (docs/12-roles-and-permissions.md §12.6) — a
 * super_admin/branch_manager either creates a brand-new login (email +
 * temporary password, via the /api/staff/create-account Route Handler,
 * the only place this app uses the service_role key) or searches an
 * existing account by name and assigns it a role. `Role.canAssignRole`
 * (already tested in packages/identity) is the real authority on what a
 * given acting role may grant; this page only filters choices to match so
 * the UI doesn't offer one the backend would reject.
 */
export default function StaffPage() {
  const actingRole = useAuthStore((state) => state.role);
  const actingProfileId = useAuthStore((state) => state.profileId);
  const [pendingActiveToggleId, setPendingActiveToggleId] = useState<string | null>(null);

  const [roster, setRoster] = useState<StaffPresence[]>([]);
  const [isLoadingRoster, setIsLoadingRoster] = useState(true);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadRoster = useCallback(async () => {
    const result = await getIdentityModule().listStaffPresence.execute();
    setIsLoadingRoster(false);
    if (result.isOk) setRoster(result.value);
  }, []);

  useEffect(() => {
    void loadRoster();
    const interval = setInterval(() => void loadRoster(), ROSTER_REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadRoster]);

  const runSearch = useCallback(async (value: string) => {
    setQuery(value);
    setError(null);
    setSuccessMessage(null);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    const result = await getIdentityModule().searchStaffCandidates.execute({ query: value });
    setIsSearching(false);
    if (result.isOk) {
      setResults(result.value);
    } else {
      setError(translateErrorCode(result.error.code));
    }
  }, []);

  async function handleAssignRole(target: StaffCandidate, roleToAssign: UserRoleName) {
    if (!actingProfileId || roleToAssign === target.role) return;
    setError(null);
    setSuccessMessage(null);
    setPendingProfileId(target.profileId);

    const result = await getIdentityModule().assignStaffRole.execute({
      actingProfileId,
      targetProfileId: target.profileId,
      newRole: roleToAssign,
    });

    setPendingProfileId(null);
    if (result.isOk) {
      setSuccessMessage(`${target.fullName ?? "Account"} is now ${roleToAssign.replace("_", " ")}.`);
      setResults((prev) =>
        prev.map((c) => (c.profileId === target.profileId ? { ...c, role: roleToAssign } : c)),
      );
    } else {
      setError(translateErrorCode(result.error.code));
    }
  }

  async function handleToggleActive(target: StaffCandidate) {
    setError(null);
    setSuccessMessage(null);
    setPendingActiveToggleId(target.profileId);

    const nextIsActive = !target.isActive;
    const response = await authorizedFetch("/api/staff/set-active-status", {
      profileId: target.profileId,
      isActive: nextIsActive,
    });

    setPendingActiveToggleId(null);

    if (!response) {
      setError(translateErrorCode("UNAUTHORIZED"));
      return;
    }
    const responseBody = (await response.json()) as { ok?: boolean } & ApiErrorBody;
    if (response.ok && responseBody.ok) {
      setSuccessMessage(`${target.fullName ?? "Account"} is now ${nextIsActive ? "active" : "deactivated"}.`);
      setResults((prev) =>
        prev.map((c) => (c.profileId === target.profileId ? { ...c, isActive: nextIsActive } : c)),
      );
    } else {
      setError(responseBody.error ? translateErrorCode(responseBody.error.code) : translateErrorCode("SET_ACTIVE_STATUS_FAILED"));
    }
  }

  if (actingRole !== "branch_manager" && actingRole !== "super_admin") {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <p className="text-ink">
            Manage Staff is only available to Branch Manager and Super Admin accounts.
          </p>
        </Card>
      </div>
    );
  }

  const assignableRoles = USER_ROLES.filter((role) => Role.of(actingRole).canAssignRole(role));

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Manage Staff</h1>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Staff Roster</h2>
        <p className="text-sm text-muted">
          Who&apos;s currently using the system. &quot;Online&quot; means the app has checked in
          within the last couple of minutes — closing the tab/app will show them as offline shortly
          after.
        </p>
        {isLoadingRoster ? (
          <p className="text-muted">Loading…</p>
        ) : roster.length === 0 ? (
          <p className="text-muted">No staff accounts yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-white/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((staff) => {
                  const isOnline = staff.lastSeenAt
                    ? Date.now() - staff.lastSeenAt.getTime() < ONLINE_WINDOW_MS
                    : false;
                  return (
                    <tr key={staff.profileId} className="border-t border-white/5">
                      <td className="px-4 py-3 text-ink">{staff.fullName ?? "—"}</td>
                      <td className="px-4 py-3 capitalize text-muted">{staff.role.replace("_", " ")}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-400" : "bg-white/20"}`}
                          />
                          <span className={isOnline ? "text-emerald-400" : "text-muted"}>
                            {isOnline
                              ? "Online"
                              : staff.lastSeenAt
                                ? `Last seen ${timeAgo(staff.lastSeenAt)}`
                                : "Never signed in"}
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateStaffAccountForm />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Change an Existing Account&apos;s Role</h2>
        <p className="text-sm text-muted">
          Search for an account by name and assign it a different role.
        </p>

        <TextField
          label="Search by name"
          placeholder="Full name"
          value={query}
          onChange={(event) => void runSearch(event.target.value)}
        />

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {successMessage ? <p className="text-sm text-emerald-400">{successMessage}</p> : null}

        {isSearching ? (
          <p className="text-muted">Searching…</p>
        ) : results.length > 0 ? (
          <div className="space-y-3">
            {results.map((candidate) => (
              <Card key={candidate.profileId}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-ink">{candidate.fullName ?? "—"}</p>
                    <p className="text-xs capitalize text-muted">
                      Current role: {candidate.role.replace("_", " ")}
                    </p>
                    <p className={`text-xs ${candidate.isActive ? "text-emerald-400" : "text-red-400"}`}>
                      {candidate.isActive ? "Active" : "Deactivated"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant={candidate.isActive ? "danger" : "secondary"}
                      isLoading={pendingActiveToggleId === candidate.profileId}
                      disabled={candidate.profileId === actingProfileId}
                      onClick={() => void handleToggleActive(candidate)}
                      className="px-3 py-1.5 text-xs"
                    >
                      {candidate.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <SelectField
                      label="New role"
                      className="w-48"
                      value={candidate.role}
                      disabled={pendingProfileId === candidate.profileId}
                      onChange={(event) =>
                        void handleAssignRole(candidate, event.target.value as UserRoleName)
                      }
                    >
                      {USER_ROLES.map((role) => (
                        <option
                          key={role}
                          value={role}
                          disabled={role !== candidate.role && !assignableRoles.includes(role)}
                        >
                          {role.replace("_", " ")}
                        </option>
                      ))}
                    </SelectField>
                    {pendingProfileId === candidate.profileId ? (
                      <Button variant="ghost" isLoading disabled>
                        Saving
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : query.trim().length >= 2 ? (
          <p className="text-muted">No accounts found.</p>
        ) : null}
      </div>
    </div>
  );
}
