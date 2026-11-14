import { useEffect } from "react";
import { resolveSessionProfile } from "@9thround/identity";
import { getIdentityModule, getSupabaseClient } from "../../lib/composition-root";
import { useAuthStore } from "./store";

/**
 * Mounted once, at the app root (see app/(reception)/layout.tsx and
 * app/(auth)/login/page.tsx). Determines the initial signed-in/signed-out
 * state and keeps it in sync as Supabase Auth's session changes — mirrors
 * apps/mobile/src/features/auth/use-auth-bootstrap.ts.
 */
export function useAuthBootstrap(): void {
  const setSignedIn = useAuthStore((state) => state.setSignedIn);
  const setSignedOut = useAuthStore((state) => state.setSignedOut);

  useEffect(() => {
    let isMounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const client = getSupabaseClient();

    async function syncFromSession(userId: string | undefined) {
      if (!userId) {
        if (isMounted) setSignedOut();
        return;
      }

      // A failure to LOAD the profile (slow mobile data, a 5xx, a database timeout) is not a reason to sign the employee out:
      // the session itself is valid. Retry; only a profile that definitively does not exist ends the session.
      const outcome = await resolveSessionProfile(
        () => getIdentityModule().getCurrentProfile.execute({ profileId: userId }),
        { isCancelled: () => !isMounted },
      );
      if (!isMounted) return;

      if (outcome.kind === "signed-out") {
        setSignedOut();
        return;
      }
      if (outcome.kind === "unavailable") {
        // Keep whatever state we have (signed in stays signed in) and try again shortly; the page is never replaced by the login screen.
        retryTimer = setTimeout(() => void syncFromSession(userId), 10_000);
        return;
      }

      setSignedIn({
        profileId: outcome.profile.profileId,
        fullName: outcome.profile.fullName,
        role: outcome.profile.role,
        branchId: outcome.profile.branchId,
      });
    }

    void client.auth.getSession().then(({ data }) => syncFromSession(data.session?.user.id));

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      void syncFromSession(session?.user.id);
    });

    return () => {
      isMounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      subscription.subscription.unsubscribe();
    };
  }, [setSignedIn, setSignedOut]);
}
