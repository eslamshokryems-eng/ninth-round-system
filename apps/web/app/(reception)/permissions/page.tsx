"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Permission, RolePermission, StaffCandidate, UserPermissionOverride, UserRoleName } from "@9thround/identity";
import { useAuthStore } from "../../../src/features/auth/store";
import { getIdentityModule } from "../../../src/lib/composition-root";
import { Card } from "../../../src/components/ui/card";
import { Button } from "../../../src/components/ui/button";
import { StaffPicker } from "../../../src/components/staff-picker";
import { translateErrorCode } from "../../../src/lib/translate-error";

const EDITABLE_ROLES: UserRoleName[] = ["branch_manager", "reception", "sales_employee", "coach"];

/**
 * Permissions (docs/phase-1/17-audit-log-and-permissions.md) — Super Admin
 * only. Two editors: a role-level default matrix, and per-account
 * overrides. Both call SECURITY DEFINER SQL functions
 * (set_role_permission()/set_user_permission_override()/clear_user_
 * permission_override()) that re-check is_super_admin() themselves and
 * log every change to the Audit Log — this page cannot grant anything the
 * database wouldn't also allow the same caller to grant directly.
 */
export default function PermissionsPage() {
  const role = useAuthStore((state) => state.role);

  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const [overrideTarget, setOverrideTarget] = useState<StaffCandidate | null>(null);
  const [overrides, setOverrides] = useState<UserPermissionOverride[]>([]);
  const [isLoadingOverrides, setIsLoadingOverrides] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const identity = getIdentityModule();
    const [catalogResult, roleResult] = await Promise.all([
      identity.listPermissionCatalog.execute(),
      identity.listRolePermissions.execute(),
    ]);
    setIsLoading(false);
    if (catalogResult.isErr) {
      setErrorMessage(translateErrorCode(catalogResult.error.code));
      return;
    }
    if (roleResult.isErr) {
      setErrorMessage(translateErrorCode(roleResult.error.code));
      return;
    }
    setCatalog(catalogResult.value);
    setRolePermissions(roleResult.value);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadOverrides = useCallback(async (profileId: string) => {
    setIsLoadingOverrides(true);
    const result = await getIdentityModule().listUserPermissionOverrides.execute({ profileId });
    setIsLoadingOverrides(false);
    if (result.isOk) setOverrides(result.value);
  }, []);

  useEffect(() => {
    if (overrideTarget) void loadOverrides(overrideTarget.profileId);
  }, [overrideTarget, loadOverrides]);

  const grantedByRole = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const role of EDITABLE_ROLES) map.set(role, new Set());
    for (const rp of rolePermissions) {
      map.get(rp.role)?.add(rp.permissionKey);
    }
    return map;
  }, [rolePermissions]);

  const categories = useMemo(() => {
    const set = new Set(catalog.map((p) => p.category));
    return Array.from(set);
  }, [catalog]);

  async function toggleRolePermission(targetRole: UserRoleName, permissionKey: string, granted: boolean) {
    setPendingKey(`${targetRole}:${permissionKey}`);
    setErrorMessage(null);
    const result = await getIdentityModule().setRolePermission.execute({ role: targetRole, permissionKey, granted });
    setPendingKey(null);
    if (result.isErr) {
      setErrorMessage(translateErrorCode(result.error.code));
      return;
    }
    setRolePermissions((prev) => {
      const withoutThis = prev.filter((rp) => !(rp.role === targetRole && rp.permissionKey === permissionKey));
      return granted ? [...withoutThis, { role: targetRole, permissionKey }] : withoutThis;
    });
  }

  async function setOverride(permissionKey: string, granted: boolean) {
    if (!overrideTarget) return;
    setPendingKey(permissionKey);
    setErrorMessage(null);
    const result = await getIdentityModule().setUserPermissionOverride.execute({
      profileId: overrideTarget.profileId,
      permissionKey,
      granted,
    });
    setPendingKey(null);
    if (result.isErr) {
      setErrorMessage(translateErrorCode(result.error.code));
      return;
    }
    void loadOverrides(overrideTarget.profileId);
  }

  async function clearOverride(permissionKey: string) {
    if (!overrideTarget) return;
    setPendingKey(permissionKey);
    setErrorMessage(null);
    const result = await getIdentityModule().clearUserPermissionOverride.execute({
      profileId: overrideTarget.profileId,
      permissionKey,
    });
    setPendingKey(null);
    if (result.isErr) {
      setErrorMessage(translateErrorCode(result.error.code));
      return;
    }
    void loadOverrides(overrideTarget.profileId);
  }

  if (role !== "super_admin") {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <p className="text-ink">Permissions management is only available to Super Admin accounts.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <h1 className="text-2xl font-semibold text-ink">Permissions</h1>

      {errorMessage ? <p className="text-sm text-red-400">{errorMessage}</p> : null}

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Role Defaults</h2>
          <p className="text-sm text-muted">
            What each role can do by default. Super Admin always has full access and is not shown here.
          </p>
        </div>

        {isLoading ? (
          <p className="text-muted">Loading…</p>
        ) : (
          categories.map((category) => (
            <Card key={category} className="space-y-3">
              <h3 className="text-sm font-semibold capitalize text-gold">{category.replace(/_/g, " ")}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted">
                    <tr>
                      <th className="py-2 pr-4">Permission</th>
                      {EDITABLE_ROLES.map((r) => (
                        <th key={r} className="px-2 py-2 text-center capitalize">
                          {r.replace("_", " ")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {catalog
                      .filter((p) => p.category === category)
                      .map((permission) => (
                        <tr key={permission.key} className="border-t border-white/5">
                          <td className="py-2 pr-4 text-ink">
                            {permission.key}
                            <p className="text-xs text-muted">{permission.description}</p>
                          </td>
                          {EDITABLE_ROLES.map((r) => {
                            const isGranted = grantedByRole.get(r)?.has(permission.key) ?? false;
                            const isPending = pendingKey === `${r}:${permission.key}`;
                            return (
                              <td key={r} className="px-2 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={isGranted}
                                  disabled={isPending}
                                  onChange={(e) => void toggleRolePermission(r, permission.key, e.target.checked)}
                                  className="h-4 w-4 accent-gold"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))
        )}
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Per-Account Overrides</h2>
          <p className="text-sm text-muted">
            Grant or revoke a specific permission for one account, overriding its role default.
          </p>
        </div>

        <StaffPicker selected={overrideTarget} onSelect={setOverrideTarget} label="Account" />

        {overrideTarget ? (
          isLoadingOverrides ? (
            <p className="text-muted">Loading…</p>
          ) : (
            <div className="overflow-x-auto rounded-card border border-white/5">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface text-xs uppercase text-muted">
                  <tr>
                    <th className="px-4 py-3">Permission</th>
                    <th className="px-4 py-3">Role default</th>
                    <th className="px-4 py-3">Override</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map((permission) => {
                    const roleDefault = grantedByRole.get(overrideTarget.role)?.has(permission.key) ?? false;
                    const override = overrides.find((o) => o.permissionKey === permission.key);
                    const isPending = pendingKey === permission.key;
                    return (
                      <tr key={permission.key} className="border-t border-white/5">
                        <td className="px-4 py-3 text-ink">{permission.key}</td>
                        <td className="px-4 py-3 text-muted">{roleDefault ? "Granted" : "Not granted"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Button
                              variant={override?.granted === true ? "primary" : "secondary"}
                              disabled={isPending}
                              onClick={() => void setOverride(permission.key, true)}
                              className="px-2 py-1 text-xs"
                            >
                              Grant
                            </Button>
                            <Button
                              variant={override?.granted === false ? "primary" : "secondary"}
                              disabled={isPending}
                              onClick={() => void setOverride(permission.key, false)}
                              className="px-2 py-1 text-xs"
                            >
                              Revoke
                            </Button>
                            {override ? (
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => void clearOverride(permission.key)}
                                className="text-xs text-muted hover:text-ink"
                              >
                                Clear
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
