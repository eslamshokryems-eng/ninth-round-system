import { describe, expect, it } from "vitest";
import { UploadMemberPhotoUseCase } from "./upload-member-photo";
import { buildUploadMemberPhotoInput, fakeMemberPhotoRepository, FakeMemberPhotoRepository } from "./test-helpers";
import { domainError, err } from "@9thround/shared-kernel";

describe("UploadMemberPhotoUseCase", () => {
  it("uploads and returns the stored path and a signed URL", async () => {
    const repo = fakeMemberPhotoRepository({ path: "branch-1/x.jpg", signedUrl: "https://example.test/x.jpg" });
    const useCase = new UploadMemberPhotoUseCase(repo);

    const result = await useCase.execute(buildUploadMemberPhotoInput());

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value.signedUrl).toBe("https://example.test/x.jpg");
  });

  it("rejects empty photo data before hitting the repository", async () => {
    const repo = fakeMemberPhotoRepository();
    const useCase = new UploadMemberPhotoUseCase(repo);

    const result = await useCase.execute(buildUploadMemberPhotoInput({ data: new ArrayBuffer(0) }));

    expect(result.isErr && result.error.code).toBe("EMPTY_PHOTO");
    expect(repo.lastInput).toBeNull();
  });

  it("propagates a repository failure without transforming it", async () => {
    const repo = new FakeMemberPhotoRepository(err(domainError("PHOTO_UPLOAD_FAILED", "network error")));
    const useCase = new UploadMemberPhotoUseCase(repo);

    const result = await useCase.execute(buildUploadMemberPhotoInput());

    expect(result.isErr && result.error.code).toBe("PHOTO_UPLOAD_FAILED");
  });
});
