import { create } from "zustand";

export type AuthStatus = "hydrating" | "signedOut" | "signedIn";

interface AuthState {
  status: AuthStatus;
  profileId: string | null;
  fullName: string | null;
  isOnboarded: boolean;
  setSignedIn: (params: { profileId: string; fullName: string | null; isOnboarded: boolean }) => void;
  setSignedOut: () => void;
}

/**
 * Mirrors only what the app needs to make *routing* decisions (see
 * docs/phase-1/06-navigation-flow.md §6.1) — the actual session/JWT lives in
 * Supabase Auth's own SecureStore-backed storage
 * (src/lib/secure-store-adapter.ts) and is never duplicated here. This is
 * the "useAuthStore" from docs/phase-1/08-state-management.md §8.2.
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: "hydrating",
  profileId: null,
  fullName: null,
  isOnboarded: false,
  setSignedIn: ({ profileId, fullName, isOnboarded }) =>
    set({ status: "signedIn", profileId, fullName, isOnboarded }),
  setSignedOut: () => set({ status: "signedOut", profileId: null, fullName: null, isOnboarded: false }),
}));
