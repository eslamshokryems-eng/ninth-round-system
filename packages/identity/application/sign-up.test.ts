import { describe, expect, it } from "vitest";
import { SignUpUseCase } from "./sign-up";
import { FakeAuthPort } from "./test-helpers";

describe("SignUpUseCase", () => {
  it("normalizes the email and delegates to AuthPort on valid input", async () => {
    const auth = new FakeAuthPort();
    const useCase = new SignUpUseCase(auth);

    const result = await useCase.execute({
      email: "  Eslam@NinthRound.com  ",
      password: "correcthorsebattery",
      preferredLocale: "ar",
    });

    expect(result.isOk).toBe(true);
    expect(auth.signUpCalls).toHaveLength(1);
    expect(auth.signUpCalls[0]?.email).toBe("eslam@ninthround.com");
    expect(auth.signUpCalls[0]?.preferredLocale).toBe("ar");
  });

  it("rejects an invalid email before calling AuthPort", async () => {
    const auth = new FakeAuthPort();
    const useCase = new SignUpUseCase(auth);

    const result = await useCase.execute({
      email: "not-an-email",
      password: "correcthorsebattery",
      preferredLocale: "en",
    });

    expect(result.isErr && result.error.code).toBe("INVALID_EMAIL");
    expect(auth.signUpCalls).toHaveLength(0);
  });

  it("rejects a short password before calling AuthPort", async () => {
    const auth = new FakeAuthPort();
    const useCase = new SignUpUseCase(auth);

    const result = await useCase.execute({
      email: "eslam@ninthround.com",
      password: "short",
      preferredLocale: "en",
    });

    expect(result.isErr && result.error.code).toBe("PASSWORD_TOO_SHORT");
    expect(auth.signUpCalls).toHaveLength(0);
  });
});
