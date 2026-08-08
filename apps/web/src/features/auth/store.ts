import { create } from "zustand";
import type { UserRoleName } from "@9thround/identity";

export type AuthStatus = "hydrating" | "signedOut" | "signedIn";

interface AuthState {
  status: AuthStatus;
  profileId: string | null;
  fullName: string | null;
  role: UserRoleName | null;
  branchId: string | null;
  setSignedIn: (params: {
    profileId: string;
    fullName: string | null;
    role: UserRoleName;
    branchId: string | null;
  }) => void;
  setSignedOut: () => void;
}

/**
 * Mirrors apps/mobile/src/features/auth/store.ts — only what the app
 * needs to make routing/authorization decisions. `isOnboarded`/locale
 * aren't tracked here: this app is staff-only (Reception always has a
 * role and branch from account creation, no consumer-style onboarding
 * flow) and English-only for this first pass.
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: "hydrating",
  profileId: null,
  fullName: null,
  role: null,
  branchId: null,
  setSignedIn: ({ profileId, fullName, role, branchId }) =>
    set({ status: "signedIn", profileId, fullName, role, branchId }),
  setSignedOut: () =>
    set({ status: "signedOut", profileId: null, fullName: null, role: null, branchId: null }),
}));
