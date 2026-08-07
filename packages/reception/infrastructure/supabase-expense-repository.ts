import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { ExpenseRepository } from "../domain/expense-repository";
import type { Expense, RecordExpenseInput } from "../domain/expense";
import type { ExpenseRow } from "@9thround/database-types";

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    amount: row.amount,
    expenseDate: row.expense_date,
    paymentMethod: row.payment_method,
    receiptReference: row.receipt_reference,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export class SupabaseExpenseRepository implements ExpenseRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async record(input: RecordExpenseInput): Promise<Result<Expense>> {
    const { data, error } = await this.client
      .from("expenses")
      .insert({
        branch_id: input.branchId,
        category: input.category,
        description: input.description,
        amount: input.amount,
        expense_date: input.expenseDate,
        payment_method: input.paymentMethod,
        receipt_reference: input.receiptReference,
        notes: input.notes,
      })
      .select()
      .single();

    if (error) {
      return err(domainError("RECORD_EXPENSE_FAILED", error.message));
    }
    return ok(toExpense(data));
  }

  async list(branchId: string): Promise<Result<Expense[]>> {
    const { data, error } = await this.client
      .from("expenses")
      .select()
      .eq("branch_id", branchId)
      .order("expense_date", { ascending: false })
      .limit(100);

    if (error) {
      return err(domainError("LIST_EXPENSES_FAILED", error.message));
    }
    return ok(data.map(toExpense));
  }
}
