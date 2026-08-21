import type { Result } from "@9thround/shared-kernel";
import type { LeadTimelineEntry } from "./lead-timeline-entry";

export interface LeadTimelineRepository {
  listForLead(leadId: string): Promise<Result<LeadTimelineEntry[]>>;
}
