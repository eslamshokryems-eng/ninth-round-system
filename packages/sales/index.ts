import type { TypedSupabaseClient } from "@9thround/supabase-client";
import { ListLeadsUseCase } from "./application/list-leads";
import { SearchLeadsUseCase } from "./application/search-leads";
import { GetLeadDetailUseCase } from "./application/get-lead-detail";
import { CreateLeadUseCase } from "./application/create-lead";
import { UpdateLeadUseCase } from "./application/update-lead";
import { AssignLeadUseCase } from "./application/assign-lead";
import { MarkLeadLostUseCase } from "./application/mark-lead-lost";
import { RestoreLeadUseCase } from "./application/restore-lead";
import { ConvertLeadUseCase } from "./application/convert-lead";
import { CheckDuplicateLeadsUseCase } from "./application/check-duplicate-leads";
import { GetLeadTimelineUseCase } from "./application/get-lead-timeline";
import { GetSalesDashboardStatsUseCase } from "./application/get-sales-dashboard-stats";
import { GetSalesReportUseCase } from "./application/get-sales-report";
import { CreateFollowupUseCase } from "./application/create-followup";
import { CompleteFollowupUseCase } from "./application/complete-followup";
import { RescheduleFollowupUseCase } from "./application/reschedule-followup";
import { CancelFollowupUseCase } from "./application/cancel-followup";
import { ListTodaysFollowupsUseCase } from "./application/list-todays-followups";
import { ListOverdueFollowupsUseCase } from "./application/list-overdue-followups";
import { SupabaseLeadRepository } from "./infrastructure/supabase-lead-repository";
import { SupabaseLeadFollowupRepository } from "./infrastructure/supabase-lead-followup-repository";
import { SupabaseLeadTimelineRepository } from "./infrastructure/supabase-lead-timeline-repository";
import { SupabaseSalesDashboardRepository } from "./infrastructure/supabase-sales-dashboard-repository";
import { SupabaseSalesReportRepository } from "./infrastructure/supabase-sales-report-repository";

export type {
  LeadStatus,
  LeadSource,
  LeadLostReason,
  LeadGender,
  LeadSummary,
  LeadDetail,
  CreateLeadInput,
  UpdateLeadInput,
  ConvertLeadInput,
  ConvertLeadOutput,
} from "./domain/lead";
export type { FollowupStatus, LeadFollowup, CreateFollowupInput } from "./domain/lead-followup";
export type { LeadTimelineEntry } from "./domain/lead-timeline-entry";
export type { SalesDashboardStats } from "./domain/sales-dashboard-stats";
export type { SalesReport, SalesReportInput, SalesReportRow, SalesBreakdownEntry, SalespersonPerformance } from "./domain/sales-report";
export type { LeadRepository } from "./domain/lead-repository";
export type { LeadFollowupRepository } from "./domain/lead-followup-repository";

export { ListLeadsUseCase } from "./application/list-leads";
export { SearchLeadsUseCase } from "./application/search-leads";
export { GetLeadDetailUseCase } from "./application/get-lead-detail";
export { CreateLeadUseCase } from "./application/create-lead";
export { UpdateLeadUseCase } from "./application/update-lead";
export { AssignLeadUseCase, type AssignLeadInput } from "./application/assign-lead";
export { MarkLeadLostUseCase, type MarkLeadLostInput } from "./application/mark-lead-lost";
export { RestoreLeadUseCase } from "./application/restore-lead";
export { ConvertLeadUseCase } from "./application/convert-lead";
export { CheckDuplicateLeadsUseCase, type CheckDuplicateLeadsInput } from "./application/check-duplicate-leads";
export { GetLeadTimelineUseCase } from "./application/get-lead-timeline";
export { GetSalesDashboardStatsUseCase } from "./application/get-sales-dashboard-stats";
export { GetSalesReportUseCase } from "./application/get-sales-report";
export { CreateFollowupUseCase } from "./application/create-followup";
export { CompleteFollowupUseCase, type CompleteFollowupInput } from "./application/complete-followup";
export { RescheduleFollowupUseCase, type RescheduleFollowupInput } from "./application/reschedule-followup";
export { CancelFollowupUseCase } from "./application/cancel-followup";
export { ListTodaysFollowupsUseCase } from "./application/list-todays-followups";
export { ListOverdueFollowupsUseCase } from "./application/list-overdue-followups";
export { SupabaseLeadRepository } from "./infrastructure/supabase-lead-repository";
export { SupabaseLeadFollowupRepository } from "./infrastructure/supabase-lead-followup-repository";
export { SupabaseLeadTimelineRepository } from "./infrastructure/supabase-lead-timeline-repository";
export { SupabaseSalesDashboardRepository } from "./infrastructure/supabase-sales-dashboard-repository";
export { SupabaseSalesReportRepository } from "./infrastructure/supabase-sales-report-repository";

/**
 * The Sales/Leads context's composition root — same one-entry-point shape
 * as every other context (createReceptionModule, createHrModule,
 * createAuditModule). Covers the Sales Dashboard, Leads list/detail,
 * Follow-ups, and Convert-to-Member (which delegates to the existing
 * register_membership() via the convert_lead_to_member() RPC — see
 * supabase/migrations/20260821000001_sales_leads_crm.sql — never a second
 * implementation of member registration).
 */
export function createSalesModule(client: TypedSupabaseClient) {
  const leadRepository = new SupabaseLeadRepository(client);
  const followupRepository = new SupabaseLeadFollowupRepository(client);
  const timelineRepository = new SupabaseLeadTimelineRepository(client);
  const dashboardRepository = new SupabaseSalesDashboardRepository(client);
  const salesReportRepository = new SupabaseSalesReportRepository(client);

  return {
    listLeads: new ListLeadsUseCase(leadRepository),
    searchLeads: new SearchLeadsUseCase(leadRepository),
    getLeadDetail: new GetLeadDetailUseCase(leadRepository),
    createLead: new CreateLeadUseCase(leadRepository),
    updateLead: new UpdateLeadUseCase(leadRepository),
    assignLead: new AssignLeadUseCase(leadRepository),
    markLeadLost: new MarkLeadLostUseCase(leadRepository),
    restoreLead: new RestoreLeadUseCase(leadRepository),
    convertLead: new ConvertLeadUseCase(leadRepository),
    checkDuplicateLeads: new CheckDuplicateLeadsUseCase(leadRepository),
    getLeadTimeline: new GetLeadTimelineUseCase(timelineRepository),
    getSalesDashboardStats: new GetSalesDashboardStatsUseCase(dashboardRepository),
    getSalesReport: new GetSalesReportUseCase(salesReportRepository),
    createFollowup: new CreateFollowupUseCase(followupRepository),
    completeFollowup: new CompleteFollowupUseCase(followupRepository),
    rescheduleFollowup: new RescheduleFollowupUseCase(followupRepository),
    cancelFollowup: new CancelFollowupUseCase(followupRepository),
    listTodaysFollowups: new ListTodaysFollowupsUseCase(followupRepository),
    listOverdueFollowups: new ListOverdueFollowupsUseCase(followupRepository),
  };
}
