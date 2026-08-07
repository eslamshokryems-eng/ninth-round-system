import { describe, expect, it } from "vitest";
import { RecordExpenseUseCase } from "./record-expense";
import { buildRecordExpenseInput, fakeExpenseRepository, FakeExpenseRepository } from "./test-helpers";
import { domainError, err } from "@9thround/shared-kernel";

describe("RecordExpenseUseCase", () => {
  it("records and returns the expense", async () => {
    const repo = fakeExpenseRepository({ id: "expense-42", amount: 200 });
    const useCase = new RecordExpenseUseCase(repo);

    const result = await useCase.execute(buildRecordExpenseInput());

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value.id).toBe("expense-42");
  });

  it("passes the input through to the repository unchanged", async () => {
    const repo = fakeExpenseRepository();
    const useCase = new RecordExpenseUseCase(repo);
    const input = buildRecordExpenseInput({ category: "rent" });

    await useCase.execute(input);

    expect(repo.lastInput?.category).toBe("rent");
  });

  it("rejects a zero or negative amount before hitting the repository", async () => {
    const repo = fakeExpenseRepository();
    const useCase = new RecordExpenseUseCase(repo);

    const result = await useCase.execute(buildRecordExpenseInput({ amount: 0 }));

    expect(result.isErr && result.error.code).toBe("INVALID_AMOUNT");
    expect(repo.lastInput).toBeNull();
  });

  it("propagates a repository failure without transforming it", async () => {
    const repo = new FakeExpenseRepository(err(domainError("RECORD_EXPENSE_FAILED", "db error")));
    const useCase = new RecordExpenseUseCase(repo);

    const result = await useCase.execute(buildRecordExpenseInput());

    expect(result.isErr && result.error.code).toBe("RECORD_EXPENSE_FAILED");
  });
});
