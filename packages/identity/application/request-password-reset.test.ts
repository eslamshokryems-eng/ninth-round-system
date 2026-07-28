import { describe, expect, it } from "vitest";
import { RequestPasswordResetUseCase } from "./request-password-reset";
import { FakeAuthPort } from "./test-helpers";

describe("RequestPasswordResetUseCase", () => {
  it("delegates to AuthPort with a normalized email and the redirect URL", async () => {
    const auth = new FakeAuthPort();
    const useCase = new RequestPasswordResetUseCase(auth);

    const result = await useCase.execute({
      email: "  Eslam@NinthRound.com  ",
      redirectTo: "9thround://reset-password",
    });

    expect(result.isOk).toBe(true);
    expect(auth.passwordResetCalls[0]).toEqual({
      email: "eslam@ninthround.com",
      redirectTo: "9thround://reset-password",
    });
  });

  it("rejects an invalid email before calling AuthPort", async () => {
    const auth = new FakeAuthPort();
    const useCase = new RequestPasswordResetUseCase(auth);

    const result = await useCase.execute({ email: "nope", redirectTo: "9thround://reset-password" });

    expect(result.isErr && result.error.code).toBe("INVALID_EMAIL");
    expect(auth.passwordResetCalls).toHaveLength(0);
  });
});
