import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LeadWorkspaceRepository } from "../domain/lead-workspace-repository";
import {
  INTERACTION_KINDS, INTERACTION_OUTCOMES, NEXT_ACTION_KINDS, isTerminalOutcome,
} from "../domain/workspace";
import type {
  AssignLeadsInput, InterestLevel, LeadActivity, LeadAssignmentRecord, LeadWorkspaceState, LogInteractionInput, SetNextActionInput, WorklistItem, WorklistSummary,
} from "../domain/workspace";

export interface WorklistInput { ownerId?: string | null; limit?: number; offset?: number }

export class GetMyWorklistUseCase implements UseCase<WorklistInput, WorklistItem[]> {
  constructor(private readonly workspace: LeadWorkspaceRepository) {}
  execute(input: WorklistInput = {}): Promise<Result<WorklistItem[]>> {
    return this.workspace.getWorklist(input.ownerId ?? null, input.limit ?? 100, input.offset ?? 0);
  }
}

export class GetWorklistSummaryUseCase implements UseCase<{ ownerId?: string | null }, WorklistSummary> {
  constructor(private readonly workspace: LeadWorkspaceRepository) {}
  execute(input: { ownerId?: string | null } = {}): Promise<Result<WorklistSummary>> {
    return this.workspace.getSummary(input.ownerId ?? null);
  }
}

/**
 * Early, friendly validation only (the database enforces the same rules): an active lead must always leave with a next action —
 * unless the interaction legitimately closes it (not interested, with a lost reason).
 */
export class LogLeadInteractionUseCase implements UseCase<LogInteractionInput, string> {
  constructor(private readonly workspace: LeadWorkspaceRepository, private readonly now: () => Date = () => new Date()) {}

  async execute(input: LogInteractionInput): Promise<Result<string>> {
    if (!INTERACTION_KINDS.includes(input.kind)) return err(domainError("INTERACTION_KIND_INVALID", "Choose call, WhatsApp or visit."));
    if (!INTERACTION_OUTCOMES.includes(input.outcome)) return err(domainError("INTERACTION_OUTCOME_INVALID", "Choose how it went."));
    if (isTerminalOutcome(input.outcome)) {
      if (!input.lostReason) return err(domainError("LOST_REASON_REQUIRED", "Choose why the lead is lost."));
    } else {
      if (!input.nextKind || !NEXT_ACTION_KINDS.includes(input.nextKind) || !input.nextAt) {
        return err(domainError("NEXT_ACTION_REQUIRED", "Schedule the next action (what and when) — an active lead must always have one."));
      }
      if (input.nextAt.getTime() < this.now().getTime() - 5 * 60 * 1000) {
        return err(domainError("NEXT_ACTION_IN_PAST", "The next action must be in the future."));
      }
    }
    return this.workspace.logInteraction({ ...input, note: input.note?.trim() || null });
  }
}

export class SetLeadNextActionUseCase implements UseCase<SetNextActionInput, string> {
  constructor(private readonly workspace: LeadWorkspaceRepository, private readonly now: () => Date = () => new Date()) {}
  async execute(input: SetNextActionInput): Promise<Result<string>> {
    if (!NEXT_ACTION_KINDS.includes(input.kind)) return err(domainError("NEXT_ACTION_KIND_INVALID", "Choose the next action type."));
    if (input.at.getTime() < this.now().getTime() - 5 * 60 * 1000) return err(domainError("NEXT_ACTION_IN_PAST", "The next action must be scheduled in the future."));
    return this.workspace.setNextAction({ ...input, note: input.note?.trim() || null });
  }
}

export class AddLeadNoteUseCase implements UseCase<{ leadId: string; note: string }, string> {
  constructor(private readonly workspace: LeadWorkspaceRepository) {}
  async execute(input: { leadId: string; note: string }): Promise<Result<string>> {
    if (!input.note.trim()) return err(domainError("NOTE_REQUIRED", "Write a note."));
    return this.workspace.addNote(input.leadId, input.note.trim());
  }
}

export class SetLeadInterestUseCase implements UseCase<{ leadId: string; level: InterestLevel }, void> {
  constructor(private readonly workspace: LeadWorkspaceRepository) {}
  execute(input: { leadId: string; level: InterestLevel }): Promise<Result<void>> {
    return this.workspace.setInterest(input.leadId, input.level);
  }
}

/** Assign or reassign: a specific employee and a reason are mandatory (the database re-checks role, branch and the new owner). */
export class AssignLeadsUseCase implements UseCase<AssignLeadsInput, number> {
  constructor(private readonly workspace: LeadWorkspaceRepository) {}
  async execute(input: AssignLeadsInput): Promise<Result<number>> {
    if (input.leadIds.length === 0) return err(domainError("LEADS_REQUIRED", "Select at least one lead."));
    if (!input.newOwnerId) return err(domainError("OWNER_REQUIRED", "Choose the employee who will own the lead."));
    if (!input.reason.trim()) return err(domainError("ASSIGN_REASON_REQUIRED", "Enter a reason for the assignment."));
    return this.workspace.assignLeads({ ...input, reason: input.reason.trim() });
  }
}

export class ListLeadActivitiesUseCase implements UseCase<string, LeadActivity[]> {
  constructor(private readonly workspace: LeadWorkspaceRepository) {}
  execute(leadId: string): Promise<Result<LeadActivity[]>> { return this.workspace.listActivities(leadId); }
}

export class ListLeadAssignmentsUseCase implements UseCase<string, LeadAssignmentRecord[]> {
  constructor(private readonly workspace: LeadWorkspaceRepository) {}
  execute(leadId: string): Promise<Result<LeadAssignmentRecord[]>> { return this.workspace.listAssignments(leadId); }
}

export class GetLeadWorkspaceStateUseCase implements UseCase<string, LeadWorkspaceState | null> {
  constructor(private readonly workspace: LeadWorkspaceRepository) {}
  execute(leadId: string): Promise<Result<LeadWorkspaceState | null>> { return this.workspace.getLeadState(leadId); }
}
