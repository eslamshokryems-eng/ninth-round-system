import { randomBytes, randomInt, createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Server-only. Never imported by a client component. */

export const DEVICE_COOKIE_NAME = "td";
export const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * Shown to the administrator in the email. The ENFORCED limits (TTL, attempts
 * per code, cooldown, codes per hour/day, failure lockout) live in the
 * database — device_verification_limits() in 20261116000001 — so they cannot
 * be loosened, or raced past, from here. Keep this in step with that function.
 */
export const OTP_TTL_MS = 5 * 60 * 1000;

/** 6-digit OTP, generated with a CSPRNG (never Math.random). */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Raw trusted-device token — the only copy of this value lives in the caller's HttpOnly cookie. */
export function generateDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

/** Both OTPs and device tokens are stored only as this hash, never in plaintext. */
export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Constant-time comparison of two hashes, so a failed OTP/device check can't be timed to leak the stored hash. */
export function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** The pepper must be long enough to be a real secret, not a placeholder. */
const MIN_PEPPER_LENGTH = 32;

export class DeviceVerificationMisconfiguredError extends Error {
  constructor() {
    super("DEVICE_VERIFICATION_PEPPER is missing or shorter than 32 characters.");
    this.name = "DeviceVerificationMisconfiguredError";
  }
}

/** True when the server has a usable pepper. Routes check this FIRST and fail closed. */
export function hasDeviceCodePepper(): boolean {
  return (process.env.DEVICE_VERIFICATION_PEPPER ?? "").length >= MIN_PEPPER_LENGTH;
}

/**
 * Keyed hash of a verification code: HMAC-SHA256(pepper, user : codeId : code).
 *
 * A bare SHA-256 over six digits can be reversed by trying all 10^6 candidates
 * in milliseconds, so anyone who could read device_verification_codes (a
 * backup, a replica, a leaked service-role key) could recover a live code. The
 * pepper lives only in the server's environment, never in the database, so the
 * table alone is no longer enough. Binding the user and the code's own id means
 * a hash cannot be replayed against another user's code or another issue of
 * the same digits.
 *
 * Fails closed: with no usable pepper this THROWS rather than silently falling
 * back to an unkeyed hash, so a misconfigured deployment cannot quietly weaken
 * the scheme.
 */
export function hashDeviceCode(userId: string, codeId: string, code: string): string {
  const pepper = process.env.DEVICE_VERIFICATION_PEPPER ?? "";
  if (pepper.length < MIN_PEPPER_LENGTH) throw new DeviceVerificationMisconfiguredError();
  return createHmac("sha256", pepper).update(`${userId}:${codeId}:${code}`).digest("hex");
}
