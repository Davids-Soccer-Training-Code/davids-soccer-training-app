import { NextRequest } from "next/server";
import { cookies } from "next/headers";

import { assertAdmin } from "@/lib/adminAuth";
import {
  UNLOCK_COOKIE,
  UNLOCK_TTL_MS,
  codeMatches,
  isGateConfigured,
  mintUnlockToken,
} from "@/lib/bookingRequestsGate";

export const dynamic = "force-dynamic";

// POST { code } — unlock the booking requests page for 12 hours.
export async function POST(req: NextRequest) {
  const err = await assertAdmin(req);
  if (err) return err;

  if (!isGateConfigured()) {
    return new Response("BOOKING_REQUESTS_CODE is not configured.", { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code : "";

  if (!codeMatches(code)) {
    // Deliberately vague: don't confirm whether a code exists or how it's wrong.
    return new Response("Incorrect code.", { status: 403 });
  }

  const token = mintUnlockToken();
  if (!token) {
    return new Response("BOOKING_REQUESTS_CODE is not configured.", { status: 500 });
  }

  const jar = await cookies();
  jar.set(UNLOCK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(UNLOCK_TTL_MS / 1000),
  });

  return new Response(null, { status: 204 });
}

// DELETE — lock the page again (the "Lock" button), without waiting out the 12 hours.
export async function DELETE(req: NextRequest) {
  const err = await assertAdmin(req);
  if (err) return err;

  const jar = await cookies();
  jar.set(UNLOCK_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return new Response(null, { status: 204 });
}
