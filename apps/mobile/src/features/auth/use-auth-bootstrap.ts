import { useEffect } from "react";
import { getIdentityModule, getSupabaseClient } from "../../lib/composition-root";
import { useLocaleStore } from "../../lib/locale-store";
import { useAuthStore } from "./store";

/**
 * Mounted once, at the app root (see app/_layout.tsx). Determines the
 * initial signed-in/signed-out state and keeps it in sync as Supabase Auth's
 * session changes (sign-in, sign-out, token refresh) — this is what the
 * root layout's route guard reads to decide between (auth) and (tabs), per
 * docs/phase-1/06-navigation-flow.md §6.1 and
 * docs/phase-1/09-authentication-flow.md §9.4.
 */
export function useAuthBootstrap(): void {
  const setSignedIn = useAuthStore((state) => state.setSignedIn);
  const setSignedOut = useAuthStore((state) => state.setSignedOut);
  const setLocale = useLocaleStore((state) => state.setLocale);

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
        // A signed-in auth user with no profile row yet is a transient state
        // right after sign-up (the handle_new_user trigger runs inside the
        // same transaction, so in practice this should not happen — but if
        // it ever does, fail safe to signed-out rather than crash routing).
        setSignedOut();
        return;
      }

      setSignedIn({
        profileId: result.value.profileId,
        fullName: result.value.fullName,
        role: result.value.role,
        branchId: result.value.branchId,
        isOnboarded: result.value.isOnboarded,
      });
      setLocale(result.value.preferredLocale);
    }

    void client.auth.getSession().then(({ data }) => syncFromSession(data.session?.user.id));

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      void syncFromSession(session?.user.id);
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [setSignedIn, setSignedOut, setLocale]);
}
