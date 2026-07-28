import { describe, expect, it } from "vitest";
import { SignInUseCase } from "./sign-in";
import { FakeAuthPort } from "./test-helpers";

describe("SignInUseCase", () => {
  it("delegates to AuthPort with a normalized email", async () => {
    const auth = new FakeAuthPort();
    const useCase = new SignInUseCase(auth);

    const result = await useCase.execute({ email: "  Eslam@NinthRound.com  ", password: "anything" });

    expect(result.isOk).toBe(true);
    expect(auth.signInCalls[0]?.email).toBe("eslam@ninthround.com");
    expect(auth.signInCalls[0]?.password).toBe("anything");
  });

  it("rejects an invalid email before calling AuthPort", async () => {
    const auth = new FakeAuthPort();
    const useCase = new SignInUseCase(auth);

    const result = await useCase.execute({ email: "nope", password: "anything" });

    expect(result.isErr && result.error.code).toBe("INVALID_EMAIL");
    expect(auth.signInCalls).toHaveLength(0);
  });
});
