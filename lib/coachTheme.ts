// Accent styling for coaches who need to stand apart from Coach David's green
// in the combined "All" view (and on the admin dashboard). Coach David has no
// entry — he uses the app's default emerald and is never tagged.
//
// Class strings are written out in full (never built by concatenation) so
// Tailwind's scanner keeps every utility used here.

export type CoachAccent = {
  tag: string; // "(Coach Simon)" — shown next to a slot in the "All" view
  tagText: string; // tag text color when the slot is not selected
  publicBtn: string; // a public, available slot button
  publicBtnSelected: string;
  adminWrap: string; // wrapper around an admin available slot
  adminBtn: string;
  adminBtnSelected: string;
  hoursCard: string; // an hours pill in the "All" view
  hoursCoachName: string; // coach-name label inside an hours pill
  badge: string; // coach badge on an admin request card
  formText: string; // date line inside the public booking form
  banner: string; // "heads up" banner shown in the coach's own tab
};

export const COACH_ACCENT: Record<string, CoachAccent> = {
  simon: {
    tag: "(Coach Simon)",
    tagText: "text-sky-700",
    publicBtn:
      "rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:border-sky-400 hover:bg-sky-100",
    publicBtnSelected:
      "rounded-xl border border-sky-600 bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow",
    adminWrap: "flex items-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-2 py-1.5",
    adminBtn: "text-xs font-semibold text-sky-700 hover:underline",
    adminBtnSelected: "text-xs font-semibold text-sky-900 underline",
    hoursCard: "rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm",
    hoursCoachName: "mr-2 font-semibold text-sky-700",
    badge: "rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700",
    formText: "mt-0.5 text-sm font-medium text-sky-700",
    banner: "mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900",
  },
  simpson: {
    tag: "(Coach Simpson)",
    tagText: "text-violet-700",
    publicBtn:
      "rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:border-violet-400 hover:bg-violet-100",
    publicBtnSelected:
      "rounded-xl border border-violet-600 bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow",
    adminWrap: "flex items-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-2 py-1.5",
    adminBtn: "text-xs font-semibold text-violet-700 hover:underline",
    adminBtnSelected: "text-xs font-semibold text-violet-900 underline",
    hoursCard: "rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm",
    hoursCoachName: "mr-2 font-semibold text-violet-700",
    badge: "rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700",
    formText: "mt-0.5 text-sm font-medium text-violet-700",
    banner: "mb-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900",
  },
  girish: {
    tag: "(Coach Girish)",
    tagText: "text-rose-700",
    publicBtn:
      "rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-400 hover:bg-rose-100",
    publicBtnSelected:
      "rounded-xl border border-rose-600 bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow",
    adminWrap: "flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2 py-1.5",
    adminBtn: "text-xs font-semibold text-rose-700 hover:underline",
    adminBtnSelected: "text-xs font-semibold text-rose-900 underline",
    hoursCard: "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm",
    hoursCoachName: "mr-2 font-semibold text-rose-700",
    badge: "rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700",
    formText: "mt-0.5 text-sm font-medium text-rose-700",
    banner: "mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900",
  },
};

// Accent for a coach in a given view. Only non-David coaches, and only in the
// combined "All" view, get an accent; everything else renders in the default
// green with no tag.
export function accentFor(coach: string, isAll: boolean): CoachAccent | null {
  if (!isAll || coach === "david") return null;
  return COACH_ACCENT[coach] ?? null;
}

// The default (emerald) badge used for Coach David on the admin dashboard.
export const DAVID_BADGE =
  "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700";
