import "server-only";

import { sendSmsViaTwilio } from "@/lib/twilio";
import { COACH_LABELS } from "@/lib/bookingSchedule";

/** "14:30" → "2:30 PM" */
export function fmtTime(t: string) {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${ampm}`;
}

export type BookingConfirmation = {
  parent_name: string;
  player_name: string;
  phone: string | null;
  coach: string | null;
  /** "YYYY-MM-DD" */
  slot_date: string;
  /** "HH:MM" */
  slot_start: string;
};

/**
 * Text the parent that their session is on. Best-effort: a Twilio failure must
 * never roll back a session that the CRM has already created.
 */
export async function sendBookingConfirmationSms(row: BookingConfirmation): Promise<void> {
  if (!row.phone) return;

  const slotDateLabel = new Date(row.slot_date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const coachLabel = COACH_LABELS[row.coach ?? "david"] ?? "Coach David";

  await sendSmsViaTwilio(
    `✅ Hi ${row.parent_name}, your session for ${row.player_name} with ${coachLabel} on ${slotDateLabel} at ${fmtTime(row.slot_start)} is confirmed. See you then! — ${coachLabel}`,
    { to: row.phone }
  ).catch(() => {});
}
