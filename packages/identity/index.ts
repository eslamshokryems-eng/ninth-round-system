import type { TypedSupabaseClient } from "@9thround/supabase-client";
import { CompleteOnboardingUseCase } from "./application/complete-onboarding";
import { AssignStaffRoleUseCase } from "./application/assign-staff-role";
import { SupabaseProfileRepository } from "./infrastructure/supabase-profile-repository";

export { Profile, type ProfileProps, type FitnessGoal, type ExperienceLevel } from "./domain/profile";
export { Role, USER_ROLES, type UserRoleName } from "./domain/role";
export type { ProfileRepository } from "./domain/profile-repository";
export {
  CompleteOnboardingUseCase,
  type CompleteOnboardingInput,
  type CompleteOnboardingOutput,
} from "./application/complete-onboarding";
export {
  AssignStaffRoleUseCase,
  type AssignStaffRoleInput,
  type AssignStaffRoleOutput,
} from "./application/assign-staff-role";
export { SupabaseProfileRepository } from "./infrastructure/supabase-profile-repository";

/**
 * The Identity context's composition root: wires the Supabase-backed
 * repository to its use cases so an app only ever imports this factory, not
 * the individual infrastructure/application pieces. Each app calls this
 * once at startup with its own Supabase client instance — see
 * apps/mobile/src/lib/composition-root.ts. This is what makes the context
 * "independently scalable" in practice (requirement 9): everything it needs
 * to run is assembled from one entry point and could be lifted into its own
 * deployable service without any other context's code changing.
 */
export function createIdentityModule(client: TypedSupabaseClient) {
  const profileRepository = new SupabaseProfileRepository(client);
  return {
    completeOnboarding: new CompleteOnboardingUseCase(profileRepository),
    assignStaffRole: new AssignStaffRoleUseCase(profileRepository),
  };
}
