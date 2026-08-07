/**
 * Maps a `DomainError.code` (from any @9thround/* use case) to an i18n key.
 * A screen never inspects `error.message` directly — that string is for
 * logs/debugging, not the UI (see docs/05-api-architecture.md §5.3) — and
 * never shows a code the user wouldn't recognize; unmapped codes fall back
 * to a generic message rather than leaking one.
 */
const ERROR_CODE_TO_I18N_KEY: Record<string, string> = {
  INVALID_EMAIL: "common.error.invalidEmail",
  PASSWORD_TOO_SHORT: "common.error.passwordTooShort",
  SIGN_UP_FAILED: "common.error.generic",
  SIGN_IN_FAILED: "common.error.invalidCredentials",
  PASSWORD_RESET_FAILED: "common.error.generic",
  INVALID_AGE: "common.error.invalidAge",
  INVALID_HEIGHT: "common.error.invalidHeight",
  INVALID_WEIGHT: "common.error.invalidWeight",
  FULL_NAME_REQUIRED: "reception.membership.error.fullNameRequired",
  PHONE_REQUIRED: "reception.membership.error.phoneRequired",
  RECEIPT_NUMBER_REQUIRED: "reception.membership.error.receiptNumberRequired",
  INVALID_PRICE: "reception.membership.error.invalidPrice",
  INVALID_DISCOUNT: "reception.membership.error.invalidDiscount",
  PHONE_ALREADY_REGISTERED: "reception.membership.error.phoneAlreadyRegistered",
  RECEIPT_NUMBER_TAKEN: "reception.membership.error.receiptNumberTaken",
  MEMBER_NOT_FOUND: "reception.membership.error.memberNotFound",
  NO_ACTIVE_MEMBERSHIP: "reception.membership.error.noActiveMembership",
  EMPTY_PHOTO: "reception.membership.error.emptyPhoto",
  PHOTO_UPLOAD_FAILED: "reception.membership.error.photoUploadFailed",
};

export function translateErrorCode(code: string): string {
  return ERROR_CODE_TO_I18N_KEY[code] ?? "common.error.generic";
}
