import type { Result } from "@9thround/shared-kernel";
import type { UpdateMemberInput } from "./update-member";

export interface UpdateMemberRepository {
  update(input: UpdateMemberInput): Promise<Result<void>>;
}
