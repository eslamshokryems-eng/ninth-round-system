import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { MemberPhotoRepository } from "../domain/member-photo-repository";
import type { UploadMemberPhotoInput, UploadMemberPhotoOutput } from "../domain/member-photo";

const BUCKET = "member-photos";
/** ~10 years — a private bucket needs a signed URL to be viewable at all; this is a pragmatic stand-in for "permanent" rather than building a resigning mechanism (see docs/phase-1/14-reception-membership.md). */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;

export class SupabaseMemberPhotoRepository implements MemberPhotoRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async upload(input: UploadMemberPhotoInput): Promise<Result<UploadMemberPhotoOutput>> {
    const path = `${input.branchId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${input.fileExtension}`;

    const { error: uploadError } = await this.client.storage
      .from(BUCKET)
      .upload(path, input.data, { contentType: input.contentType, upsert: false });

    if (uploadError) {
      return err(domainError("PHOTO_UPLOAD_FAILED", uploadError.message));
    }

    const { data: signedData, error: signError } = await this.client.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (signError || !signedData) {
      return err(domainError("PHOTO_UPLOAD_FAILED", signError?.message ?? "Could not create a signed URL for the uploaded photo."));
    }

    return ok({ path, signedUrl: signedData.signedUrl });
  }
}
