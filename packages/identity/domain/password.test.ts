import { describe, expect, it } from "vitest";
import { Password } from "./password";

describe("Password", () => {
  it("accepts a password of at least 10 characters", () => {
    const result = Password.create("correcthorse");
    expect(result.isOk).toBe(true);
  });

  it("rejects a password shorter than 10 characters", () => {
    const result = Password.create("short1");
    expect(result.isErr && result.error.code).toBe("PASSWORD_TOO_SHORT");
  });
});
