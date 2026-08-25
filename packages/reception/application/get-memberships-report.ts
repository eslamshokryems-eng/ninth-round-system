import type { Result, UseCase } from "@9thround/shared-kernel";
import type { MembershipsReport, MembershipsReportInput } from "../domain/memberships-report";
import type { MembershipsReportRepository } from "../domain/memberships-report-repository";

export class GetMembershipsReportUseCase implements UseCase<MembershipsReportInput, MembershipsReport> {
  constructor(private readonly reports: MembershipsReportRepository) {}

  async execute(input: MembershipsReportInput): Promise<Result<MembershipsReport>> {
    return this.reports.getReport(input);
  }
}
