"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type BaselineContent = {
  early_coaching_read?: string;
  early_strengths?: string[] | string;
  early_focus_areas?: string[] | string;
  learning_notes?: string;
  starting_direction?: string[] | string;
};

type ProgressContent = {
  first_touch?: { rating?: number; notes?: string };
  dribbling?: { rating?: number; notes?: string };
  passing?: { rating?: number; notes?: string };
  shot_technique?: { rating?: number; notes?: string };
  vision?: { rating?: number; notes?: string };
  soccer_habits?: { rating?: number; notes?: string };
  overall_strengths?: string;
  continue_focus?: string;
  long_term_goals?: string;
};

type BlurbContent = {
  text?: string;
};

type CoachingReport = {
  id: string;
  type: "baseline" | "progress" | "blurb";
  title: string;
  report_date: string;
  content: BaselineContent | ProgressContent | BlurbContent;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_META = {
  baseline: {
    label: "Baseline Snapshot",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-800",
    headerBg: "bg-amber-600",
    borderColor: "border-amber-300",
    outerBg: "bg-amber-50",
    dot: "bg-amber-400",
  },
  progress: {
    label: "Progress Report",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-800",
    headerBg: "bg-emerald-600",
    borderColor: "border-emerald-300",
    outerBg: "bg-emerald-50",
    dot: "bg-emerald-400",
  },
  blurb: {
    label: "Coach's Note",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-800",
    headerBg: "bg-blue-500",
    borderColor: "border-blue-200",
    outerBg: "bg-blue-50",
    dot: "bg-blue-400",
  },
};

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function RatingDots({ rating }: { rating?: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <div
          key={n}
          className={`h-2.5 w-2.5 rounded-full ${
            rating && n <= rating ? "bg-emerald-500" : "bg-gray-200"
          }`}
        />
      ))}
      {rating && (
        <span className="ml-1 text-xs font-semibold text-gray-600">{rating}/5</span>
      )}
    </div>
  );
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

// ─── Content renderers ───────────────────────────────────────────────────────

function BaselineBody({ content }: { content: BaselineContent }) {
  const earlyCoachingRead = toText(content.early_coaching_read);
  const learningNotes = toText(content.learning_notes);
  const earlyStrengths = toStringList(content.early_strengths);
  const earlyFocusAreas = toStringList(content.early_focus_areas);
  const startingDirection = toStringList(content.starting_direction);

  const bullets = (items: string[]) =>
    items.map((s, i) => (
      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
        {s}
      </li>
    ));

  return (
    <div className="space-y-5">
      {earlyCoachingRead && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Early Coaching Read
          </div>
          <p className="text-sm leading-relaxed text-gray-700">{earlyCoachingRead}</p>
        </div>
      )}
      {earlyStrengths.length ? (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Early Strengths
          </div>
          <ul className="space-y-1.5">{bullets(earlyStrengths)}</ul>
        </div>
      ) : null}
      {earlyFocusAreas.length ? (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Early Focus Areas
          </div>
          <ul className="space-y-1.5">{bullets(earlyFocusAreas)}</ul>
        </div>
      ) : null}
      {learningNotes && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Learning & Training Notes
          </div>
          <p className="text-sm leading-relaxed text-gray-700">{learningNotes}</p>
        </div>
      )}
      {startingDirection.length ? (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Starting Training Direction
          </div>
          <ul className="space-y-1.5">{bullets(startingDirection)}</ul>
        </div>
      ) : null}
    </div>
  );
}

const SKILL_LABELS: Record<string, string> = {
  first_touch: "First Touch",
  dribbling: "Dribbling",
  passing: "Passing Technique",
  shot_technique: "Shot Technique",
  vision: "Vision / Recognition",
  soccer_habits: "Soccer Habits",
};

function ProgressBody({ content }: { content: ProgressContent }) {
  const skillKeys = Object.keys(SKILL_LABELS) as (keyof typeof SKILL_LABELS)[];
  const hasSkills = skillKeys.some(
    (k) => (content as Record<string, { rating?: number; notes?: string }>)[k]?.rating,
  );

  return (
    <div className="space-y-6">
      {hasSkills && (
        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Skill Ratings
          </div>
          <div className="space-y-3">
            {skillKeys.map((key) => {
              const area = (content as Record<string, { rating?: number; notes?: string }>)[key];
              if (!area?.rating && !area?.notes) return null;
              return (
                <div key={key} className="rounded-xl border border-gray-100 bg-white px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-800">
                      {SKILL_LABELS[key]}
                    </span>
                    <RatingDots rating={area.rating} />
                  </div>
                  {toText(area.notes) && (
                    <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{toText(area.notes)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {toText(content.overall_strengths) && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Overall Strengths
          </div>
          <p className="text-sm leading-relaxed text-gray-700">{toText(content.overall_strengths)}</p>
        </div>
      )}
      {toText(content.continue_focus) && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Where to Continue Focus
          </div>
          <p className="text-sm leading-relaxed text-gray-700">{toText(content.continue_focus)}</p>
        </div>
      )}
      {toText(content.long_term_goals) && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Long-Term Goals
          </div>
          <p className="text-sm leading-relaxed text-gray-700">{toText(content.long_term_goals)}</p>
        </div>
      )}
    </div>
  );
}

function BlurbBody({ content }: { content: BlurbContent }) {
  return (
    <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-line">
      {toText(content.text)}
    </p>
  );
}

// ─── Report card ─────────────────────────────────────────────────────────────

function ReportCard({ report }: { report: CoachingReport }) {
  const [open, setOpen] = useState(false);
  const meta = TYPE_META[report.type];

  return (
    <div
      className={`overflow-hidden rounded-2xl border ${meta.borderColor} ${meta.outerBg} shadow-sm transition-shadow hover:shadow-md`}
    >
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        {/* Colored dot */}
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${meta.badgeBg} ${meta.badgeText}`}
            >
              {meta.label}
            </span>
            <span className="text-xs text-gray-400">{formatDate(report.report_date)}</span>
          </div>
          <div className="mt-0.5 text-sm font-semibold text-gray-900">{report.title}</div>
        </div>

        <div className="shrink-0 text-gray-400">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* Expandable body */}
      {open && (
        <div className="border-t border-white/60 bg-white/70 px-5 py-5">
          {report.type === "baseline" && (
            <BaselineBody content={asObject(report.content) as BaselineContent} />
          )}
          {report.type === "progress" && (
            <ProgressBody content={asObject(report.content) as ProgressContent} />
          )}
          {report.type === "blurb" && (
            <BlurbBody content={asObject(report.content) as BlurbContent} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PlayerCoachingReports({ playerId }: { playerId: string }) {
  const [reports, setReports] = useState<CoachingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/players/${playerId}/coaching-reports`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((data: { reports?: CoachingReport[] }) =>
        setReports(Array.isArray(data.reports) ? data.reports : []),
      )
      .catch(() => setError("Failed to load reports."))
      .finally(() => setLoading(false));
  }, [playerId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-400">
        Loading reports…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white px-6 py-12 text-center shadow-sm">
        <div className="text-4xl">📋</div>
        <p className="mt-3 text-sm font-medium text-gray-600">No reports yet</p>
        <p className="mt-1 text-xs text-gray-400">
          Coach David will add your first report after your initial session.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <ReportCard key={r.id} report={r} />
      ))}
    </div>
  );
}
