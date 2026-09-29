"use client";

import { useEffect, type ReactNode } from "react";
import { getRaceClient } from "../../lib/composition-root";
import { useAuthStore } from "./store";

/** Keeps the store in step with THE NINTH's Supabase Auth session. Anonymous visitors (athletes) simply stay signed out. */
export function RaceAuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const auth = getRaceClient().auth;
    const { setSignedIn, setSignedOut } = useAuthStore.getState();
    void auth.getSession().then(({ data }) => {
      if (data.session) setSignedIn(data.session.user.id, data.session.user.email ?? null);
      else setSignedOut();
    });
    const { data: sub } = auth.onAuthStateChange((_event, session) => {
      if (session) setSignedIn(session.user.id, session.user.email ?? null);
      else setSignedOut();
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return <>{children}</>;
}
