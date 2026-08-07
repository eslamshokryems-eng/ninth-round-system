export interface UploadMemberPhotoInput {
  branchId: string;
  /** Already-read file bytes — reading the local file URI into memory is a platform (mobile) concern, kept out of this package. */
  data: ArrayBuffer;
  contentType: string;
  fileExtension: string;
}

export interface UploadMemberPhotoOutput {
  path: string;
  signedUrl: string;
}
