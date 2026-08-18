"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardList } from "lucide-react";

import type { CoachSlug } from "@/lib/bookingSchedule";
import { CoachSwitcher } from "@/app/admin/ui/CoachSwitcher";

export type ReminderKind =
  | "mini_note"
  | "initial_report"
  | "progress_report"
  | "parent_checkin"
  | "media"
  | "data_collection"
  | "goal_setup"
  | "goal_checkin";

export type Reminder = {
  id: string;
  kind: ReminderKind;
  anchorDate: string; // YYYY-MM-DD
  createdAt: string; // ISO timestamp, when the reminder was first raised
  playerName: string;
  parentName: string | null;
  // The app account, resolved at render. Null means no account yet, so there's
  // nowhere to file a report — those get the Done button instead of a link.
  appId: string | null;
};

const KIND_LABEL: Record<ReminderKind, string> = {
  media: "Photos & video",
  mini_note: "Session note",
  progress_report: "Progress report",
  initial_report: "Initial report",
  parent_checkin: "Parent check-in",
  data_collection: "Collect test data",
  goal_setup: "Set a period goal",
  goal_checkin: "Goal check-in",
};

const KIND_BLURB: Record<ReminderKind, string> = {
  media: "Grab 10–15s clips or a few photos at the next session.",
  mini_note: "Write a short note on how the session went.",
  progress_report: "Six sessions in — time for a progress report.",
  initial_report: "New to the program — write the baseline snapshot.",
  parent_checkin: "Two weeks since the last check-in. Ask how they're feeling.",
  data_collection: "Run the tests so the report has real numbers behind it.",
  goal_setup: "No goal running. Set a focus period with steps.",
  goal_checkin: "Two sessions on — go through the goal and their steps.",
};

// Report reminders open the coach form prefilled; data reminders open the test
// form. The other two have nowhere to go — they're done in the world.
const KIND_HREF: Partial<Record<ReminderKind, (appId: string) => string>> = {
  mini_note: (id) => `/admin/coach/add-report?player=${id}&type=blurb`,
  initial_report: (id) => `/admin/coach/add-report?player=${id}&type=baseline`,
  progress_report: (id) => `/admin/coach/add-report?player=${id}&type=progress`,
  data_collection: (id) => `/admin/coach/add-tests?player=${id}`,
  goal_setup: (id) => `/admin/coach/add-goal?player=${id}`,
};

const KIND_ORDER: ReminderKind[] = [
  "media",
  "mini_note",
  "goal_checkin",
  "goal_setup",
  "data_collection",
  "progress_report",
  "initial_report",
  "parent_checkin",
];

type CoachTab = { slug: CoachSlug; label: string; reminders: Reminder[] };

// Reminders are never removed for going stale — they escalate instead. An
// ignored task getting louder is the point; one that quietly vanishes is how
// work gets lost.
const NAG_AFTER_DAYS = 3;
const OVERDUE_AFTER_DAYS = 7;

type Urgency = { level: "calm" | "nag" | "overdue"; days: number };

function urgencyOf(createdAt: string): Urgency {
  const ms = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days >= OVERDUE_AFTER_DAYS) return { level: "overdue", days };
  if (days >= NAG_AFTER_DAYS) return { level: "nag", days };
  return { level: "calm", days };
}

const CARD_STYLE: Record<Urgency["level"], string> = {
  calm: "border-emerald-200",
  nag: "border-amber-300 bg-amber-50/40",
  overdue: "border-red-300 bg-red-50/40",
};

function UrgencyBadge({ u }: { u: Urgency }) {
  if (u.level === "calm") return null;
  const overdue = u.level === "overdue";
  return (
    <span
      className={
        overdue
          ? "inline-block rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white"
          : "inline-block rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950"
      }
    >
      {overdue
        ? `Overdue — ${u.days} days`
        : "You need to do this now"}
    </span>
  );
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function ReminderCard({ r }: { r: Reminder }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const href = r.appId ? KIND_HREF[r.kind]?.(r.appId) : undefined;
  const urgency = urgencyOf(r.createdAt);

  async function markDone() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/reminders/${r.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${CARD_STYLE[urgency.level]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold tracking-tight text-gray-900">
              {r.playerName}
            </span>
            <UrgencyBadge u={urgency} />
          </div>
          <div className="mt-0.5 text-sm text-gray-600">{KIND_BLURB[r.kind]}</div>
          {!r.appId && KIND_HREF[r.kind] && (
            <div className="mt-1 text-xs font-medium text-amber-700">
              No account yet, so this can&apos;t be filed. Create their profile and the
              link appears here.
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {href && (
            <Link
              href={href}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              {r.kind === "data_collection"
                ? "Add tests"
                : r.kind === "goal_setup"
                  ? "Set goal"
                  : "Write it"}
            </Link>
          )}
          <button
            type="button"
            onClick={markDone}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {busy ? "…" : "Done"}
          </button>
        </div>
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
        {r.parentName ? `${r.parentName} · ` : ""}
        since {fmtDate(r.anchorDate)}
        {urgency.days >= 1 ? ` · waiting ${urgency.days} day${urgency.days === 1 ? "" : "s"}` : ""}
      </div>
    </div>
  );
}

export function RemindersClient({ coaches }: { coaches: CoachTab[] }) {
  const [active, setActive] = useState<CoachSlug>(coaches[0]?.slug ?? "david");
  const current = coaches.find((c) => c.slug === active) ?? coaches[0];
  const reminders = current?.reminders ?? [];

  return (
    <div>
      <CoachSwitcher
        items={coaches.map((c) => ({
          slug: c.slug,
          label: c.label,
          count: c.reminders.length,
        }))}
        active={active}
        onChange={setActive}
      />

      {reminders.length === 0 ? (
        <div className="rounded-3xl border border-emerald-200 bg-white p-10 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-600">
            Nothing outstanding for this coach.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {KIND_ORDER.map((kind) => {
            const group = reminders.filter((r) => r.kind === kind);
            if (group.length === 0) return null;
            return (
              <section key={kind}>
                <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500">
                    {KIND_LABEL[kind]}
                  </h2>
                  <span className="text-xs text-gray-400">{group.length}</span>
                </div>
                <div className="space-y-3">
                  {group.map((r) => (
                    <ReminderCard key={r.id} r={r} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
