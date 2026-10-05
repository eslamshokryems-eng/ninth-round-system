-- THE NINTH — Phase 10 (1/2): enum values for the rowing evidence workflow.
-- Kept in its own file: a new enum value cannot be USED in the transaction that adds it, and the next migration uses both.
alter type race_ocr_status add value if not exists 'PENDING_REVIEW';   -- a judge confirmed AFTER the 0:30 transition: Master Control decides
alter type race_ocr_status add value if not exists 'REJECTED';         -- Master Control rejected a late confirmation
