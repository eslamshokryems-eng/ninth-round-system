import type { Result } from "@9thround/shared-kernel";
import type { RegisterMembershipInput, RegisterMembershipOutput } from "./registration";

export interface RegistrationRepository {
  register(input: RegisterMembershipInput): Promise<Result<RegisterMembershipOutput>>;
}
