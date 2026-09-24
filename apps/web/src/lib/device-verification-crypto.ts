import { randomBytes, randomInt, createHash, timingSafeEqual } from "node:crypto";

/** Server-only. Never imported by a client component. */

export const DEVICE_COOKIE_NAME = "td";
export const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

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
