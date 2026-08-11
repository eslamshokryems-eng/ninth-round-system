import { useEffect } from "react";
import { getIdentityModule } from "../../lib/composition-root";
import { useAuthStore } from "./store";

const HEARTBEAT_INTERVAL_MS = 45_000;

/**
 * Bumps `profiles.last_seen_at` on an interval while a staff session is
 * open — what Manage Staff's roster (packages/identity's
 * ListStaffPresenceUseCase) reads to show who's currently online. Mounted
 * once at the app root, alongside AuthBootstrapProvider.
 */
export function useHeartbeat(): void {
  const status = useAuthStore((state) => state.status);
  const profileId = useAuthStore((state) => state.profileId);

  useEffect(() => {
    if (status !== "signedIn" || !profileId) return;

    void getIdentityModule().recordHeartbeat.execute({ profileId });
    const interval = setInterval(() => {
      void getIdentityModule().recordHeartbeat.execute({ profileId });
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [status, profileId]);
}
