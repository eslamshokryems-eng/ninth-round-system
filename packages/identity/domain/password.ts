import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";

// Length policy per docs/07-security-plan.md §7.1. The breached-password
// check against the HaveIBeenPwned range API described there is a network
// call and belongs in infrastructure (the sign-up Edge Function), not this
// pure value object — tracked in docs/phase-1/12-implementation-status.md.
const MIN_LENGTH = 10;

export class Password {
  private constructor(public readonly value: string) {}

  static create(raw: string): Result<Password> {
    if (raw.length < MIN_LENGTH) {
      return err(
        domainError("PASSWORD_TOO_SHORT", `Password must be at least ${MIN_LENGTH} characters.`),
      );
    }
    return ok(new Password(raw));
  }
}
