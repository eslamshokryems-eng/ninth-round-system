import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";

// Deliberately simple (not the full RFC 5322 grammar) — good enough to
// reject obvious typos at the domain boundary; Supabase Auth is still the
// final authority on deliverability via its own verification email.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A value object so "is this a well-formed email" is answered once, not re-checked per screen. */
export class Email {
  private constructor(public readonly value: string) {}

  static create(raw: string): Result<Email> {
    const trimmed = raw.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(trimmed)) {
      return err(domainError("INVALID_EMAIL", "Enter a valid email address."));
    }
    return ok(new Email(trimmed));
  }
}
