// The stored shape of each coaching report type. Extracted from
// AdminPlayerClient so the coach-facing form writes exactly what the player
// profile reads — a report saved with the wrong keys renders blank, which is
// worse than not saving it at all.

export type ReportType = "blurb" | "baseline" | "progress";

export const REPORT_LABEL: Record<ReportType, string> = {
  blurb: "Coach's Note",
  baseline: "Baseline Snapshot",
  progress: "Progress Report",
};

// Baseline: five free-text areas, three of which are stored as string arrays
// (one item per line).
export const BASELINE_FIELDS = [
  { key: "early_coaching_read", label: "Early Coaching Read", rows: 3, list: false },
  { key: "early_strengths", label: "Early Strengths (one per line)", rows: 3, list: true },
  { key: "early_focus_areas", label: "Early Focus Areas (one per line)", rows: 3, list: true },
  { key: "learning_notes", label: "Learning / Training Notes", rows: 2, list: false },
  { key: "starting_direction", label: "Starting Training Direction (one per line)", rows: 3, list: true },
] as const;

export const BASELINE_LIST_FIELDS = BASELINE_FIELDS.filter((f) => f.list).map((f) => f.key);

// Progress: six skill areas, each a 1–5 rating plus notes, then three summary
// paragraphs.
export const PROGRESS_SKILLS = [
  { key: "first_touch", label: "First Touch" },
  { key: "dribbling", label: "Dribbling" },
  { key: "passing", label: "Passing Technique" },
  { key: "shot_technique", label: "Shot Technique" },
  { key: "vision", label: "Vision / Recognition" },
  { key: "soccer_habits", label: "Soccer Habits" },
] as const;

export const PROGRESS_SUMMARY_FIELDS = [
  { key: "overall_strengths", label: "Overall Strengths" },
  { key: "continue_focus", label: "Where to Continue Focus" },
  { key: "long_term_goals", label: "Long-Term Goals" },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

// Turns the form's flat draft into the shape the profile expects.
export function normalizeReportContentForSave(
  type: ReportType,
  content: Record<string, unknown>
): Record<string, unknown> {
  if (type === "blurb") {
    return { text: typeof content.text === "string" ? content.text : "" };
  }

  if (type === "baseline") {
    const normalized: Record<string, unknown> = { ...content };
    for (const field of BASELINE_LIST_FIELDS) {
      normalized[field] = toStringList(content[field]);
    }
    return normalized;
  }

  const normalized: Record<string, unknown> = { ...content };
  for (const skill of PROGRESS_SKILLS) {
    const area = isRecord(content[skill.key]) ? content[skill.key] : {};
    const rating = Number((area as Record<string, unknown>).rating);
    normalized[skill.key] = {
      notes: typeof (area as Record<string, unknown>).notes === "string"
        ? (area as Record<string, unknown>).notes
        : "",
      ...(Number.isFinite(rating) && rating >= 1 && rating <= 5 ? { rating } : {}),
    };
  }
  return normalized;
}
