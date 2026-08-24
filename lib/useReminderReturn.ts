"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

// The trip home from a coach form that was opened off a reminder.
//
// Both the report form and the goal form need the same three steps on save, and
// getting one of them subtly wrong is exactly the kind of drift that leaves a
// coach staring at a task they just finished — so they share this.
//
// The save routes already close whatever the new report or goal satisfied. The
// PATCH here is a backstop for the case the rules can't see: a coach who
// backdates a note to before the reminder's anchor date has plainly done the
// work, but the date comparison won't match, and the reminder would sit there
// getting louder. Closing it by id takes them at their word.
//
// Returns null when there's no reminder to go back to — the form was opened
// directly — and the caller keeps its own saved-panel behavior.
export type ReminderReturn = {
  reminderId: string;
  coach: string;
  finish: () => Promise<void>;
};

export function useReminderReturn(
  reminderId: string | null,
  coach: string | null
): ReminderReturn | null {
  const router = useRouter();

  const finish = useCallback(async () => {
    if (!reminderId) return;
    // A failure here is not worth blocking the trip home over: the work is
    // saved, and the hourly sweep closes the reminder on the usual rules.
    try {
      await fetch(`/api/admin/reminders/${reminderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
    } catch {
      // Ignored on purpose — see above.
    }
    const back = coach
      ? `/admin/reminders?coach=${encodeURIComponent(coach)}`
      : "/admin/reminders";
    router.push(back);
    router.refresh();
  }, [reminderId, coach, router]);

  if (!reminderId) return null;
  return { reminderId, coach: coach ?? "", finish };
}
