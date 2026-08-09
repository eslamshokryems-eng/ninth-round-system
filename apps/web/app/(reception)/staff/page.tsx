"use client";

import { useCallback, useState } from "react";
import type { StaffCandidate, UserRoleName } from "@9thround/identity";
import { Role, USER_ROLES } from "@9thround/identity";
import { getIdentityModule } from "../../../src/lib/composition-root";
import { useAuthStore } from "../../../src/features/auth/store";
import { Card } from "../../../src/components/ui/card";
import { TextField } from "../../../src/components/ui/text-field";
import { SelectField } from "../../../src/components/ui/select-field";
import { Button } from "../../../src/components/ui/button";
import { translateErrorCode } from "../../../src/lib/translate-error";

/**
 * "Approve staff accounts" (docs/12-roles-and-permissions.md §12.6) — a
 * super_admin/branch_manager searches an existing account by name and
 * assigns it a role. `Role.canAssignRole` (already tested in
 * packages/identity) is the real authority on what a given acting role may
 * grant; this page only filters the dropdown to match so the UI doesn't
 * offer a choice the backend would reject.
 */
export default function StaffPage() {
  const actingRole = useAuthStore((state) => state.role);
  const actingProfileId = useAuthStore((state) => state.profileId);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  async function handleAssignRole(target: StaffCandidate, newRole: UserRoleName) {
    if (!actingProfileId || newRole === target.role) return;
    setError(null);
    setSuccessMessage(null);
    setPendingProfileId(target.profileId);

    const result = await getIdentityModule().assignStaffRole.execute({
      actingProfileId,
      targetProfileId: target.profileId,
      newRole,
    });

    setPendingProfileId(null);
    if (result.isOk) {
      setSuccessMessage(`${target.fullName ?? "Account"} is now ${newRole.replace("_", " ")}.`);
      setResults((prev) =>
        prev.map((c) => (c.profileId === target.profileId ? { ...c, role: newRole } : c)),
      );
    } else {
      setError(translateErrorCode(result.error.code));
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
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Manage Staff</h1>
      <p className="text-sm text-muted">
        Search for an existing account by name and assign it a role. A new account is created the
        first time someone signs in through the mobile or web app — search for them here afterward
        to grant Reception, Coach, Branch Manager, or Super Admin access.
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
                      <option key={role} value={role} disabled={role !== candidate.role && !assignableRoles.includes(role)}>
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
  );
}
