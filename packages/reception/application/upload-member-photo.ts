import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { UploadMemberPhotoInput, UploadMemberPhotoOutput } from "../domain/member-photo";
import type { MemberPhotoRepository } from "../domain/member-photo-repository";

/** The registration form's "Take Photo" / "Choose from Gallery" step, run before register_membership() so its result (a signed URL) can be passed as p_photo_url in the same save. */
export class UploadMemberPhotoUseCase implements UseCase<UploadMemberPhotoInput, UploadMemberPhotoOutput> {
  constructor(private readonly photos: MemberPhotoRepository) {}

  async execute(input: UploadMemberPhotoInput): Promise<Result<UploadMemberPhotoOutput>> {
    if (input.data.byteLength === 0) {
      return err(domainError("EMPTY_PHOTO", "The selected photo could not be read."));
    }
    return this.photos.upload(input);
  }
}
