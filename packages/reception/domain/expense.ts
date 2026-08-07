import type { PaymentMethod } from "./registration";

export type ExpenseCategory = "rent" | "utilities" | "salaries" | "maintenance" | "supplies" | "marketing" | "other";

export interface RecordExpenseInput {
  branchId: string;
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  expenseDate: string;
  paymentMethod: PaymentMethod;
  receiptReference: string | null;
  notes: string | null;
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  expenseDate: string;
  paymentMethod: PaymentMethod;
  receiptReference: string | null;
  notes: string | null;
  createdAt: string;
}
