/**
 * An opaque, non-reversible identifier for the caller, used ONLY as a rate-limit key. The address itself is never stored, sent to the limiter backend or logged:
 * it is hashed (HMAC-SHA-256 with a server-side salt) and truncated.
 * A forwarded-address header is trusted only when the deployment says a verified proxy sets it (LEAGUE_TRUSTED_PROXY=vercel); otherwise every caller shares ONE
 * bucket — a conservative choice that cannot be bypassed by spoofing a header.
 */
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]{2,45}$/i;

export function trustedAddress(headers: Headers, trustedProxy: "vercel" | "none"): string | null {
  if (trustedProxy !== "vercel") return null;
  // Vercel overwrites these with the real client address; a value sent by the client is replaced, never appended.
  const raw = headers.get("x-vercel-forwarded-for") ?? headers.get("x-real-ip");
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim() ?? "";
  return IPV4.test(first) || (IPV6.test(first) && first.includes(":")) ? first.toLowerCase() : null;
}

export async function clientKey(headers: Headers, trustedProxy: "vercel" | "none", salt: string): Promise<string> {
  const addr = trustedAddress(headers, trustedProxy);
  if (addr === null) return "shared";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(salt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(addr)));
  return Array.from(mac.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}
