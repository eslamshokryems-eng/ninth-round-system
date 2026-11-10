import { describe, expect, it } from "vitest";
import { validateDisplayName } from "./challenge-display-name";

describe("validateDisplayName", () => {
  it("rejects a name shorter than 2 characters", () => {
    expect(validateDisplayName("A").isErr).toBe(true);
    expect(validateDisplayName("").isErr).toBe(true);
    expect(validateDisplayName("  ").isErr).toBe(true);
  });

  it("rejects a name longer than 30 characters", () => {
    expect(validateDisplayName("A".repeat(31)).isErr).toBe(true);
  });

  it("accepts a name within range and trims surrounding whitespace", () => {
    const result = validateDisplayName("  Iron Fist  ");
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toBe("Iron Fist");
    }
  });
});
