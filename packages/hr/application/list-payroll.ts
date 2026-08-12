import type { Result, UseCase } from "@9thround/shared-kernel";
import type { PayrollEntry } from "../domain/salary";
import type { SalaryRepository } from "../domain/salary-repository";

export class ListPayrollUseCase implements UseCase<string, PayrollEntry[]> {
  constructor(private readonly salaries: SalaryRepository) {}

  async execute(branchId: string): Promise<Result<PayrollEntry[]>> {
    return this.salaries.listCurrentForBranch(branchId);
  }
}
