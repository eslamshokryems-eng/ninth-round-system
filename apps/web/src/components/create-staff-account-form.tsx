"use client";

import { useState, type FormEvent } from "react";
import type { StaffCandidate, UserRoleName } from "@9thround/identity";
import { Role, USER_ROLES } from "@9thround/identity";
import { useAuthStore } from "../features/auth/store";
import { getSupabaseClient } from "../lib/composition-root";
import { translateErrorCode } from "../lib/translate-error";
import { Card } from "./ui/card";
import { TextField } from "./ui/text-field";
import { SelectField } from "./ui/select-field";
import { Button } from "./ui/button";
import { StaffPicker } from "./staff-picker";

interface ApiErrorBody {
  error?: { code: string; message: string };
}

async function authorizedFetch(path: string, body: unknown): Promise<Response | null> {
  const { data: sessionData } = await getSupabaseClient().auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return null;
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
}

/**
 * "Add Employee" (docs/phase-1/16-employee-login.md) — two steps, both
 * branch_manager/super_admin only, both reachable from Manage Staff and
 * HR's Employees tab. No email/password is ever asked for here: step 1
 * (this form) collects only name/phone/address/role and returns a real
 * Employee ID from /api/staff/create-account; step 2 (below) sets a real
 * password for that ID via /api/staff/set-password, since the account
 * created in step 1 has only a random, unusable placeholder password.
 */
export function CreateStaffAccountForm() {
  const actingRole = useAuthStore((state) => state.role);
  const actingBranchId = useAuthStore((state) => state.branchId);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [role, setRole] = useState<UserRoleName>("reception");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdEmployeeCode, setCreatedEmployeeCode] = useState<string | null>(null);

  const [passwordTarget, setPasswordTarget] = useState<StaffCandidate | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  if (actingRole !== "branch_manager" && actingRole !== "super_admin") return null;

  const assignableRoles = USER_ROLES.filter((r) => Role.of(actingRole).canAssignRole(r) && r !== "member");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setCreatedEmployeeCode(null);

    if (!actingBranchId) {
      setError("Your own account has no branch assigned — cannot add an employee.");
      return;
    }

    setIsCreating(true);
    const response = await authorizedFetch("/api/staff/create-account", {
      fullName,
      phone,
      address,
      role,
      branchId: actingBranchId,
    });
    setIsCreating(false);

    if (!response) {
      setError(translateErrorCode("UNAUTHORIZED"));
      return;
    }
    const responseBody = (await response.json()) as { profileId?: string; employeeCode?: string } & ApiErrorBody;
    if (response.ok && responseBody.employeeCode) {
      setCreatedEmployeeCode(responseBody.employeeCode);
      setFullName("");
      setPhone("");
      setAddress("");
    } else {
      setError(responseBody.error ? translateErrorCode(responseBody.error.code) : translateErrorCode("ACCOUNT_CREATE_FAILED"));
    }
  }

  async function handleSetPassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    if (!passwordTarget) return;

    setIsSettingPassword(true);
    const response = await authorizedFetch("/api/staff/set-password", {
      profileId: passwordTarget.profileId,
      password: newPassword,
    });
    setIsSettingPassword(false);

    if (!response) {
      setPasswordError(translateErrorCode("UNAUTHORIZED"));
      return;
    }
    const responseBody = (await response.json()) as { ok?: boolean } & ApiErrorBody;
    if (response.ok && responseBody.ok) {
      setPasswordSuccess(`Password set for ${passwordTarget.fullName ?? "employee"}.`);
      setPasswordTarget(null);
      setNewPassword("");
    } else {
      setPasswordError(responseBody.error ? translateErrorCode(responseBody.error.code) : translateErrorCode("ACCOUNT_CREATE_FAILED"));
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Add Employee</h2>
        <p className="text-sm text-muted">
          Just their details — no email or password needed here. They get a real Employee ID right
          away; use Set Password below (or later) to actually enable their login.
        </p>
        <Card>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void handleSubmit(event)}>
            <TextField label="Full name" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
            <TextField label="Phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required />
            <div className="sm:col-span-2">
              <TextField label="Address (optional)" value={address} onChange={(event) => setAddress(event.target.value)} />
            </div>
            <SelectField label="Role" value={role} onChange={(event) => setRole(event.target.value as UserRoleName)}>
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {r.replace("_", " ")}
                </option>
              ))}
            </SelectField>

            {error ? <p className="sm:col-span-2 text-sm text-red-400">{error}</p> : null}
            {createdEmployeeCode ? (
              <p className="sm:col-span-2 text-sm text-emerald-400">
                Employee added. Their ID is <span className="font-semibold">{createdEmployeeCode}</span> — use
                Set Password below to enable their login.
              </p>
            ) : null}

            <div className="sm:col-span-2">
              <Button type="submit" isLoading={isCreating}>
                Add Employee
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Set Password</h2>
        <p className="text-sm text-muted">
          Enables login for an employee added above (or resets an existing one). Give them their
          Employee ID and this password to sign in.
        </p>
        <Card>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void handleSetPassword(event)}>
            <div className="sm:col-span-2">
              <StaffPicker selected={passwordTarget} onSelect={setPasswordTarget} />
            </div>
            <TextField
              label="New password"
              type="text"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={6}
              required
            />
            {passwordError ? <p className="sm:col-span-2 text-sm text-red-400">{passwordError}</p> : null}
            {passwordSuccess ? <p className="sm:col-span-2 text-sm text-emerald-400">{passwordSuccess}</p> : null}
            <div className="sm:col-span-2">
              <Button type="submit" isLoading={isSettingPassword} disabled={!passwordTarget}>
                Set Password
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
