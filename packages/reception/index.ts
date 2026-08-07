import type { TypedSupabaseClient } from "@9thround/supabase-client";
import { GetDashboardStatsUseCase } from "./application/get-dashboard-stats";
import { RegisterMembershipUseCase } from "./application/register-membership";
import { ListMembershipTypesUseCase } from "./application/list-membership-types";
import { SearchMembersUseCase } from "./application/search-members";
import { RenewMembershipUseCase } from "./application/renew-membership";
import { GetMemberDetailUseCase } from "./application/get-member-detail";
import { UpdateMemberUseCase } from "./application/update-member";
import { CheckInMemberUseCase } from "./application/check-in-member";
import { UploadMemberPhotoUseCase } from "./application/upload-member-photo";
import { SupabaseDashboardRepository } from "./infrastructure/supabase-dashboard-repository";
import { SupabaseRegistrationRepository } from "./infrastructure/supabase-registration-repository";
import { SupabaseMembershipTypesRepository } from "./infrastructure/supabase-membership-types-repository";
import { SupabaseMemberSearchRepository } from "./infrastructure/supabase-member-search-repository";
import { SupabaseRenewalRepository } from "./infrastructure/supabase-renewal-repository";
import { SupabaseMemberDetailRepository } from "./infrastructure/supabase-member-detail-repository";
import { SupabaseUpdateMemberRepository } from "./infrastructure/supabase-update-member-repository";
import { SupabaseCheckInRepository } from "./infrastructure/supabase-check-in-repository";
import { SupabaseMemberPhotoRepository } from "./infrastructure/supabase-member-photo-repository";

export type { DashboardStats } from "./domain/dashboard-stats";
export type { DashboardRepository } from "./domain/dashboard-repository";
export type { MembershipType } from "./domain/membership-type";
export type { MemberSearchResult, MembershipStatus } from "./domain/member-search-result";
export type {
  Gender,
  PaymentMethod,
  RegisterMembershipInput,
  RegisterMembershipOutput,
} from "./domain/registration";
export type { RenewMembershipInput, RenewMembershipOutput } from "./domain/renewal";
export type { MemberDetail, MembershipHistoryEntry } from "./domain/member-detail";
export type { UpdateMemberInput } from "./domain/update-member";
export type { CheckInMemberOutput } from "./domain/check-in";
export type { UploadMemberPhotoInput, UploadMemberPhotoOutput } from "./domain/member-photo";
export {
  GetDashboardStatsUseCase,
  type GetDashboardStatsOutput,
} from "./application/get-dashboard-stats";
export { RegisterMembershipUseCase } from "./application/register-membership";
export { ListMembershipTypesUseCase } from "./application/list-membership-types";
export { SearchMembersUseCase, type SearchMembersInput } from "./application/search-members";
export { RenewMembershipUseCase } from "./application/renew-membership";
export { GetMemberDetailUseCase } from "./application/get-member-detail";
export { UpdateMemberUseCase } from "./application/update-member";
export { CheckInMemberUseCase } from "./application/check-in-member";
export { UploadMemberPhotoUseCase } from "./application/upload-member-photo";
export { SupabaseDashboardRepository } from "./infrastructure/supabase-dashboard-repository";
export { SupabaseRegistrationRepository } from "./infrastructure/supabase-registration-repository";
export { SupabaseMembershipTypesRepository } from "./infrastructure/supabase-membership-types-repository";
export { SupabaseMemberSearchRepository } from "./infrastructure/supabase-member-search-repository";
export { SupabaseRenewalRepository } from "./infrastructure/supabase-renewal-repository";
export { SupabaseMemberDetailRepository } from "./infrastructure/supabase-member-detail-repository";
export { SupabaseUpdateMemberRepository } from "./infrastructure/supabase-update-member-repository";
export { SupabaseCheckInRepository } from "./infrastructure/supabase-check-in-repository";
export { SupabaseMemberPhotoRepository } from "./infrastructure/supabase-member-photo-repository";

/**
 * The Reception context's composition root — mirrors
 * packages/identity/index.ts's createIdentityModule(). Covers the
 * Dashboard, Membership Registration (with photo + QR identity), Renewal,
 * member detail/edit, and Attendance Check-in.
 */
export function createReceptionModule(client: TypedSupabaseClient) {
  const dashboardRepository = new SupabaseDashboardRepository(client);
  const registrationRepository = new SupabaseRegistrationRepository(client);
  const membershipTypesRepository = new SupabaseMembershipTypesRepository(client);
  const memberSearchRepository = new SupabaseMemberSearchRepository(client);
  const renewalRepository = new SupabaseRenewalRepository(client);
  const memberDetailRepository = new SupabaseMemberDetailRepository(client);
  const updateMemberRepository = new SupabaseUpdateMemberRepository(client);
  const checkInRepository = new SupabaseCheckInRepository(client);
  const memberPhotoRepository = new SupabaseMemberPhotoRepository(client);
  return {
    getDashboardStats: new GetDashboardStatsUseCase(dashboardRepository),
    registerMembership: new RegisterMembershipUseCase(registrationRepository),
    listMembershipTypes: new ListMembershipTypesUseCase(membershipTypesRepository),
    searchMembers: new SearchMembersUseCase(memberSearchRepository),
    renewMembership: new RenewMembershipUseCase(renewalRepository),
    getMemberDetail: new GetMemberDetailUseCase(memberDetailRepository),
    updateMember: new UpdateMemberUseCase(updateMemberRepository),
    checkInMember: new CheckInMemberUseCase(checkInRepository),
    uploadMemberPhoto: new UploadMemberPhotoUseCase(memberPhotoRepository),
  };
}
