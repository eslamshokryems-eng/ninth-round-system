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
  SIGN_IN_FAILED: "Incorrect Employee ID or password.",
  FULL_NAME_REQUIRED: "Enter the member's full name.",
  PHONE_REQUIRED: "Enter a mobile number.",
  RECEIPT_NUMBER_REQUIRED: "Enter the receipt number.",
  INVALID_PRICE: "Price cannot be negative.",
  INVALID_DISCOUNT: "Discount must be between 0 and the price.",
  PHONE_ALREADY_REGISTERED: "This phone number is already registered to another member.",
  RECEIPT_NUMBER_TAKEN: "This receipt number has already been used.",
  NOT_AUTHORIZED_FOR_BRANCH:
    "Your account cannot register members right now — it may be inactive, or assigned to a different branch. Check Manage Staff, or contact your Branch Manager or Super Admin.",
  DELETE_MEMBER_FAILED: "Could not delete this member. Only Branch Manager and Super Admin accounts can delete members.",
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
  INVALID_PASSWORD: "Temporary password must be at least 6 characters.",
  EMAIL_ALREADY_REGISTERED: "An account with this email already exists.",
  ACCOUNT_CREATE_FAILED: "Could not create the account. Please try again.",
  SERVER_MISCONFIGURED: "Server configuration error. Contact support.",
  UNAUTHORIZED: "Your session has expired. Please sign in again.",
  ALREADY_CLOCKED_IN: "Already clocked in — clock out first.",
  NOT_CLOCKED_IN: "Not currently clocked in.",
  INVALID_SHIFT_TIME: "Start and end time must be in HH:MM (24-hour) format.",
  INVALID_SHIFT_RANGE: "Shift end time must be after start time.",
  LEAVE_REASON_REQUIRED: "Enter a reason for the leave request.",
  INVALID_LEAVE_RANGE: "End date must be on or after the start date.",
  INVALID_LEAVE_DECISION: 'Decision must be "approved" or "rejected".',
  INVALID_SALARY_AMOUNT: "Salary cannot be negative.",
  CANNOT_DISABLE_SELF: "You cannot deactivate your own account.",
  SET_ACTIVE_STATUS_FAILED: "Could not update this account's status. Please try again.",
  AUDIT_LOG_LIST_FAILED: "Could not load the audit log. Please try again.",
  AUDIT_LOG_FETCH_FAILED: "Could not load that log entry. Please try again.",
  PERMISSION_CATALOG_FETCH_FAILED: "Could not load the permission list. Please try again.",
  ROLE_PERMISSIONS_FETCH_FAILED: "Could not load role permissions. Please try again.",
  USER_OVERRIDES_FETCH_FAILED: "Could not load account permission overrides. Please try again.",
  SET_ROLE_PERMISSION_FAILED: "Could not update that permission. Please try again.",
  SET_USER_OVERRIDE_FAILED: "Could not update that account's permission. Please try again.",
  CLEAR_USER_OVERRIDE_FAILED: "Could not clear that override. Please try again.",
  HAS_PERMISSION_CHECK_FAILED: "Could not check permissions. Please try again.",
  INVALID_QR_CODE: "No QR code was read. Try again or enter the code manually.",
  MEMBER_LOOKUP_FAILED: "Could not look up that member. Please try again.",
  LEAD_SEARCH_FAILED: "Could not search leads. Please try again.",
  LEAD_LIST_FAILED: "Could not load leads. Please try again.",
  LEAD_DETAIL_FAILED: "Could not load this lead. Please try again.",
  LEAD_NOT_FOUND: "Lead not found.",
  LEAD_CREATE_FAILED: "Could not create the lead. Please try again.",
  LEAD_UPDATE_FAILED: "Could not save the lead. Please try again.",
  LEAD_ASSIGN_FAILED: "Could not assign the lead. Please try again.",
  LEAD_MARK_LOST_FAILED: "Could not mark the lead as lost. Please try again.",
  LEAD_RESTORE_FAILED: "Could not restore the lead. Please try again.",
  LEAD_CONVERT_FAILED: "Could not convert this lead to a member. It may already be converted, or you may not have access to it.",
  LEAD_DUPLICATE_CHECK_FAILED: "Could not check for duplicate leads.",
  LEAD_TIMELINE_FAILED: "Could not load this lead's timeline.",
  LOST_REASON_REQUIRED: "Choose a reason before marking this lead as lost.",
  SALES_DASHBOARD_STATS_FAILED: "Could not load Sales Dashboard data. Please try again.",
  FOLLOWUP_LIST_FAILED: "Could not load follow-ups. Please try again.",
  FOLLOWUP_CREATE_FAILED: "Could not schedule the follow-up. Please try again.",
  FOLLOWUP_COMPLETE_FAILED: "Could not complete the follow-up. Please try again.",
  FOLLOWUP_RESCHEDULE_FAILED: "Could not reschedule the follow-up. Please try again.",
  FOLLOWUP_CANCEL_FAILED: "Could not cancel the follow-up. Please try again.",
  DUE_AT_REQUIRED: "Choose a follow-up date and time.",
  CANNOT_DELETE_SELF: "You cannot delete your own account.",
  DELETE_EMPLOYEE_FAILED: "Could not delete this employee. Only Super Admin accounts can delete employees.",
  STAFF_PRESENCE_LIST_FAILED: "Could not load the employee list. Please try again.",
  REVENUE_REPORT_FAILED: "Could not load the revenue report. Please try again.",
  MEMBERSHIPS_REPORT_FAILED: "Could not load the memberships report. Please try again.",
  SALES_REPORT_FAILED: "Could not load the sales report. Please try again.",
};

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

export function translateErrorCode(code: string): string {
  return ERROR_CODE_TO_MESSAGE[code] ?? GENERIC_MESSAGE;
}
