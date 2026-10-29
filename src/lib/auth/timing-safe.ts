import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison to prevent timing attacks on secrets and tokens.
 * Even when lengths differ, a comparison against a dummy buffer is performed to maintain
 * constant execution time.
 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
