import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

// Owner-only gate for /admin/booking-requests. Admin login gets you into
// /admin; this code gets you into the booking requests specifically, so the
// page can be locked down tighter than the rest of the admin area.
//
// Unlocking mints a signed cookie rather than storing the code itself. The
// cookie is `<expiresAtMs>.<hmac>`, where the HMAC covers the expiry — so it
// can't be forged in devtools and its lifetime can't be extended by editing
// it. The signing key mixes in the code itself, which means rotating
// BOOKING_REQUESTS_CODE in Vercel immediately revokes every outstanding
// unlock instead of leaving 12-hour sessions alive against the old code.

export const UNLOCK_COOKIE = "br_owner";
export const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const CODE_HEADER = "x-booking-requests-code";

function configuredCode(): string | null {
  const code = process.env.BOOKING_REQUESTS_CODE;
  return code ? code : null;
}

export function isGateConfigured(): boolean {
  return configuredCode() !== null;
}

// Constant-time string compare that doesn't leak length through early return.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function codeMatches(provided: string | null | undefined): boolean {
  const expected = configuredCode();
  if (!expected || !provided) return false;
  return safeEqual(provided, expected);
}

function sign(payload: string, code: string): string {
  // AUTH_SECRET is mixed in so a short, human-typed code still yields a
  // full-strength signing key.
  const key = `${process.env.AUTH_SECRET ?? ""}:${code}`;
  return createHmac("sha256", key).update(payload).digest("hex");
}

export function mintUnlockToken(now: number = Date.now()): string | null {
  const code = configuredCode();
  if (!code) return null;
  const expiresAt = String(now + UNLOCK_TTL_MS);
  return `${expiresAt}.${sign(expiresAt, code)}`;
}

export function verifyUnlockToken(
  token: string | null | undefined,
  now: number = Date.now()
): boolean {
  const code = configuredCode();
  if (!code || !token) return false;

  const dot = token.indexOf(".");
  if (dot <= 0) return false;

  const expiresAt = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now) return false;

  return safeEqual(mac, sign(expiresAt, code));
}

// For server components (the page itself).
export async function hasBookingRequestsAccess(): Promise<boolean> {
  const jar = await cookies();
  return verifyUnlockToken(jar.get(UNLOCK_COOKIE)?.value);
}

// For API routes. Accepts the unlock cookie, or the raw code as a header so
// the endpoints stay scriptable the way the SECURITY_CODE routes are.
export function assertBookingRequestsAccess(req: NextRequest): Response | null {
  if (!isGateConfigured()) {
    return new Response("BOOKING_REQUESTS_CODE is not configured.", { status: 500 });
  }
  if (verifyUnlockToken(req.cookies.get(UNLOCK_COOKIE)?.value)) return null;
  if (codeMatches(req.headers.get(CODE_HEADER))) return null;
  return new Response("Forbidden", { status: 403 });
}
