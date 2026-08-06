import type { Result } from "@9thround/shared-kernel";
import type { RenewMembershipInput, RenewMembershipOutput } from "./renewal";

export interface RenewalRepository {
  renew(input: RenewMembershipInput): Promise<Result<RenewMembershipOutput>>;
}
