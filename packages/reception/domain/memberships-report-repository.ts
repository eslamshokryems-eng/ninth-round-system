import type { Result } from "@9thround/shared-kernel";
import type { MembershipsReport, MembershipsReportInput } from "./memberships-report";

export interface MembershipsReportRepository {
  getReport(input: MembershipsReportInput): Promise<Result<MembershipsReport>>;
}
