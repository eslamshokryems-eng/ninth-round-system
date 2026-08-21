"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type { StaffPresence, UserRoleName } from "@9thround/identity";
import { Role, USER_ROLES } from "@9thround/identity";
import { getIdentityModule } from "../../../src/lib/composition-root";
import { useAuthStore } from "../../../src/features/auth/store";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { authorizedFetch, type ApiErrorBody } from "../../../src/lib/authorized-fetch";
import { Card } from "../../../src/components/ui/card";
import { Button } from "../../../src/components/ui/button";
import { TextField } from "../../../src/components/ui/text-field";
import { SelectField } from "../../../src/components/ui/select-field";
import { CreateStaffAccountForm } from "../../../src/components/create-staff-account-form";

const PAGE_SIZE = 15;
const ONLINE_WINDOW_MS = 100_000;

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
 * Employees (HR tab) — every staff account in one paginated list, same
 * shape as the Members list. Branch Manager can add an employee and change
 * a password; Super Admin can additionally delete an account outright
 * (packages/identity's StaffPresence + /api/staff/delete-account).
 */
export function EmployeesTab() {
  const actingRole = useAuthStore((state) => state.role);
  const actingProfileId = useAuthStore((state) => state.profileId);
  const isSuperAdmin = actingRole === "super_admin";

  const [roster, setRoster] = useState<StaffPresence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [pendingActiveToggleId, setPendingActiveToggleId] = useState<string | null>(null);
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowSuccess, setRowSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const result = await getIdentityModule().listStaffPresence.execute();
    setIsLoading(false);
    if (result.isErr) {
      setLoadError(translateErrorCode(result.error.code));
      return;
    }
    setRoster(result.value);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const assignableRoles = actingRole ? USER_ROLES.filter((role) => Role.of(actingRole).canAssignRole(role)) : [];

  const filtered = query.trim()
    ? roster.filter((staff) => {
        const q = query.trim().toLowerCase();
        return (
          (staff.fullName ?? "").toLowerCase().includes(q) ||
          (staff.employeeCode ?? "").toLowerCase().includes(q) ||
          (staff.phone ?? "").toLowerCase().includes(q)
        );
      })
    : roster;

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function toggleExpanded(profileId: string) {
    setExpandedId((current) => (current === profileId ? null : profileId));
    setNewPassword("");
    setDeleteConfirmId(null);
    setRowError(null);
    setRowSuccess(null);
  }

  async function handleSetPassword(profileId: string) {
    setRowError(null);
    setRowSuccess(null);
    setIsSettingPassword(true);

    const response = await authorizedFetch("/api/staff/set-password", { profileId, password: newPassword });
    setIsSettingPassword(false);

    if (!response) {
      setRowError(translateErrorCode("UNAUTHORIZED"));
      return;
    }
    const responseBody = (await response.json()) as { ok?: boolean } & ApiErrorBody;
    if (response.ok && responseBody.ok) {
      setRowSuccess("Password updated.");
      setNewPassword("");
    } else {
      setRowError(responseBody.error ? translateErrorCode(responseBody.error.code) : translateErrorCode("ACCOUNT_CREATE_FAILED"));
    }
  }

  async function handleToggleActive(staff: StaffPresence) {
    setRowError(null);
    setRowSuccess(null);
    setPendingActiveToggleId(staff.profileId);

    const nextIsActive = !staff.isActive;
    const response = await authorizedFetch("/api/staff/set-active-status", { profileId: staff.profileId, isActive: nextIsActive });
    setPendingActiveToggleId(null);

    if (!response) {
      setRowError(translateErrorCode("UNAUTHORIZED"));
      return;
    }
    const responseBody = (await response.json()) as { ok?: boolean } & ApiErrorBody;
    if (response.ok && responseBody.ok) {
      setRoster((prev) => prev.map((s) => (s.profileId === staff.profileId ? { ...s, isActive: nextIsActive } : s)));
      setRowSuccess(nextIsActive ? "Employee activated." : "Employee deactivated.");
    } else {
      setRowError(responseBody.error ? translateErrorCode(responseBody.error.code) : translateErrorCode("SET_ACTIVE_STATUS_FAILED"));
    }
  }

  async function handleRoleChange(staff: StaffPresence, newRole: UserRoleName) {
    if (!actingProfileId || newRole === staff.role) return;
    setRowError(null);
    setRowSuccess(null);
    setPendingRoleId(staff.profileId);

    const result = await getIdentityModule().assignStaffRole.execute({
      actingProfileId,
      targetProfileId: staff.profileId,
      newRole,
    });
    setPendingRoleId(null);

    if (result.isOk) {
      setRoster((prev) => prev.map((s) => (s.profileId === staff.profileId ? { ...s, role: newRole } : s)));
      setRowSuccess(`Role changed to ${newRole.replace("_", " ")}.`);
    } else {
      setRowError(translateErrorCode(result.error.code));
    }
  }

  async function handleDelete(profileId: string) {
    setRowError(null);
    setRowSuccess(null);
    setIsDeleting(true);

    const response = await authorizedFetch("/api/staff/delete-account", { profileId });
    setIsDeleting(false);

    if (!response) {
      setRowError(translateErrorCode("UNAUTHORIZED"));
      return;
    }
    const responseBody = (await response.json()) as { ok?: boolean } & ApiErrorBody;
    if (response.ok && responseBody.ok) {
      setRoster((prev) => prev.filter((s) => s.profileId !== profileId));
      setExpandedId(null);
      setDeleteConfirmId(null);
    } else {
      setRowError(responseBody.error ? translateErrorCode(responseBody.error.code) : translateErrorCode("DELETE_EMPLOYEE_FAILED"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Every staff account, in one place.</p>
        <Button onClick={() => setIsAddOpen((open) => !open)}>{isAddOpen ? "Close" : "+ Add Employee"}</Button>
      </div>

      {isAddOpen ? (
        <Card>
          <CreateStaffAccountForm />
        </Card>
      ) : null}

      <TextField
        label="Search"
        placeholder="Search by name, Employee ID, or phone"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
        }}
      />

      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : loadError ? (
        <p className="text-red-400">{loadError}</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted">{query.trim() ? "No employees found." : "No employees yet."}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-card border border-white/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Employee ID</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Manage</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((staff) => {
                  const isOnline = staff.lastSeenAt ? Date.now() - staff.lastSeenAt.getTime() < ONLINE_WINDOW_MS : false;
                  const isExpanded = expandedId === staff.profileId;
                  return (
                    <Fragment key={staff.profileId}>
                      <tr className="border-t border-white/5">
                        <td className="px-4 py-3 text-ink">{staff.fullName ?? "—"}</td>
                        <td className="px-4 py-3 text-muted">{staff.employeeCode ?? "—"}</td>
                        <td className="px-4 py-3 capitalize text-muted">{staff.role.replace("_", " ")}</td>
                        <td className="px-4 py-3 text-muted">{staff.phone ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-400" : "bg-white/20"}`} />
                            <span className={staff.isActive ? "text-muted" : "text-red-400"}>
                              {!staff.isActive ? "Deactivated" : isOnline ? "Online" : staff.lastSeenAt ? `Last seen ${timeAgo(staff.lastSeenAt)}` : "Never signed in"}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(staff.profileId)}
                            className="text-xs font-medium text-gold hover:text-gold-soft"
                          >
                            {isExpanded ? "Close" : "Manage"}
                          </button>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="border-t border-white/5 bg-black/20">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="flex flex-wrap items-end gap-4">
                              <div className="w-64">
                                <TextField
                                  label="New password"
                                  value={newPassword}
                                  onChange={(event) => setNewPassword(event.target.value)}
                                  minLength={6}
                                />
                              </div>
                              <Button
                                variant="secondary"
                                isLoading={isSettingPassword}
                                disabled={newPassword.length < 6}
                                onClick={() => void handleSetPassword(staff.profileId)}
                              >
                                Set Password
                              </Button>

                              <SelectField
                                label="Role"
                                className="w-44"
                                value={staff.role}
                                disabled={pendingRoleId === staff.profileId}
                                onChange={(event) => void handleRoleChange(staff, event.target.value as UserRoleName)}
                              >
                                {USER_ROLES.map((role) => (
                                  <option key={role} value={role} disabled={role !== staff.role && !assignableRoles.includes(role)}>
                                    {role.replace("_", " ")}
                                  </option>
                                ))}
                              </SelectField>

                              <Button
                                variant={staff.isActive ? "danger" : "secondary"}
                                isLoading={pendingActiveToggleId === staff.profileId}
                                disabled={staff.profileId === actingProfileId}
                                onClick={() => void handleToggleActive(staff)}
                              >
                                {staff.isActive ? "Deactivate" : "Activate"}
                              </Button>

                              {isSuperAdmin ? (
                                deleteConfirmId === staff.profileId ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-red-400">Permanently delete this account?</span>
                                    <Button variant="danger" isLoading={isDeleting} onClick={() => void handleDelete(staff.profileId)}>
                                      Yes, Delete
                                    </Button>
                                    <Button variant="secondary" type="button" onClick={() => setDeleteConfirmId(null)} disabled={isDeleting}>
                                      Cancel
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    variant="danger"
                                    disabled={staff.profileId === actingProfileId}
                                    onClick={() => setDeleteConfirmId(staff.profileId)}
                                  >
                                    Delete Employee
                                  </Button>
                                )
                              ) : null}
                            </div>
                            {rowError ? <p className="mt-2 text-sm text-red-400">{rowError}</p> : null}
                            {rowSuccess ? <p className="mt-2 text-sm text-emerald-400">{rowSuccess}</p> : null}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pageCount > 1 ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">
                Page {currentPage} of {pageCount} — {filtered.length} employee{filtered.length === 1 ? "" : "s"}
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                  Previous
                </Button>
                <Button variant="secondary" type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={currentPage >= pageCount}>
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
