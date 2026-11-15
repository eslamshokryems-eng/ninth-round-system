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

  async create(input: CreateFollowupInput): Promise<Result<{ followupId: string }>> {
    const { data, error } = await this.client
      .from("lead_followups")
      .insert({ lead_id: input.leadId, branch_id: input.branchId, due_at: input.dueAt, note: input.note })
      .select("id")
      .single();

    if (error) {
      return err(domainError("FOLLOWUP_CREATE_FAILED", error.message));
    }
    return ok({ followupId: data.id });
  }

  async complete(followupId: string, note: string | null): Promise<Result<void>> {
    const { error } = await this.client
      .from("lead_followups")
      .update({ status: "completed", completed_at: new Date().toISOString(), completed_note: note })
      .eq("id", followupId);

    if (error) {
      return err(domainError("FOLLOWUP_COMPLETE_FAILED", error.message));
    }
    return ok(undefined);
  }

  async reschedule(followupId: string, dueAt: string): Promise<Result<void>> {
    const { error } = await this.client.from("lead_followups").update({ due_at: dueAt }).eq("id", followupId);

    if (error) {
      return err(domainError("FOLLOWUP_RESCHEDULE_FAILED", error.message));
    }
    return ok(undefined);
  }

  async cancel(followupId: string): Promise<Result<void>> {
    const { error } = await this.client.from("lead_followups").update({ status: "cancelled" }).eq("id", followupId);

    if (error) {
      return err(domainError("FOLLOWUP_CANCEL_FAILED", error.message));
    }
    return ok(undefined);
  }
}
