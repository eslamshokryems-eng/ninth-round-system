import { create } from "zustand";

export type AuthStatus = "hydrating" | "signedOut" | "signedIn";

interface AuthState {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  setSignedIn: (userId: string, email: string | null) => void;
  setSignedOut: () => void;
}

/** THE NINTH's own session state — a race staff account, entirely separate from any gym login. Authority comes from the database (race_staff rows), never from here. */
export const useAuthStore = create<AuthState>((set) => ({
  status: "hydrating",
  userId: null,
  email: null,
  setSignedIn: (userId, email) => set({ status: "signedIn", userId, email }),
  setSignedOut: () => set({ status: "signedOut", userId: null, email: null }),
}));
