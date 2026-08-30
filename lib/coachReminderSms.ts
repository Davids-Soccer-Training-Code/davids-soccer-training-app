import "server-only";

import { sql } from "@/db";
import { appUrl } from "@/lib/appUrl";
import { mintReminderToken } from "@/lib/reminderTokens";
import { sendSmsViaTwilio } from "@/lib/twilio";
import { KIND_LABEL, type ReminderKind } from "@/lib/coachReminders";

// One text per reminder, each saying what the job actually is. A batched digest
// of three-word lines tells a coach nothing they can act on from the lock
// screen — the whole point is that the text is the instruction.
//
// notified_at is what stops the hourly cron resending: a reminder is texted
// once, then never again, however long it stays open.

type PendingRow = {
  id: string;
  coach_slug: string;
  kind: ReminderKind;
  anchor: string;
  player_name: string;
  parent_name: string | null;
  anchor_date: string;
  app_id: string | null;
  coach_name: string | null;
  phone: string | null;
};

// What the coach is being asked to do, in their own terms.
function instruction(r: PendingRow): string {
  const player = r.player_name;
  const parent = r.parent_name ?? "their parent";

  switch (r.kind) {
    case "media":
      return `${player} trains with you within the hour. Get a few 10-15 second clips and some photos during the session — save them for their profile afterwards.`;
    case "mini_note":
      // A trial gets this text and nothing else — no photos prompt, no
      // check-in, no goal — so the text says as much rather than leaving the
      // coach waiting on the rest.
      return r.anchor.startsWith("session:first:")
        ? `You ran ${player}'s first session. Write a short note while it's fresh: what you worked on, how they did, what's next. That's all that's needed after a first session.`
        : `You trained ${player}. Write a short note while it's fresh: what you worked on, how they did, what's next.`;
    case "progress_report":
      return `${player} has hit 6 sessions. Time for a progress report — rate first touch, dribbling, passing, shot technique, vision and habits out of 5, each with notes, then overall strengths, where to keep focus, and long-term goals.`;
    case "initial_report":
      return `${player} has started properly. Write the baseline snapshot — early coaching read, early strengths, focus areas, learning notes, and the starting training direction.`;
    case "data_collection":
      return `${player} needs test data. Run the tests, save each one as you go, then hit Recompute stats at the bottom or it won't show on their profile.`;
    case "goal_setup":
      return `${player} has no goal running. Set a focus period — pick one thing to work on, give it a start and end date, and break it into steps they can tick off in the app.`;
    case "goal_checkin":
      return `Two more sessions with ${player}. Go through their period goal together — which steps are done, what's stuck, does the focus still fit?`;
    case "parent_checkin":
      return `It's been two weeks since you checked in with ${parent} about ${player}. Message them — how is ${player} feeling, has anything changed, anything they want worked on?`;
    default:
      return `${player} needs attention.`;
  }
}

// Where the work gets done. Photos and parent check-ins happen off-platform, so
// they carry no work link — only the Done link.
function workLink(r: PendingRow): { label: string; url: string } | null {
  if (!r.app_id) return null;
  switch (r.kind) {
    case "mini_note":
      return { label: "Write it", url: appUrl(`/admin/coach/add-report?player=${r.app_id}&type=blurb`) };
    case "initial_report":
      return { label: "Write it", url: appUrl(`/admin/coach/add-report?player=${r.app_id}&type=baseline`) };
    case "progress_report":
      return { label: "Write it", url: appUrl(`/admin/coach/add-report?player=${r.app_id}&type=progress`) };
    case "data_collection":
      return { label: "Add tests", url: appUrl(`/admin/coach/add-tests?player=${r.app_id}`) };
    case "goal_setup":
      return { label: "Set goal", url: appUrl(`/admin/coach/add-goal?player=${r.app_id}`) };
    default:
      return null;
  }
}

export type ReminderMessage = {
  reminderId: string;
  coachSlug: string;
  coachName: string;
  playerName: string;
  kind: ReminderKind;
  phone: string | null;
  body: string;
};

export async function buildReminderMessages(): Promise<ReminderMessage[]> {
  const rows = (await sql`
    SELECT
      cr.id,
      cr.coach_slug,
      cr.kind,
      cr.anchor,
      cr.anchor_date::text AS anchor_date,
      pl.name  AS player_name,
      par.name AS parent_name,
      app.id   AS app_id,
      st.name  AS coach_name,
      st.phone
    FROM coach_reminders cr
    JOIN crm_players pl ON pl.id = cr.crm_player_id
    LEFT JOIN crm_parents par ON par.id = pl.parent_id
    LEFT JOIN players app ON app.crm_player_id = pl.id
    LEFT JOIN crm_staff st ON st.slug = cr.coach_slug
    WHERE cr.status = 'open'
      AND cr.notified_at IS NULL
    ORDER BY cr.created_at ASC
  `) as unknown as PendingRow[];

  const messages: ReminderMessage[] = [];

  for (const r of rows) {
    const firstName = (r.coach_name ?? r.coach_slug).split(" ")[0];
    const work = workLink(r);

    const lines = [
      `${firstName} — ${KIND_LABEL[r.kind]} for ${r.player_name}`,
      "",
      instruction(r),
      "",
    ];

    if (work) {
      lines.push(`${work.label}: ${work.url}`);
    } else if (!r.app_id) {
      // No account means no form to open, and the coach should know why rather
      // than wonder where the link went.
      lines.push(`(${r.player_name} has no app account yet, so there's nothing to file against.)`);
    }

    lines.push(`Mark done: ${appUrl(`/r/${await mintReminderToken(r.id)}`)}`);

    messages.push({
      reminderId: r.id,
      coachSlug: r.coach_slug,
      coachName: r.coach_name ?? r.coach_slug,
      playerName: r.player_name,
      kind: r.kind,
      phone: r.phone,
      body: lines.join("\n").trim(),
    });
  }

  return messages;
}

export type SmsResult = {
  sent: number;
  skipped_no_phone: number;
  failed: number;
};

// Texts are off unless COACH_REMINDER_SMS is explicitly "on", so deploying this
// can't start messaging six people by surprise.
export function smsEnabled(): boolean {
  return String(process.env.COACH_REMINDER_SMS ?? "").trim().toLowerCase() === "on";
}

export async function sendCoachReminderSms(): Promise<SmsResult> {
  const messages = await buildReminderMessages();
  const result: SmsResult = { sent: 0, skipped_no_phone: 0, failed: 0 };

  for (const m of messages) {
    if (!m.phone || !m.phone.trim()) {
      result.skipped_no_phone += 1;
      continue;
    }

    try {
      await sendSmsViaTwilio(m.body, { to: m.phone });
      result.sent += 1;
    } catch {
      // A failed send leaves notified_at null, so the next run retries this one
      // rather than dropping it silently.
      result.failed += 1;
      continue;
    }

    await sql`
      UPDATE coach_reminders SET notified_at = now() WHERE id = ${m.reminderId}::uuid
    `;
  }

  return result;
}
