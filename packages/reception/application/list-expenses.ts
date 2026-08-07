import type { Result, UseCase } from "@9thround/shared-kernel";
import type { Expense } from "../domain/expense";
import type { ExpenseRepository } from "../domain/expense-repository";

export class ListExpensesUseCase implements UseCase<string, Expense[]> {
  constructor(private readonly expenses: ExpenseRepository) {}

  async execute(branchId: string): Promise<Result<Expense[]>> {
    return this.expenses.list(branchId);
  }
}
