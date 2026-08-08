"use client";

import { useAuthStore } from "../../../src/features/auth/store";
import { Card } from "../../../src/components/ui/card";

/** Profile (Phase 5) — the signed-in staff member's own account info, real data from the auth session/profile. */
export default function ProfilePage() {
  const fullName = useAuthStore((state) => state.fullName);
  const role = useAuthStore((state) => state.role);
  const profileId = useAuthStore((state) => state.profileId);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Profile</h1>
      <Card className="space-y-3">
        <div>
          <p className="text-xs text-muted">Name</p>
          <p className="text-ink">{fullName ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Role</p>
          <p className="capitalize text-ink">{role?.replace("_", " ") ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Account ID</p>
          <p className="break-all text-xs text-muted">{profileId ?? "—"}</p>
        </div>
      </Card>
    </div>
  );
}
