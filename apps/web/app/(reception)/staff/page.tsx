"use client";

import { useCallback, useState, type FormEvent } from "react";
import type { StaffCandidate, UserRoleName } from "@9thround/identity";
import { Role, USER_ROLES } from "@9thround/identity";
import { getIdentityModule, getSupabaseClient } from "../../../src/lib/composition-root";
import { useAuthStore } from "../../../src/features/auth/store";
import { Card } from "../../../src/components/ui/card";
import { TextField } from "../../../src/components/ui/text-field";
import { SelectField } from "../../../src/components/ui/select-field";
import { Button } from "../../../src/components/ui/button";
import { translateErrorCode } from "../../../src/lib/translate-error";

interface CreateAccountResponse {
  profileId?: string;
  error?: { code: string; message: string };
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
  const actingBranchId = useAuthStore((state) => state.branchId);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRoleName>("reception");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

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

  async function handleCreateAccount(event: FormEvent) {
    event.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    if (!actingBranchId) {
      setCreateError("Your own account has no branch assigned — cannot create a staff account.");
      return;
    }

    setIsCreating(true);
    const { data: sessionData } = await getSupabaseClient().auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setIsCreating(false);
      setCreateError(translateErrorCode("UNAUTHORIZED"));
      return;
    }

    const response = await fetch("/api/staff/create-account", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        email: newEmail,
        password: newPassword,
        fullName: newFullName,
        role: newRole,
        branchId: actingBranchId,
      }),
    });
    const body = (await response.json()) as CreateAccountResponse;
    setIsCreating(false);

    if (response.ok && body.profileId) {
      setCreateSuccess(`Account created for ${newFullName} (${newRole.replace("_", " ")}).`);
      setNewFullName("");
      setNewEmail("");
      setNewPassword("");
    } else {
      setCreateError(body.error ? translateErrorCode(body.error.code) : translateErrorCode("ACCOUNT_CREATE_FAILED"));
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
        <h2 className="text-lg font-semibold text-ink">Create New Account</h2>
        <p className="text-sm text-muted">
          For someone who has never signed in before — sets an email and temporary password they
          can log in with right away (and change later from their own device).
        </p>
        <Card>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void handleCreateAccount(event)}>
            <TextField
              label="Full name"
              value={newFullName}
              onChange={(event) => setNewFullName(event.target.value)}
              required
            />
            <TextField
              label="Email"
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              required
            />
            <TextField
              label="Temporary password"
              type="text"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={6}
              required
            />
            <SelectField
              label="Role"
              value={newRole}
              onChange={(event) => setNewRole(event.target.value as UserRoleName)}
            >
              {assignableRoles
                .filter((role) => role !== "member")
                .map((role) => (
                  <option key={role} value={role}>
                    {role.replace("_", " ")}
                  </option>
                ))}
            </SelectField>

            {createError ? <p className="sm:col-span-2 text-sm text-red-400">{createError}</p> : null}
            {createSuccess ? (
              <p className="sm:col-span-2 text-sm text-emerald-400">{createSuccess}</p>
            ) : null}

            <div className="sm:col-span-2">
              <Button type="submit" isLoading={isCreating}>
                Create Account
              </Button>
            </div>
          </form>
        </Card>
      </div>

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
                  </div>
                  <div className="flex items-center gap-3">
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
