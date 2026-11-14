import type { Result } from "@9thround/shared-kernel";
import type { AttentionLead, AttentionQuery, TeamEmployeeRow, TeamPeriod, TeamSummary } from "./team";
import type {
  AssignLeadsInput, InterestLevel, LeadActivity, LeadWorkspaceState, LeadAssignmentRecord, LogInteractionInput, SetNextActionInput, WorklistItem, WorklistSummary,
} from "./workspace";

/**
 * Every operation is a database function that authorises with auth.uid() (migration 20261124000001); no actor id is ever sent.
 * `ownerId` null = the caller's own worklist; a branch manager / Super Admin may pass an employee of their branch.
 */
export interface LeadWorkspaceRepository {
  getWorklist(ownerId: string | null, limit: number, offset: number): Promise<Result<WorklistItem[]>>;
  getSummary(ownerId: string | null): Promise<Result<WorklistSummary>>;
  logInteraction(input: LogInteractionInput): Promise<Result<string>>;
  setNextAction(input: SetNextActionInput): Promise<Result<string>>;
  addNote(leadId: string, note: string): Promise<Result<string>>;
  setInterest(leadId: string, level: InterestLevel): Promise<Result<void>>;
  assignLeads(input: AssignLeadsInput): Promise<Result<number>>;
  listActivities(leadId: string): Promise<Result<LeadActivity[]>>;
  getLeadState(leadId: string): Promise<Result<LeadWorkspaceState | null>>;
  listAssignments(leadId: string): Promise<Result<LeadAssignmentRecord[]>>;
  getTeamSummary(period: TeamPeriod): Promise<Result<TeamSummary>>;
  getTeamOverview(period: TeamPeriod): Promise<Result<TeamEmployeeRow[]>>;
  listAttentionLeads(query: AttentionQuery): Promise<Result<AttentionLead[]>>;
}
