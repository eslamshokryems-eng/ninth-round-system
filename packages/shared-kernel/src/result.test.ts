import { describe, expect, it } from "vitest";
import { domainError, err, map, mapErr, ok } from "./result";
import type { Result } from "./result";

describe("Result", () => {
  it("ok() produces a value branch that map() transforms", () => {
    const result = ok(2);
    const mapped = map(result, (n) => n * 10);
    expect(mapped.isOk).toBe(true);
    expect(mapped.isOk && mapped.value).toBe(20);
  });

  it("err() produces an error branch that map() leaves untouched", () => {
    const failure = err(domainError("NOT_FOUND", "missing"));
    const mapped = map(failure, (n: number) => n * 10);
    expect(mapped.isErr).toBe(true);
    expect(mapped.isErr && mapped.error.code).toBe("NOT_FOUND");
  });

  it("mapErr() transforms only the error branch", () => {
    const failure = err(domainError("NOT_FOUND", "missing"));
    const mapped = mapErr(failure, (e) => domainError(e.code, `wrapped: ${e.message}`));
    expect(mapped.isErr && mapped.error.message).toBe("wrapped: missing");

    const success: Result<number> = ok(42);
    const mappedSuccess = mapErr(success, (e: ReturnType<typeof domainError>) =>
      domainError(e.code, "unused"),
    );
    expect(mappedSuccess.isOk && mappedSuccess.value).toBe(42);
  });
});
