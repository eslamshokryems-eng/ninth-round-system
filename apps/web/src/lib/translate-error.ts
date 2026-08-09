/**
 * Maps a `DomainError.code` (from any @9thround/* use case) to a
 * user-facing message. Mirrors apps/mobile/src/lib/translate-error.ts's
 * error-code list, but returns plain English strings directly rather than
 * i18n keys — this app is English-only for its first pass (an internal,
 * Windows-desktop-only staff tool; bilingual support is a documented
 * follow-up, not dropped functionality — see README). A screen never
 * inspects `error.message` directly; unmapped codes fall back to a
 * generic message rather than leaking one.
 */
const ERROR_CODE_TO_MESSAGE: Record<string, string> = {
  INVALID_EMAIL: "Enter a valid email address.",
  SIGN_IN_FAILED: "Incorrect email or password.",
  FULL_NAME_REQUIRED: "Enter the member's full name.",
  PHONE_REQUIRED: "Enter a mobile number.",
  RECEIPT_NUMBER_REQUIRED: "Enter the receipt number.",
  INVALID_PRICE: "Price cannot be negative.",
  INVALID_DISCOUNT: "Discount must be between 0 and the price.",
  PHONE_ALREADY_REGISTERED: "This phone number is already registered to another member.",
  RECEIPT_NUMBER_TAKEN: "This receipt number has already been used.",
  MEMBER_NOT_FOUND: "Member not found.",
  NO_ACTIVE_MEMBERSHIP: "This member has no active membership.",
  EMPTY_PHOTO: "The selected photo could not be read. Please try again.",
  PHOTO_UPLOAD_FAILED: "Could not upload the photo. Please try again.",
  INVALID_AMOUNT: "Amount must be greater than zero.",
  ITEM_NAME_REQUIRED: "Enter the item name.",
  INVALID_QUANTITY: "Quantity must be at least 1.",
  PROFILE_SEARCH_FAILED: "Could not search accounts. Please try again.",
  ACTOR_NOT_FOUND: "Your account could not be verified. Please sign in again.",
  TARGET_NOT_FOUND: "That account could not be found.",
  FORBIDDEN_ROLE_ASSIGNMENT: "Your account is not permitted to assign that role.",
};

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

export function translateErrorCode(code: string): string {
  return ERROR_CODE_TO_MESSAGE[code] ?? GENERIC_MESSAGE;
}
