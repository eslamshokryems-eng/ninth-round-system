import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { Expense, RecordExpenseInput } from "../domain/expense";
import type { ExpenseRepository } from "../domain/expense-repository";

export class RecordExpenseUseCase implements UseCase<RecordExpenseInput, Expense> {
  constructor(private readonly expenses: ExpenseRepository) {}

  async execute(input: RecordExpenseInput): Promise<Result<Expense>> {
    if (input.amount <= 0) {
      return err(domainError("INVALID_AMOUNT", "Amount must be greater than zero."));
    }
    return this.expenses.record(input);
  }
}
