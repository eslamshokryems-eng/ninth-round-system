"use client";

import { useState, type FormEvent } from "react";
import type { UserRoleName } from "@9thround/identity";
import { Role, USER_ROLES } from "@9thround/identity";
import { useAuthStore } from "../features/auth/store";
import { getSupabaseClient } from "../lib/composition-root";
import { translateErrorCode } from "../lib/translate-error";
import { Card } from "./ui/card";
import { TextField } from "./ui/text-field";
import { SelectField } from "./ui/select-field";
import { Button } from "./ui/button";

interface CreateAccountResponse {
  profileId?: string;
  error?: { code: string; message: string };
}

/**
 * "Create a new employee login" — extracted so it can be reached both from
 * Manage Staff and HR's Employees tab (both branch_manager/super_admin
 * only) without duplicating the /api/staff/create-account call. See
 * docs/phase-1/15-reception-web-app.md §15.8.
 */
export function CreateStaffAccountForm() {
  const actingRole = useAuthStore((state) => state.role);
  const actingBranchId = useAuthStore((state) => state.branchId);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRoleName>("reception");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (actingRole !== "branch_manager" && actingRole !== "super_admin") return null;

  const assignableRoles = USER_ROLES.filter((r) => Role.of(actingRole).canAssignRole(r) && r !== "member");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!actingBranchId) {
      setError("Your own account has no branch assigned — cannot create a staff account.");
      return;
    }

    setIsCreating(true);
    const { data: sessionData } = await getSupabaseClient().auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setIsCreating(false);
      setError(translateErrorCode("UNAUTHORIZED"));
      return;
    }

    const response = await fetch("/api/staff/create-account", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ email, password, fullName, role, branchId: actingBranchId }),
    });
    const body = (await response.json()) as CreateAccountResponse;
    setIsCreating(false);

    if (response.ok && body.profileId) {
      setSuccessMessage(`Account created for ${fullName} (${role.replace("_", " ")}).`);
      setFullName("");
      setEmail("");
      setPassword("");
    } else {
      setError(body.error ? translateErrorCode(body.error.code) : translateErrorCode("ACCOUNT_CREATE_FAILED"));
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-ink">Add Employee</h2>
      <p className="text-sm text-muted">
        For someone who has never signed in before — sets an email and temporary password they can
        log in with right away (and change later from their own device).
      </p>
      <Card>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void handleSubmit(event)}>
          <TextField label="Full name" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
          <TextField label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <TextField
            label="Temporary password"
            type="text"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required
          />
          <SelectField label="Role" value={role} onChange={(event) => setRole(event.target.value as UserRoleName)}>
            {assignableRoles.map((r) => (
              <option key={r} value={r}>
                {r.replace("_", " ")}
              </option>
            ))}
          </SelectField>

          {error ? <p className="sm:col-span-2 text-sm text-red-400">{error}</p> : null}
          {successMessage ? <p className="sm:col-span-2 text-sm text-emerald-400">{successMessage}</p> : null}

          <div className="sm:col-span-2">
            <Button type="submit" isLoading={isCreating}>
              Add Employee
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
