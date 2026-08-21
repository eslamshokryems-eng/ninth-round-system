import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { LeadTimelineEntry } from "../domain/lead-timeline-entry";
import type { LeadTimelineRepository } from "../domain/lead-timeline-repository";

interface TimelineRow {
  id: string;
  action: string;
  actor_role: string | null;
  actor_full_name: string | null;
  before: unknown;
  after: unknown;
  metadata: Record<string, unknown>;
  created_at: string;
}

export class SupabaseLeadTimelineRepository implements LeadTimelineRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async listForLead(leadId: string): Promise<Result<LeadTimelineEntry[]>> {
    const { data, error } = await this.client.rpc("get_lead_timeline", { p_lead_id: leadId });

    if (error) {
      return err(domainError("LEAD_TIMELINE_FAILED", error.message));
    }

    return ok(
      (data as TimelineRow[]).map((row) => ({
        id: row.id,
        action: row.action,
        actorRole: row.actor_role,
        actorFullName: row.actor_full_name,
        before: row.before,
        after: row.after,
        metadata: row.metadata,
        occurredAt: new Date(row.created_at),
      })),
    );
  }
}
