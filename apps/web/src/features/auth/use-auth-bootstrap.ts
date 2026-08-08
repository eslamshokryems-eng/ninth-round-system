import { useEffect } from "react";
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
    const client = getSupabaseClient();

    async function syncFromSession(userId: string | undefined) {
      if (!userId) {
        if (isMounted) setSignedOut();
        return;
      }

      const result = await getIdentityModule().getCurrentProfile.execute({ profileId: userId });
      if (!isMounted) return;

      if (result.isErr) {
        setSignedOut();
        return;
      }

      setSignedIn({
        profileId: result.value.profileId,
        fullName: result.value.fullName,
        role: result.value.role,
        branchId: result.value.branchId,
      });
    }

    void client.auth.getSession().then(({ data }) => syncFromSession(data.session?.user.id));

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      void syncFromSession(session?.user.id);
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [setSignedIn, setSignedOut]);
}
