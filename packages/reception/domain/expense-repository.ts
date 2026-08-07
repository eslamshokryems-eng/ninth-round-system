import type { Result } from "@9thround/shared-kernel";
import type { Expense, RecordExpenseInput } from "./expense";

export interface ExpenseRepository {
  record(input: RecordExpenseInput): Promise<Result<Expense>>;
  list(branchId: string): Promise<Result<Expense[]>>;
}
