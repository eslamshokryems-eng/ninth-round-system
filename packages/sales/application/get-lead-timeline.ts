import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LeadTimelineEntry } from "../domain/lead-timeline-entry";
import type { LeadTimelineRepository } from "../domain/lead-timeline-repository";

export class GetLeadTimelineUseCase implements UseCase<string, LeadTimelineEntry[]> {
  constructor(private readonly timeline: LeadTimelineRepository) {}

  async execute(leadId: string): Promise<Result<LeadTimelineEntry[]>> {
    return this.timeline.listForLead(leadId);
  }
}
