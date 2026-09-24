"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "../../../src/features/auth/store";
import { getSupabaseClient } from "../../../src/lib/composition-root";
import { authorizedFetch, type ApiErrorBody } from "../../../src/lib/authorized-fetch";
import { Card } from "../../../src/components/ui/card";
import { TextField } from "../../../src/components/ui/text-field";
import { Button } from "../../../src/components/ui/button";

interface DeviceRow {
  deviceId: string;
  userId: string;
  fullName: string;
  employeeCode: string;
  role: string;
  deviceName: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  status: "active" | "expired" | "revoked";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

async function authorizedGet(path: string): Promise<Response | null> {
  const { data: sessionData } = await getSupabaseClient().auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return null;
  return fetch(path, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } });
}

/**
 * "Security / Trusted Devices" — Super Admin only. Two independent
 * sections: where the device-verification OTP gets emailed (a direct RLS
 * read/write to security_settings, same pattern the rest of this app uses
 * for anything a super_admin alone may see/change), and the trusted-device
 * roster (via /api/auth/device/devices/*, since trusted_devices has no RLS
 * policies at all — service-role-only, matching admin_audit_log's posture).
 */
export default function SecurityPage() {
  const actingRole = useAuthStore((state) => state.role);

  const [adminEmail, setAdminEmail] = useState("");
  const [isLoadingEmail, setIsLoadingEmail] = useState(true);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);

  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);
  const [isConfirmingRevokeAll, setIsConfirmingRevokeAll] = useState(false);
  const [isRevokingAll, setIsRevokingAll] = useState(false);

  const isSuperAdmin = actingRole === "super_admin";

  const loadEmail = useCallback(async () => {
    setIsLoadingEmail(true);
    const { data, error } = await getSupabaseClient()
      .from("security_settings")
      .select("value")
      .eq("key", "device_verification_admin_email")
      .maybeSingle();
    setIsLoadingEmail(false);
    if (error) {
      setEmailError("Could not load the current setting.");
      return;
    }
    setAdminEmail(data?.value ?? "");
  }, []);

  const loadDevices = useCallback(async () => {
    setIsLoadingDevices(true);
    const response = await authorizedGet("/api/auth/device/devices");
    setIsLoadingDevices(false);
    if (!response || !response.ok) {
      setDevicesError("Could not load trusted devices.");
      return;
    }
    const body = (await response.json()) as { devices: DeviceRow[] };
    setDevices(body.devices);
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void loadEmail();
    void loadDevices();
  }, [isSuperAdmin, loadEmail, loadDevices]);

  async function handleSaveEmail() {
    setEmailError(null);
    setEmailSuccess(null);
    const trimmed = adminEmail.trim();
    if (!trimmed.includes("@")) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setIsSavingEmail(true);
    const { error } = await getSupabaseClient()
      .from("security_settings")
      .update({ value: trimmed })
      .eq("key", "device_verification_admin_email");
    setIsSavingEmail(false);
    if (error) {
      setEmailError("Could not save this setting.");
      return;
    }
    setEmailSuccess("Saved.");
  }

  async function handleRevoke(deviceId: string) {
    setDevicesError(null);
    setPendingDeviceId(deviceId);
    const response = await authorizedFetch("/api/auth/device/devices/revoke", { deviceId });
    setPendingDeviceId(null);
    if (!response || !response.ok) {
      const body = response ? ((await response.json().catch(() => ({}))) as ApiErrorBody) : {};
      setDevicesError(body.error?.message ?? "Could not revoke that device.");
      return;
    }
    await loadDevices();
  }

  async function handleRevokeAll() {
    setDevicesError(null);
    setIsRevokingAll(true);
    const response = await authorizedFetch("/api/auth/device/devices/revoke-all", {});
    setIsRevokingAll(false);
    setIsConfirmingRevokeAll(false);
    if (!response || !response.ok) {
      const body = response ? ((await response.json().catch(() => ({}))) as ApiErrorBody) : {};
      setDevicesError(body.error?.message ?? "Could not revoke all devices.");
      return;
    }
    await loadDevices();
  }

  if (!isSuperAdmin) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <p className="text-ink">Security is only available to Super Admin accounts.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Security</h1>
        <p className="mt-1 text-sm text-muted">Login verification and trusted devices.</p>
      </div>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Verification Email</h2>
        <p className="text-sm text-muted">
          New-device verification codes are emailed to this address. Relay the code to the employee yourself — it is
          never sent to them directly.
        </p>
        {isLoadingEmail ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <TextField
              label="Administrator email"
              type="email"
              value={adminEmail}
              onChange={(event) => setAdminEmail(event.target.value)}
              className="max-w-sm"
            />
            <Button isLoading={isSavingEmail} onClick={() => void handleSaveEmail()}>
              Save
            </Button>
          </div>
        )}
        {emailError ? <p className="text-sm text-red-400">{emailError}</p> : null}
        {emailSuccess ? <p className="text-sm text-emerald-400">{emailSuccess}</p> : null}
      </Card>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Trusted Devices</h2>
          {isConfirmingRevokeAll ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Revoke every trusted device for every employee?</span>
              <Button variant="danger" isLoading={isRevokingAll} onClick={() => void handleRevokeAll()} className="px-3 py-1.5 text-xs">
                Confirm
              </Button>
              <Button
                variant="ghost"
                disabled={isRevokingAll}
                onClick={() => setIsConfirmingRevokeAll(false)}
                className="px-3 py-1.5 text-xs"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setIsConfirmingRevokeAll(true)} className="px-3 py-1.5 text-xs">
              Revoke All
            </Button>
          )}
        </div>

        {devicesError ? <p className="text-sm text-red-400">{devicesError}</p> : null}

        {isLoadingDevices ? (
          <p className="text-muted">Loading…</p>
        ) : devices.length === 0 ? (
          <p className="text-muted">No trusted devices yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-white/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Trusted since</th>
                  <th className="px-4 py-3">Last seen</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.deviceId} className="border-t border-white/5">
                    <td className="px-4 py-3 text-ink">
                      {device.fullName}
                      <span className="ml-1 text-xs text-muted">#{device.employeeCode}</span>
                    </td>
                    <td className="px-4 py-3 capitalize text-muted">{device.role.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(device.createdAt)}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(device.lastSeenAt)}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(device.expiresAt)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          device.status === "active"
                            ? "text-emerald-400"
                            : device.status === "expired"
                              ? "text-muted"
                              : "text-red-400"
                        }
                      >
                        {device.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {device.status === "active" ? (
                        <Button
                          variant="danger"
                          isLoading={pendingDeviceId === device.deviceId}
                          onClick={() => void handleRevoke(device.deviceId)}
                          className="px-3 py-1.5 text-xs"
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
