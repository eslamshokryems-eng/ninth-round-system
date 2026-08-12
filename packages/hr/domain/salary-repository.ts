import type { Result } from "@9thround/shared-kernel";
import type { PayrollEntry, SalaryRecord } from "./salary";

export interface SetSalaryInput {
  profileId: string;
  branchId: string;
  monthlyAmount: number;
  effectiveFrom: string;
}

export interface SalaryRepository {
  setSalary(input: SetSalaryInput): Promise<Result<SalaryRecord>>;
  /** One row per profile — whichever has the latest effectiveFrom not in the future. */
  listCurrentForBranch(branchId: string): Promise<Result<PayrollEntry[]>>;
}
