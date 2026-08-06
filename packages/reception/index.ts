import type { TypedSupabaseClient } from "@9thround/supabase-client";
import { GetDashboardStatsUseCase } from "./application/get-dashboard-stats";
import { RegisterMembershipUseCase } from "./application/register-membership";
import { ListMembershipTypesUseCase } from "./application/list-membership-types";
import { SearchMembersUseCase } from "./application/search-members";
import { RenewMembershipUseCase } from "./application/renew-membership";
import { SupabaseDashboardRepository } from "./infrastructure/supabase-dashboard-repository";
import { SupabaseRegistrationRepository } from "./infrastructure/supabase-registration-repository";
import { SupabaseMembershipTypesRepository } from "./infrastructure/supabase-membership-types-repository";
import { SupabaseMemberSearchRepository } from "./infrastructure/supabase-member-search-repository";
import { SupabaseRenewalRepository } from "./infrastructure/supabase-renewal-repository";

export type { DashboardStats } from "./domain/dashboard-stats";
export type { DashboardRepository } from "./domain/dashboard-repository";
export type { MembershipType } from "./domain/membership-type";
export type { MemberSearchResult } from "./domain/member-search-result";
export type {
  Gender,
  PaymentMethod,
  RegisterMembershipInput,
  RegisterMembershipOutput,
} from "./domain/registration";
export type { RenewMembershipInput, RenewMembershipOutput } from "./domain/renewal";
export {
  GetDashboardStatsUseCase,
  type GetDashboardStatsOutput,
} from "./application/get-dashboard-stats";
export { RegisterMembershipUseCase } from "./application/register-membership";
export { ListMembershipTypesUseCase } from "./application/list-membership-types";
export { SearchMembersUseCase, type SearchMembersInput } from "./application/search-members";
export { RenewMembershipUseCase } from "./application/renew-membership";
export { SupabaseDashboardRepository } from "./infrastructure/supabase-dashboard-repository";
export { SupabaseRegistrationRepository } from "./infrastructure/supabase-registration-repository";
export { SupabaseMembershipTypesRepository } from "./infrastructure/supabase-membership-types-repository";
export { SupabaseMemberSearchRepository } from "./infrastructure/supabase-member-search-repository";
export { SupabaseRenewalRepository } from "./infrastructure/supabase-renewal-repository";

/**
 * The Reception context's composition root — mirrors
 * packages/identity/index.ts's createIdentityModule(). Covers the
 * Dashboard, Membership Registration, and Renewal; member-detail/edit use
 * cases join here as they're built (docs/phase-1/14-reception-membership.md §14.4).
 */
export function createReceptionModule(client: TypedSupabaseClient) {
  const dashboardRepository = new SupabaseDashboardRepository(client);
  const registrationRepository = new SupabaseRegistrationRepository(client);
  const membershipTypesRepository = new SupabaseMembershipTypesRepository(client);
  const memberSearchRepository = new SupabaseMemberSearchRepository(client);
  const renewalRepository = new SupabaseRenewalRepository(client);
  return {
    getDashboardStats: new GetDashboardStatsUseCase(dashboardRepository),
    registerMembership: new RegisterMembershipUseCase(registrationRepository),
    listMembershipTypes: new ListMembershipTypesUseCase(membershipTypesRepository),
    searchMembers: new SearchMembersUseCase(memberSearchRepository),
    renewMembership: new RenewMembershipUseCase(renewalRepository),
  };
}
