import type { Result } from "@9thround/shared-kernel";
import type { MembershipType } from "./membership-type";

export interface MembershipTypesRepository {
  listActive(): Promise<Result<MembershipType[]>>;
}
