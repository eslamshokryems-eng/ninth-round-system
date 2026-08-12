import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { SalaryRecord } from "../domain/salary";
import type { SalaryRepository, SetSalaryInput } from "../domain/salary-repository";

export class SetSalaryUseCase implements UseCase<SetSalaryInput, SalaryRecord> {
  constructor(private readonly salaries: SalaryRepository) {}

  async execute(input: SetSalaryInput): Promise<Result<SalaryRecord>> {
    if (input.monthlyAmount < 0) {
      return err(domainError("INVALID_SALARY_AMOUNT", "Salary cannot be negative."));
    }
    return this.salaries.setSalary(input);
  }
}
