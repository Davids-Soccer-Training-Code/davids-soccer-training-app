// Owner-only gate for the admin area. Admin login gets you into /admin and the
// coach sections; this code gets you into the owner sections — players,
// accounts, group training, waivers, challenges, booking requests — so coaches
// can share the admin login without seeing owner data.
//
// Unlocking mints a signed cookie rather than storing the code itself. The
// cookie is `<expiresAtMs>.<hmac>`, where the HMAC covers the expiry — so it
// can't be forged in devtools and its lifetime can't be extended by editing
// it. The signing key mixes in the code itself, which means rotating the code
// in Vercel immediately revokes every outstanding unlock instead of leaving
// 12-hour sessions alive against the old code.
//
// This module is imported by middleware, so it must stay edge-safe: Web Crypto
// only, no node:crypto and no next/headers. Cookie-jar helpers live in
// lib/ownerGate.server.ts.

import type { NextRequest } from "next/server";

export const UNLOCK_COOKIE = "owner_unlock";
export const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const CODE_HEADER = "x-owner-code";

// Paths under the admin area that any logged-in admin may reach. Everything
// else beneath /admin and /api/admin is owner-only, so a new page is locked by
// default rather than open by default.
//
// The dashboard is exact-match on purpose: as a subtree it would open every
// page under /admin and the gate would only ever bite on the API.
const OPEN_EXACT = ["/admin"];
const OPEN_SUBTREES = [
  "/admin/unlock",
  "/admin/coaches",
  "/admin/coach-sessions",
  "/admin/coach-players",
  "/admin/reminders",
  "/admin/coach",
  // Coach Players links players to their full admin profile, so the profile —
  // and the APIs that page drives — are open to coaches too. This is the whole
  // per-player editing surface (goals, missions, rank, points, reports…). The
  // /admin/players *list* stays owner-only, so a coach can only reach a player
  // they already found through their own roster.
  "/admin/player",
];
const OPEN_API_SUBTREES = [
  "/api/admin/coaches",
  "/api/admin/owner-unlock",
  "/api/admin/verify",
  "/api/admin/players",
  "/api/admin/reminders",
];

function inSubtree(pathname: string, roots: string[]): boolean {
  return roots.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isOwnerPath(pathname: string): boolean {
  if (pathname.startsWith("/api/admin")) return !inSubtree(pathname, OPEN_API_SUBTREES);
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (OPEN_EXACT.includes(pathname)) return false;
    return !inSubtree(pathname, OPEN_SUBTREES);
  }
  return false;
}

// BOOKING_REQUESTS_CODE is still honoured so the gate keeps working on
// deployments that haven't set OWNER_CODE yet.
function configuredCode(): string | null {
  return process.env.OWNER_CODE || process.env.BOOKING_REQUESTS_CODE || null;
}

export function isGateConfigured(): boolean {
  return configuredCode() !== null;
}

// Constant-time compare that doesn't leak length through an early return.
function safeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  let diff = bufA.length ^ bufB.length;
  for (let i = 0; i < Math.max(bufA.length, bufB.length); i++) {
    diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }
  return diff === 0;
}

export function codeMatches(provided: string | null | undefined): boolean {
  const expected = configuredCode();
  if (!expected || !provided) return false;
  return safeEqual(provided, expected);
}

async function sign(payload: string, code: string): Promise<string> {
  // AUTH_SECRET is mixed in so a short, human-typed code still yields a
  // full-strength signing key.
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(`${process.env.AUTH_SECRET ?? ""}:${code}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function mintUnlockToken(now: number = Date.now()): Promise<string | null> {
  const code = configuredCode();
  if (!code) return null;
  const expiresAt = String(now + UNLOCK_TTL_MS);
  return `${expiresAt}.${await sign(expiresAt, code)}`;
}

export async function verifyUnlockToken(
  token: string | null | undefined,
  now: number = Date.now()
): Promise<boolean> {
  const code = configuredCode();
  if (!code || !token) return false;

  const dot = token.indexOf(".");
  if (dot <= 0) return false;

  const expiresAt = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now) return false;

  return safeEqual(mac, await sign(expiresAt, code));
}

// For middleware and API routes. Accepts the unlock cookie, or the raw code as
// a header so the endpoints stay scriptable the way the SECURITY_CODE routes
// are.
export async function requestHasOwnerAccess(req: NextRequest): Promise<boolean> {
  if (await verifyUnlockToken(req.cookies.get(UNLOCK_COOKIE)?.value)) return true;
  return codeMatches(req.headers.get(CODE_HEADER));
}

// Belt-and-braces for route handlers that middleware already covers, so the
// gate survives a matcher change.
export async function assertOwnerAccess(req: NextRequest): Promise<Response | null> {
  if (!isGateConfigured()) {
    return new Response("OWNER_CODE is not configured.", { status: 500 });
  }
  if (await requestHasOwnerAccess(req)) return null;
  return new Response("Forbidden", { status: 403 });
}
