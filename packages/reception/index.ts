import type { TypedSupabaseClient } from "@9thround/supabase-client";
import { GetDashboardStatsUseCase } from "./application/get-dashboard-stats";
import { RegisterMembershipUseCase } from "./application/register-membership";
import { ListMembershipTypesUseCase } from "./application/list-membership-types";
import { SearchMembersUseCase } from "./application/search-members";
import { ListMembersUseCase } from "./application/list-members";
import { RenewMembershipUseCase } from "./application/renew-membership";
import { SellAdditionalMembershipUseCase } from "./application/sell-additional-membership";
import { GetMemberDetailUseCase } from "./application/get-member-detail";
import { AssignMembershipCoachUseCase } from "./application/assign-membership-coach";
import { UpdateMemberUseCase } from "./application/update-member";
import { DeleteMemberUseCase } from "./application/delete-member";
import { CheckInMemberUseCase } from "./application/check-in-member";
import { ListCheckInsForMemberUseCase } from "./application/list-check-ins-for-member";
import { ListRecentCheckInsUseCase } from "./application/list-recent-check-ins";
import { GetTodayCheckInsUseCase } from "./application/get-today-check-ins";
import { ListCheckInsByDateRangeUseCase } from "./application/list-check-ins-by-date-range";
import { CheckInByQrCodeUseCase } from "./application/check-in-by-qr-code";
import { UploadMemberPhotoUseCase } from "./application/upload-member-photo";
import { RecordExpenseUseCase } from "./application/record-expense";
import { ListExpensesUseCase } from "./application/list-expenses";
import { RecordEquipmentSaleUseCase } from "./application/record-equipment-sale";
import { ListEquipmentSalesUseCase } from "./application/list-equipment-sales";
import { ListReceiptsUseCase } from "./application/list-receipts";
import { ListReceiptsByDateRangeUseCase } from "./application/list-receipts-by-date-range";
import { UpdateReceiptDateUseCase } from "./application/update-receipt-date";
import { ListTrainersUseCase } from "./application/list-trainers";
import { ListTrainerPlayersUseCase } from "./application/list-trainer-players";
import { GetNextMembershipNumberUseCase } from "./application/get-next-membership-number";
import { ListExpiringMembershipsUseCase } from "./application/list-expiring-memberships";
import { GetRevenueReportUseCase } from "./application/get-revenue-report";
import { GetMembershipsReportUseCase } from "./application/get-memberships-report";
import { SupabaseDashboardRepository } from "./infrastructure/supabase-dashboard-repository";
import { SupabaseRegistrationRepository } from "./infrastructure/supabase-registration-repository";
import { SupabaseMembershipTypesRepository } from "./infrastructure/supabase-membership-types-repository";
import { SupabaseMemberSearchRepository } from "./infrastructure/supabase-member-search-repository";
import { SupabaseRenewalRepository } from "./infrastructure/supabase-renewal-repository";
import { SupabaseAdditionalMembershipRepository } from "./infrastructure/supabase-additional-membership-repository";
import { SupabaseMemberDetailRepository } from "./infrastructure/supabase-member-detail-repository";
import { SupabaseMembershipCoachRepository } from "./infrastructure/supabase-membership-coach-repository";
import { SupabaseUpdateMemberRepository } from "./infrastructure/supabase-update-member-repository";
import { SupabaseDeleteMemberRepository } from "./infrastructure/supabase-delete-member-repository";
import { SupabaseCheckInRepository } from "./infrastructure/supabase-check-in-repository";
import { SupabaseMemberPhotoRepository } from "./infrastructure/supabase-member-photo-repository";
import { SupabaseExpenseRepository } from "./infrastructure/supabase-expense-repository";
import { SupabaseEquipmentSaleRepository } from "./infrastructure/supabase-equipment-sale-repository";
import { SupabaseReceiptRepository } from "./infrastructure/supabase-receipt-repository";
import { SupabaseMembershipNumberRepository } from "./infrastructure/supabase-membership-number-repository";
import { SupabaseExpiringMembershipRepository } from "./infrastructure/supabase-expiring-membership-repository";
import { SupabaseTrainerRepository } from "./infrastructure/supabase-trainer-repository";
import { SupabaseRevenueReportRepository } from "./infrastructure/supabase-revenue-report-repository";
import { SupabaseMembershipsReportRepository } from "./infrastructure/supabase-memberships-report-repository";

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
export type {
  SellAdditionalMembershipInput,
  SellAdditionalMembershipOutput,
} from "./domain/additional-membership";
export type { MemberDetail, MembershipHistoryEntry } from "./domain/member-detail";
export type { UpdateMemberInput } from "./domain/update-member";
export type { CheckInHistoryEntry, CheckInMemberOutput, RecentCheckInEntry, TodayCheckInEntry } from "./domain/check-in";
export type { UploadMemberPhotoInput, UploadMemberPhotoOutput } from "./domain/member-photo";
export type { Expense, ExpenseCategory, RecordExpenseInput } from "./domain/expense";
export type { EquipmentSale, RecordEquipmentSaleInput } from "./domain/equipment-sale";
export type { Receipt } from "./domain/receipt";
export type { ExpiringMembership } from "./domain/expiring-membership";
export type { RevenueReport, RevenueReportInput, RevenueReportRow, RevenueBreakdownEntry, RevenueTrendPoint } from "./domain/revenue-report";
export type { MembershipsReport, MembershipsReportInput, MembershipsReportRow, MembershipsBreakdownEntry } from "./domain/memberships-report";
export {
  GetDashboardStatsUseCase,
  type GetDashboardStatsOutput,
} from "./application/get-dashboard-stats";
export { RegisterMembershipUseCase } from "./application/register-membership";
export { ListMembershipTypesUseCase } from "./application/list-membership-types";
export { SearchMembersUseCase, type SearchMembersInput } from "./application/search-members";
export { ListMembersUseCase } from "./application/list-members";
export { RenewMembershipUseCase } from "./application/renew-membership";
export { SellAdditionalMembershipUseCase } from "./application/sell-additional-membership";
export { GetMemberDetailUseCase } from "./application/get-member-detail";
export {
  AssignMembershipCoachUseCase,
  type AssignMembershipCoachInput,
} from "./application/assign-membership-coach";
export { UpdateMemberUseCase } from "./application/update-member";
export { DeleteMemberUseCase } from "./application/delete-member";
export { CheckInMemberUseCase } from "./application/check-in-member";
export { ListCheckInsForMemberUseCase } from "./application/list-check-ins-for-member";
export { ListRecentCheckInsUseCase } from "./application/list-recent-check-ins";
export { GetTodayCheckInsUseCase } from "./application/get-today-check-ins";
export {
  ListCheckInsByDateRangeUseCase,
  type ListCheckInsByDateRangeInput,
} from "./application/list-check-ins-by-date-range";
export { CheckInByQrCodeUseCase, type CheckInByQrCodeOutput } from "./application/check-in-by-qr-code";
export { UploadMemberPhotoUseCase } from "./application/upload-member-photo";
export { RecordExpenseUseCase } from "./application/record-expense";
export { ListExpensesUseCase } from "./application/list-expenses";
export { RecordEquipmentSaleUseCase } from "./application/record-equipment-sale";
export { ListEquipmentSalesUseCase } from "./application/list-equipment-sales";
export { ListReceiptsUseCase } from "./application/list-receipts";
export {
  ListReceiptsByDateRangeUseCase,
  type ListReceiptsByDateRangeInput,
} from "./application/list-receipts-by-date-range";
export { UpdateReceiptDateUseCase, type UpdateReceiptDateInput } from "./application/update-receipt-date";
export { ListTrainersUseCase } from "./application/list-trainers";
export { ListTrainerPlayersUseCase, type ListTrainerPlayersInput } from "./application/list-trainer-players";
export type { TrainerSummary, TrainerPlayer } from "./domain/trainer";
export { GetNextMembershipNumberUseCase } from "./application/get-next-membership-number";
export { ListExpiringMembershipsUseCase } from "./application/list-expiring-memberships";
export { GetRevenueReportUseCase } from "./application/get-revenue-report";
export { GetMembershipsReportUseCase } from "./application/get-memberships-report";
export { SupabaseDashboardRepository } from "./infrastructure/supabase-dashboard-repository";
export { SupabaseRegistrationRepository } from "./infrastructure/supabase-registration-repository";
export { SupabaseMembershipTypesRepository } from "./infrastructure/supabase-membership-types-repository";
export { SupabaseMemberSearchRepository } from "./infrastructure/supabase-member-search-repository";
export { SupabaseRenewalRepository } from "./infrastructure/supabase-renewal-repository";
export { SupabaseAdditionalMembershipRepository } from "./infrastructure/supabase-additional-membership-repository";
export { SupabaseMemberDetailRepository } from "./infrastructure/supabase-member-detail-repository";
export { SupabaseMembershipCoachRepository } from "./infrastructure/supabase-membership-coach-repository";
export { SupabaseUpdateMemberRepository } from "./infrastructure/supabase-update-member-repository";
export { SupabaseDeleteMemberRepository } from "./infrastructure/supabase-delete-member-repository";
export { SupabaseCheckInRepository } from "./infrastructure/supabase-check-in-repository";
export { SupabaseMemberPhotoRepository } from "./infrastructure/supabase-member-photo-repository";
export { SupabaseExpenseRepository } from "./infrastructure/supabase-expense-repository";
export { SupabaseEquipmentSaleRepository } from "./infrastructure/supabase-equipment-sale-repository";
export { SupabaseReceiptRepository } from "./infrastructure/supabase-receipt-repository";
export { SupabaseMembershipNumberRepository } from "./infrastructure/supabase-membership-number-repository";
export { SupabaseExpiringMembershipRepository } from "./infrastructure/supabase-expiring-membership-repository";
export { SupabaseTrainerRepository } from "./infrastructure/supabase-trainer-repository";
export { SupabaseRevenueReportRepository } from "./infrastructure/supabase-revenue-report-repository";
export { SupabaseMembershipsReportRepository } from "./infrastructure/supabase-memberships-report-repository";

/**
 * The Reception context's composition root — mirrors
 * packages/identity/index.ts's createIdentityModule(). Covers the
 * Dashboard, Membership Registration (with photo + QR identity), Renewal,
 * member detail/edit, Attendance Check-in, Expenses, Other Sales, and
 * Receipts.
 */
export function createReceptionModule(client: TypedSupabaseClient) {
  const dashboardRepository = new SupabaseDashboardRepository(client);
  const registrationRepository = new SupabaseRegistrationRepository(client);
  const membershipTypesRepository = new SupabaseMembershipTypesRepository(client);
  const memberSearchRepository = new SupabaseMemberSearchRepository(client);
  const renewalRepository = new SupabaseRenewalRepository(client);
  const additionalMembershipRepository = new SupabaseAdditionalMembershipRepository(client);
  const memberDetailRepository = new SupabaseMemberDetailRepository(client);
  const membershipCoachRepository = new SupabaseMembershipCoachRepository(client);
  const updateMemberRepository = new SupabaseUpdateMemberRepository(client);
  const deleteMemberRepository = new SupabaseDeleteMemberRepository(client);
  const checkInRepository = new SupabaseCheckInRepository(client);
  const memberPhotoRepository = new SupabaseMemberPhotoRepository(client);
  const expenseRepository = new SupabaseExpenseRepository(client);
  const equipmentSaleRepository = new SupabaseEquipmentSaleRepository(client);
  const receiptRepository = new SupabaseReceiptRepository(client);
  const membershipNumberRepository = new SupabaseMembershipNumberRepository(client);
  const expiringMembershipRepository = new SupabaseExpiringMembershipRepository(client);
  const trainerRepository = new SupabaseTrainerRepository(client);
  const revenueReportRepository = new SupabaseRevenueReportRepository(client);
  const membershipsReportRepository = new SupabaseMembershipsReportRepository(client);
  return {
    getDashboardStats: new GetDashboardStatsUseCase(dashboardRepository),
    registerMembership: new RegisterMembershipUseCase(registrationRepository),
    listMembershipTypes: new ListMembershipTypesUseCase(membershipTypesRepository),
    searchMembers: new SearchMembersUseCase(memberSearchRepository),
    listMembers: new ListMembersUseCase(memberSearchRepository),
    renewMembership: new RenewMembershipUseCase(renewalRepository),
    sellAdditionalMembership: new SellAdditionalMembershipUseCase(additionalMembershipRepository),
    getMemberDetail: new GetMemberDetailUseCase(memberDetailRepository),
    assignMembershipCoach: new AssignMembershipCoachUseCase(membershipCoachRepository),
    updateMember: new UpdateMemberUseCase(updateMemberRepository),
    deleteMember: new DeleteMemberUseCase(deleteMemberRepository),
    checkInMember: new CheckInMemberUseCase(checkInRepository),
    listCheckInsForMember: new ListCheckInsForMemberUseCase(checkInRepository),
    listRecentCheckIns: new ListRecentCheckInsUseCase(checkInRepository),
    getTodayCheckIns: new GetTodayCheckInsUseCase(checkInRepository),
    listCheckInsByDateRange: new ListCheckInsByDateRangeUseCase(checkInRepository),
    checkInByQrCode: new CheckInByQrCodeUseCase(memberSearchRepository, checkInRepository),
    uploadMemberPhoto: new UploadMemberPhotoUseCase(memberPhotoRepository),
    recordExpense: new RecordExpenseUseCase(expenseRepository),
    listExpenses: new ListExpensesUseCase(expenseRepository),
    recordEquipmentSale: new RecordEquipmentSaleUseCase(equipmentSaleRepository),
    listEquipmentSales: new ListEquipmentSalesUseCase(equipmentSaleRepository),
    listReceipts: new ListReceiptsUseCase(receiptRepository),
    listReceiptsByDateRange: new ListReceiptsByDateRangeUseCase(receiptRepository),
    updateReceiptDate: new UpdateReceiptDateUseCase(receiptRepository),
    getNextMembershipNumber: new GetNextMembershipNumberUseCase(membershipNumberRepository),
    listExpiringMemberships: new ListExpiringMembershipsUseCase(expiringMembershipRepository),
    listTrainers: new ListTrainersUseCase(trainerRepository),
    listTrainerPlayers: new ListTrainerPlayersUseCase(trainerRepository),
    getRevenueReport: new GetRevenueReportUseCase(revenueReportRepository),
    getMembershipsReport: new GetMembershipsReportUseCase(membershipsReportRepository),
  };
}
