import type { Result } from "@9thround/shared-kernel";
import type { CreateFollowupInput, LeadFollowup } from "./lead-followup";

export interface LeadFollowupRepository {
  listForLead(leadId: string): Promise<Result<LeadFollowup[]>>;
  /** Pending, due today (caller's local calendar day), across every lead visible to the caller. */
  listDueToday(): Promise<Result<LeadFollowup[]>>;
  /** Pending, due before today — still outstanding. */
  listOverdue(): Promise<Result<LeadFollowup[]>>;
  create(input: CreateFollowupInput): Promise<Result<{ followupId: string }>>;
  complete(followupId: string, note: string | null): Promise<Result<void>>;
  reschedule(followupId: string, dueAt: string): Promise<Result<void>>;
  cancel(followupId: string): Promise<Result<void>>;
}
