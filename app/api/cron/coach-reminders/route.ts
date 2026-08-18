import { NextRequest } from "next/server";

import { syncCoachReminders } from "@/lib/coachReminders";
import {
  buildReminderMessages,
  sendCoachReminderSms,
  smsEnabled,
} from "@/lib/coachReminderSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same auth shape as the birthday job: Vercel Cron sends the secret as a
// bearer token.
function isAuthorized(req: NextRequest): boolean {
  const secret = String(process.env.CRON_SECRET ?? "").trim();
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await syncCoachReminders();

  // ?dry=1 renders the texts that would go out, without sending them or
  // marking anything notified. For checking wording and links safely.
  if (req.nextUrl.searchParams.get("dry") === "1") {
    const messages = await buildReminderMessages();
    return Response.json({
      ok: true,
      ...result,
      sms: { dry_run: true, enabled: smsEnabled(), messages },
    });
  }

  const sms = smsEnabled()
    ? await sendCoachReminderSms()
    : { skipped: "COACH_REMINDER_SMS is not 'on'" };

  return Response.json({ ok: true, ...result, sms });
}
