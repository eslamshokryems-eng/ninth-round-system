import { create } from "zustand";
import type { ExperienceLevel, FitnessGoal, Gender } from "@9thround/identity";

interface OnboardingDraft {
  fullName: string;
  goal: FitnessGoal | null;
  experienceLevel: ExperienceLevel | null;
  gender: Gender | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
}

interface OnboardingState extends OnboardingDraft {
  setFullName: (fullName: string) => void;
  setGoal: (goal: FitnessGoal) => void;
  setExperienceLevel: (level: ExperienceLevel) => void;
  setBodyMetrics: (metrics: { gender: Gender; age: number; heightCm: number; weightKg: number }) => void;
  reset: () => void;
}

const initialDraft: OnboardingDraft = {
  fullName: "",
  goal: null,
  experienceLevel: null,
  gender: null,
  age: null,
  heightCm: null,
  weightKg: null,
};

/**
 * Holds onboarding answers across the Profile Setup → Goal → Experience →
 * Body Metrics screens (docs/phase-1/06-navigation-flow.md §6.3) without
 * writing to the database until the final step, where all of it is sent to
 * `CompleteOnboardingUseCase` in one call — see
 * docs/phase-1/08-state-management.md §8.2. Never persisted (no
 * SecureStore/AsyncStorage) — restarting mid-onboarding restarts the flow,
 * which is the correct behavior for a draft, not a bug.
 */
export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...initialDraft,
  setFullName: (fullName) => set({ fullName }),
  setGoal: (goal) => set({ goal }),
  setExperienceLevel: (experienceLevel) => set({ experienceLevel }),
  setBodyMetrics: (metrics) => set(metrics),
  reset: () => set(initialDraft),
}));
