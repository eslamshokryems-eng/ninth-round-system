import { describe, expect, it } from "vitest";
import { Email } from "./email";

describe("Email", () => {
  it("accepts a well-formed address and normalizes case/whitespace", () => {
    const result = Email.create("  Eslam@NinthRound.com  ");
    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value.value).toBe("eslam@ninthround.com");
  });

  it("rejects an address with no @ or no domain", () => {
    expect(Email.create("not-an-email").isErr).toBe(true);
    expect(Email.create("missing-domain@").isErr).toBe(true);
    expect(Email.create("@missing-local.com").isErr).toBe(true);
  });
});
