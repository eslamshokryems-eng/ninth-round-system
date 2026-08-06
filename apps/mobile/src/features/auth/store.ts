import { create } from "zustand";
import type { UserRoleName } from "@9thround/identity";

export type AuthStatus = "hydrating" | "signedOut" | "signedIn";

interface AuthState {
  status: AuthStatus;
  profileId: string | null;
  fullName: string | null;
  role: UserRoleName | null;
  branchId: string | null;
  isOnboarded: boolean;
  setSignedIn: (params: {
    profileId: string;
    fullName: string | null;
    role: UserRoleName;
    branchId: string | null;
    isOnboarded: boolean;
  }) => void;
  setSignedOut: () => void;
}

/**
 * Mirrors only what the app needs to make *routing* decisions (see
 * docs/phase-1/06-navigation-flow.md §6.1) — the actual session/JWT lives in
 * Supabase Auth's own SecureStore-backed storage
 * (src/lib/secure-store-adapter.ts) and is never duplicated here. This is
 * the "useAuthStore" from docs/phase-1/08-state-management.md §8.2. `role`
 * and `branchId` were added for the Reception & Membership pivot
 * (docs/phase-1/14-reception-membership.md): staff roles
 * (reception/branch_manager/super_admin) route to `/(reception)` instead of
 * the member-facing `/(tabs)`, and `branchId` scopes their reads/writes
 * there (a `member` has none).
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: "hydrating",
  profileId: null,
  fullName: null,
  role: null,
  branchId: null,
  isOnboarded: false,
  setSignedIn: ({ profileId, fullName, role, branchId, isOnboarded }) =>
    set({ status: "signedIn", profileId, fullName, role, branchId, isOnboarded }),
  setSignedOut: () =>
    set({
      status: "signedOut",
      profileId: null,
      fullName: null,
      role: null,
      branchId: null,
      isOnboarded: false,
    }),
}));
