import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { LeadWorkspaceRepository } from "../domain/lead-workspace-repository";
import type {
  AssignLeadsInput, InterestLevel, InteractionOutcome, LeadActivity, LeadActivityKind, LeadAssignmentRecord, LeadWorkspaceState, LogInteractionInput,
  NextActionKind, SetNextActionInput, WorklistBucket, WorklistItem, WorklistSummary,
} from "../domain/workspace";
import type { LeadSource, LeadStatus } from "../domain/lead";
import type { AttentionLead, AttentionQuery, TeamEmployeeRow, TeamPeriod, TeamSummary } from "../domain/team";

type Row = Record<string, unknown>;
const str = (v: unknown): string => (v == null ? "" : String(v));
const strOrNull = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number => Number(v ?? 0);
const dateOrNull = (v: unknown): Date | null => (v == null ? null : new Date(String(v)));

function toItem(r: Row): WorklistItem {
  return {
    leadId: str(r.lead_id), fullName: str(r.full_name), phone: str(r.phone), source: str(r.source) as LeadSource, status: str(r.status) as LeadStatus,
    interestLevel: str(r.interest_level) as InterestLevel, assignedTo: strOrNull(r.assigned_to), ownerName: strOrNull(r.owner_name),
    lastContactedAt: dateOrNull(r.last_contacted_at), daysSinceContact: r.days_since_contact == null ? null : num(r.days_since_contact),
    nextActionKind: strOrNull(r.next_action_kind) as NextActionKind | null, nextActionAt: dateOrNull(r.next_action_at),
    lastOutcome: strOrNull(r.last_outcome) as InteractionOutcome | null, bucket: str(r.bucket) as WorklistBucket, reason: str(r.reason), branchId: str(r.branch_id),
  };
}

/** Thin RPC adapter. It never sends an actor id: the database identifies the caller with auth.uid(). Database messages are surfaced unchanged. */
export class SupabaseLeadWorkspaceRepository implements LeadWorkspaceRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getWorklist(ownerId: string | null, limit: number, offset: number): Promise<Result<WorklistItem[]>> {
    const { data, error } = await this.client.rpc("get_my_worklist", { p_owner: ownerId, p_limit: limit, p_offset: offset });
    if (error) return err(domainError("WORKLIST_FAILED", error.message));
    return ok((data as unknown as Row[]).map(toItem));
  }

  async getSummary(ownerId: string | null): Promise<Result<WorklistSummary>> {
    const { data, error } = await this.client.rpc("get_worklist_summary", { p_owner: ownerId });
    if (error) return err(domainError("WORKLIST_SUMMARY_FAILED", error.message));
    const r = (data as unknown as Row[])[0];
    if (!r) return err(domainError("WORKLIST_SUMMARY_FAILED", "The worklist summary returned no data."));
    return ok({
      totalActive: num(r.total_active), overdue: num(r.overdue), dueToday: num(r.due_today), newUncontacted: num(r.new_uncontacted), hot: num(r.hot),
      noNextAction: num(r.no_next_action), contactedRecently: num(r.contacted_recently), awaitingResponse: num(r.awaiting_response),
      readyToConvert: num(r.ready_to_convert), recentlyConverted: num(r.recently_converted),
    });
  }

  async logInteraction(input: LogInteractionInput): Promise<Result<string>> {
    const { data, error } = await this.client.rpc("log_lead_interaction", {
      p_lead_id: input.leadId, p_kind: input.kind, p_outcome: input.outcome, p_note: input.note,
      p_next_kind: input.nextKind, p_next_at: input.nextAt ? input.nextAt.toISOString() : null,
      p_lost_reason: input.lostReason, p_interest_level: input.interestLevel,
    });
    if (error) return err(domainError("LOG_INTERACTION_FAILED", error.message));
    return ok(String(data));
  }

  async setNextAction(input: SetNextActionInput): Promise<Result<string>> {
    const { data, error } = await this.client.rpc("set_lead_next_action", { p_lead_id: input.leadId, p_kind: input.kind, p_at: input.at.toISOString(), p_note: input.note });
    if (error) return err(domainError("SET_NEXT_ACTION_FAILED", error.message));
    return ok(String(data));
  }

  async addNote(leadId: string, note: string): Promise<Result<string>> {
    const { data, error } = await this.client.rpc("add_lead_note", { p_lead_id: leadId, p_note: note });
    if (error) return err(domainError("ADD_NOTE_FAILED", error.message));
    return ok(String(data));
  }

  async setInterest(leadId: string, level: InterestLevel): Promise<Result<void>> {
    const { error } = await this.client.rpc("set_lead_interest", { p_lead_id: leadId, p_level: level });
    if (error) return err(domainError("SET_INTEREST_FAILED", error.message));
    return ok(undefined);
  }

  async assignLeads(input: AssignLeadsInput): Promise<Result<number>> {
    const { data, error } = await this.client.rpc("assign_leads", { p_lead_ids: input.leadIds, p_new_owner: input.newOwnerId, p_reason: input.reason });
    if (error) return err(domainError("ASSIGN_LEADS_FAILED", error.message));
    return ok(Number(data ?? 0));
  }

  async listActivities(leadId: string): Promise<Result<LeadActivity[]>> {
    const { data, error } = await this.client.rpc("get_lead_activities", { p_lead_id: leadId });
    if (error) return err(domainError("LEAD_ACTIVITIES_FAILED", error.message));
    return ok((data as unknown as Row[]).map((r) => ({
      id: str(r.id), kind: str(r.kind) as LeadActivityKind, outcome: strOrNull(r.outcome), note: strOrNull(r.note),
      nextActionKind: strOrNull(r.next_action_kind), nextActionAt: dateOrNull(r.next_action_at),
      detail: (r.detail ?? {}) as Record<string, unknown>, actorId: strOrNull(r.actor_id), actorName: strOrNull(r.actor_name), occurredAt: new Date(str(r.occurred_at)),
    })));
  }

  async getLeadState(leadId: string): Promise<Result<LeadWorkspaceState | null>> {
    const { data, error } = await this.client.rpc("get_lead_workspace_state", { p_lead_id: leadId });
    if (error) return err(domainError("LEAD_STATE_FAILED", error.message));
    const r = (data as unknown as Row[])[0];
    if (!r) return ok(null);
    return ok({ interestLevel: str(r.interest_level) as InterestLevel, lastContactedAt: dateOrNull(r.last_contacted_at), nextActionKind: strOrNull(r.next_action_kind) as NextActionKind | null, nextActionAt: dateOrNull(r.next_action_at) });
  }

  async listAssignments(leadId: string): Promise<Result<LeadAssignmentRecord[]>> {
    const { data, error } = await this.client.rpc("get_lead_assignments", { p_lead_id: leadId });
    if (error) return err(domainError("LEAD_ASSIGNMENTS_FAILED", error.message));
    return ok((data as unknown as Row[]).map((r) => ({
      id: str(r.id), fromOwnerId: strOrNull(r.from_owner), toOwnerId: strOrNull(r.to_owner), fromName: strOrNull(r.from_name), toName: strOrNull(r.to_name),
      performedById: strOrNull(r.performed_by), performedByName: strOrNull(r.performed_by_name), reason: strOrNull(r.reason), createdAt: new Date(str(r.created_at)),
    })));
  }

  async getTeamSummary(period: TeamPeriod): Promise<Result<TeamSummary>> {
    const { data, error } = await this.client.rpc("get_sales_team_summary", { p_branch_id: period.branchId, p_start: period.startDate ?? null, p_end: period.endDate ?? null });
    if (error) return err(domainError("TEAM_SUMMARY_FAILED", error.message));
    const r = (data as unknown as Row[])[0];
    if (!r) return err(domainError("TEAM_SUMMARY_FAILED", "The team summary returned no data."));
    return ok({
      activeLeads: num(r.active_leads), unassignedLeads: num(r.unassigned_leads), newInPeriod: num(r.new_in_period), dueToday: num(r.due_today),
      overdueLeads: num(r.overdue_leads), hotLeads: num(r.hot_leads), noNextAction: num(r.no_next_action), noRecentContact: num(r.no_recent_contact),
      interactionsInPeriod: num(r.interactions_in_period), convertedInPeriod: num(r.converted_in_period), lostInPeriod: num(r.lost_in_period),
      conversionRateDecided: r.conversion_rate_decided == null ? null : Number(r.conversion_rate_decided),
      conversionRateCohort: r.conversion_rate_cohort == null ? null : Number(r.conversion_rate_cohort),
    });
  }

  async getTeamOverview(period: TeamPeriod): Promise<Result<TeamEmployeeRow[]>> {
    const { data, error } = await this.client.rpc("get_sales_team_overview", { p_branch_id: period.branchId, p_start: period.startDate ?? null, p_end: period.endDate ?? null });
    if (error) return err(domainError("TEAM_OVERVIEW_FAILED", error.message));
    return ok((data as unknown as Row[]).map((r) => ({
      employeeId: strOrNull(r.employee_id), employeeName: str(r.employee_name), branchId: strOrNull(r.branch_id), activeLeads: num(r.active_leads),
      overdueLeads: num(r.overdue_leads), dueToday: num(r.due_today), hotLeads: num(r.hot_leads), noNextAction: num(r.no_next_action),
      noRecentContact: num(r.no_recent_contact), newInPeriod: num(r.new_in_period), interactionsInPeriod: num(r.interactions_in_period),
      convertedInPeriod: num(r.converted_in_period), lostInPeriod: num(r.lost_in_period),
    })));
  }

  async listAttentionLeads(query: AttentionQuery): Promise<Result<AttentionLead[]>> {
    const { data, error } = await this.client.rpc("get_attention_leads", { p_kind: query.kind, p_branch_id: query.branchId, p_owner: query.ownerId ?? null, p_limit: query.limit ?? 100, p_offset: query.offset ?? 0 });
    if (error) return err(domainError("ATTENTION_LEADS_FAILED", error.message));
    return ok((data as unknown as Row[]).map((r) => ({
      leadId: str(r.lead_id), fullName: str(r.full_name), phone: str(r.phone), status: str(r.status), interestLevel: str(r.interest_level),
      assignedTo: strOrNull(r.assigned_to), ownerName: strOrNull(r.owner_name), lastContactedAt: dateOrNull(r.last_contacted_at),
      nextActionAt: dateOrNull(r.next_action_at), daysSinceContact: r.days_since_contact == null ? null : num(r.days_since_contact),
      createdAt: new Date(str(r.created_at)), branchId: str(r.branch_id), source: str(r.source),
    })));
  }
}
