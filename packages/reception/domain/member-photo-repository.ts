import type { Result } from "@9thround/shared-kernel";
import type { UploadMemberPhotoInput, UploadMemberPhotoOutput } from "./member-photo";

export interface MemberPhotoRepository {
  upload(input: UploadMemberPhotoInput): Promise<Result<UploadMemberPhotoOutput>>;
}
