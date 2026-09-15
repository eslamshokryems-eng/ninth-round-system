import type { Result } from "@9thround/shared-kernel";
import type { SellAdditionalMembershipInput, SellAdditionalMembershipOutput } from "./additional-membership";

export interface AdditionalMembershipRepository {
  sell(input: SellAdditionalMembershipInput): Promise<Result<SellAdditionalMembershipOutput>>;
}
