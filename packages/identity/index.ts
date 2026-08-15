import type { TypedSupabaseClient } from "@9thround/supabase-client";
import { CompleteOnboardingUseCase } from "./application/complete-onboarding";
import { AssignStaffRoleUseCase } from "./application/assign-staff-role";
import { GetCurrentProfileUseCase } from "./application/get-current-profile";
import { SignUpUseCase } from "./application/sign-up";
import { SignInUseCase } from "./application/sign-in";
import { RequestPasswordResetUseCase } from "./application/request-password-reset";
import { SearchStaffCandidatesUseCase } from "./application/search-staff-candidates";
import { ListStaffPresenceUseCase } from "./application/list-staff-presence";
import { RecordHeartbeatUseCase } from "./application/record-heartbeat";
import { ResolveEmployeeCodeUseCase } from "./application/resolve-employee-code";
import { ListPermissionCatalogUseCase } from "./application/list-permission-catalog";
import { ListRolePermissionsUseCase } from "./application/list-role-permissions";
import { ListUserPermissionOverridesUseCase } from "./application/list-user-permission-overrides";
import { SetRolePermissionUseCase } from "./application/set-role-permission";
import { SetUserPermissionOverrideUseCase } from "./application/set-user-permission-override";
import { ClearUserPermissionOverrideUseCase } from "./application/clear-user-permission-override";
import { CheckPermissionUseCase } from "./application/check-permission";
import { SupabaseProfileRepository } from "./infrastructure/supabase-profile-repository";
import { SupabaseAuthPort } from "./infrastructure/supabase-auth-port";
import { SupabaseStaffPresenceRepository } from "./infrastructure/supabase-staff-presence-repository";
import { SupabasePermissionRepository } from "./infrastructure/supabase-permission-repository";

export { Profile, type ProfileProps, type FitnessGoal, type ExperienceLevel } from "./domain/profile";
export { Role, USER_ROLES, type UserRoleName } from "./domain/role";
export { BodyMetrics, ageFromDateOfBirth, dateOfBirthFromAge, type Gender } from "./domain/body-metrics";
export { Email } from "./domain/email";
export { Password } from "./domain/password";
export type { ProfileRepository } from "./domain/profile-repository";
export type { AuthPort, AuthSession } from "./domain/auth-port";
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
export {
  GetCurrentProfileUseCase,
  type GetCurrentProfileInput,
  type GetCurrentProfileOutput,
} from "./application/get-current-profile";
export { SignUpUseCase, type SignUpInput } from "./application/sign-up";
export { SignInUseCase, type SignInInput } from "./application/sign-in";
export {
  RequestPasswordResetUseCase,
  type RequestPasswordResetInput,
} from "./application/request-password-reset";
export {
  SearchStaffCandidatesUseCase,
  type SearchStaffCandidatesInput,
  type StaffCandidate,
} from "./application/search-staff-candidates";
export { ListStaffPresenceUseCase } from "./application/list-staff-presence";
export { RecordHeartbeatUseCase, type RecordHeartbeatInput } from "./application/record-heartbeat";
export { ResolveEmployeeCodeUseCase } from "./application/resolve-employee-code";
export type { StaffPresence } from "./domain/staff-presence";
export type { StaffPresenceRepository } from "./domain/staff-presence-repository";
export type { Permission, RolePermission, UserPermissionOverride } from "./domain/permission";
export type { PermissionRepository } from "./domain/permission-repository";
export { ListPermissionCatalogUseCase } from "./application/list-permission-catalog";
export { ListRolePermissionsUseCase } from "./application/list-role-permissions";
export {
  ListUserPermissionOverridesUseCase,
  type ListUserPermissionOverridesInput,
} from "./application/list-user-permission-overrides";
export { SetRolePermissionUseCase, type SetRolePermissionInput } from "./application/set-role-permission";
export {
  SetUserPermissionOverrideUseCase,
  type SetUserPermissionOverrideInput,
} from "./application/set-user-permission-override";
export {
  ClearUserPermissionOverrideUseCase,
  type ClearUserPermissionOverrideInput,
} from "./application/clear-user-permission-override";
export { CheckPermissionUseCase } from "./application/check-permission";
export { SupabaseProfileRepository } from "./infrastructure/supabase-profile-repository";
export { SupabaseAuthPort } from "./infrastructure/supabase-auth-port";
export { SupabaseStaffPresenceRepository } from "./infrastructure/supabase-staff-presence-repository";
export { SupabasePermissionRepository } from "./infrastructure/supabase-permission-repository";

/**
 * The Identity context's composition root: wires the Supabase-backed
 * repository/auth-port to its use cases so an app only ever imports this
 * factory, not the individual infrastructure/application pieces. Each app
 * calls this once at startup with its own Supabase client instance — see
 * apps/mobile/src/lib/composition-root.ts. This is what makes the context
 * "independently scalable" in practice (requirement 9): everything it needs
 * to run is assembled from one entry point and could be lifted into its own
 * deployable service without any other context's code changing.
 */
export function createIdentityModule(client: TypedSupabaseClient) {
  const profileRepository = new SupabaseProfileRepository(client);
  const authPort = new SupabaseAuthPort(client);
  const staffPresenceRepository = new SupabaseStaffPresenceRepository(client);
  const permissionRepository = new SupabasePermissionRepository(client);
  return {
    completeOnboarding: new CompleteOnboardingUseCase(profileRepository),
    assignStaffRole: new AssignStaffRoleUseCase(profileRepository),
    getCurrentProfile: new GetCurrentProfileUseCase(profileRepository),
    searchStaffCandidates: new SearchStaffCandidatesUseCase(profileRepository),
    listStaffPresence: new ListStaffPresenceUseCase(staffPresenceRepository),
    recordHeartbeat: new RecordHeartbeatUseCase(staffPresenceRepository),
    resolveEmployeeCode: new ResolveEmployeeCodeUseCase(authPort),
    signUp: new SignUpUseCase(authPort),
    signIn: new SignInUseCase(authPort),
    requestPasswordReset: new RequestPasswordResetUseCase(authPort),
    signOut: () => authPort.signOut(),
    listPermissionCatalog: new ListPermissionCatalogUseCase(permissionRepository),
    listRolePermissions: new ListRolePermissionsUseCase(permissionRepository),
    listUserPermissionOverrides: new ListUserPermissionOverridesUseCase(permissionRepository),
    setRolePermission: new SetRolePermissionUseCase(permissionRepository),
    setUserPermissionOverride: new SetUserPermissionOverrideUseCase(permissionRepository),
    clearUserPermissionOverride: new ClearUserPermissionOverrideUseCase(permissionRepository),
    checkPermission: new CheckPermissionUseCase(permissionRepository),
  };
}
