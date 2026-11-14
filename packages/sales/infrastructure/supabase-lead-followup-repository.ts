import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { CreateFollowupInput, LeadFollowup } from "../domain/lead-followup";
import type { LeadFollowupRepository } from "../domain/lead-followup-repository";

const COLUMNS = `id, lead_id, due_at, note, status, completed_at, completed_note, created_at,
  lead:leads (full_name, phone)`;

interface FollowupRow {
  id: string;
  lead_id: string;
  due_at: string;
  note: string | null;
  status: LeadFollowup["status"];
  completed_at: string | null;
  completed_note: string | null;
  created_at: string;
  lead: { full_name: string; phone: string } | null;
}

function toFollowup(row: FollowupRow): LeadFollowup {
  return {
    followupId: row.id,
    leadId: row.lead_id,
    leadFullName: row.lead?.full_name ?? "—",
    leadPhone: row.lead?.phone ?? "—",
    dueAt: new Date(row.due_at),
    note: row.note,
    status: row.status,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    completedNote: row.completed_note,
    createdAt: new Date(row.created_at),
  };
}

function startOfDay(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfNextDay(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export class SupabaseLeadFollowupRepository implements LeadFollowupRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async listForLead(leadId: string): Promise<Result<LeadFollowup[]>> {
    const { data, error } = await this.client
      .from("lead_followups")
      .select(COLUMNS)
      .eq("lead_id", leadId)
      .order("due_at", { ascending: true });

    if (error) {
      return err(domainError("FOLLOWUP_LIST_FAILED", error.message));
    }
    return ok((data as unknown as FollowupRow[]).map(toFollowup));
  }

  async listDueToday(): Promise<Result<LeadFollowup[]>> {
    const now = new Date();
    const { data, error } = await this.client
      .from("lead_followups")
      .select(COLUMNS)
      .eq("status", "pending")
      .gte("due_at", startOfDay(now))
      .lt("due_at", startOfNextDay(now))
      .order("due_at", { ascending: true });

    if (error) {
      return err(domainError("FOLLOWUP_LIST_FAILED", error.message));
    }
    return ok((data as unknown as FollowupRow[]).map(toFollowup));
  }

  async listOverdue(): Promise<Result<LeadFollowup[]>> {
    const { data, error } = await this.client
      .from("lead_followups")
      .select(COLUMNS)
      .eq("status", "pending")
      .lt("due_at", startOfDay(new Date()))
      .order("due_at", { ascending: true });

    if (error) {
      return err(domainError("FOLLOWUP_LIST_FAILED", error.message));
    }
    return ok((data as unknown as FollowupRow[]).map(toFollowup));
  }

  /**
   * Scheduling a follow-up = setting the lead's next action (set_lead_next_action): the previous pending follow-up, if any, is
   * replaced and the change is recorded in the lead history. An active lead always has exactly one next action.
   */
  async create(input: CreateFollowupInput): Promise<Result<{ followupId: string }>> {
    const { data, error } = await this.client.rpc("set_lead_next_action", {
      p_lead_id: input.leadId,
      p_kind: input.kind ?? "call",
      p_at: input.dueAt,
      p_note: input.note,
    });
    if (error) {
      return err(domainError("FOLLOWUP_CREATE_FAILED", error.message));
    }
    return ok({ followupId: data as unknown as string });
  }

  /** A follow-up is completed by recording what happened (Record contact), which also schedules the next action. */
  async complete(): Promise<Result<void>> {
    return err(domainError("FOLLOWUP_USE_RECORD_CONTACT", "Use Record contact: it completes the follow-up and schedules the next one."));
  }

  async reschedule(followupId: string, dueAt: string): Promise<Result<void>> {
    const { data: row, error: readError } = await this.client.from("lead_followups").select("lead_id, kind, note").eq("id", followupId).single();
    if (readError || !row) {
      return err(domainError("FOLLOWUP_RESCHEDULE_FAILED", readError?.message ?? "Follow-up not found."));
    }
    const r = row as unknown as { lead_id: string; kind: string | null; note: string | null };
    const { error } = await this.client.rpc("set_lead_next_action", { p_lead_id: r.lead_id, p_kind: r.kind ?? "call", p_at: dueAt, p_note: r.note });
    if (error) {
      return err(domainError("FOLLOWUP_RESCHEDULE_FAILED", error.message));
    }
    return ok(undefined);
  }

  /** Not allowed on its own: it would leave an active lead without a next action. Reschedule it, or mark the lead lost. */
  async cancel(): Promise<Result<void>> {
    return err(domainError("FOLLOWUP_CANCEL_NOT_ALLOWED", "An active lead must keep a next action. Reschedule it, or mark the lead as lost."));
  }
}
