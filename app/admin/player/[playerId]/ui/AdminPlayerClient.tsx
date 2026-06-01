"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { TEST_DEFINITIONS } from "@/lib/testDefinitions";
import { calculatePlayerBirthMeta } from "@/lib/playerAge";
import { ContentSubmissionsSection } from "./ContentSubmissionsSection";

type Player = {
  id: string;
  parent_id: string;
  name: string;
  birthdate: string | null;
  birth_year: number | null;
  team_level: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  dominant_foot: string | null;
  shirt_size: string | null;
  location: string | null;
  profile_photo_url: string | null;
  strengths: string | null;
  focus_areas: string | null;
  long_term_development_notes: string | null;
  first_touch_rating: number | null;
  first_touch_notes: string | null;
  one_v_one_ability_rating: number | null;
  one_v_one_ability_notes: string | null;
  passing_technique_rating: number | null;
  passing_technique_notes: string | null;
  shot_technique_rating: number | null;
  shot_technique_notes: string | null;
  vision_recognition_rating: number | null;
  vision_recognition_notes: string | null;
  great_soccer_habits_rating: number | null;
  great_soccer_habits_notes: string | null;
  notes_last_auto_refresh_at: string | null;
  created_at: string;
  updated_at: string;
};

type PlayerTest = {
  id: string;
  player_id: string;
  test_name: string;
  test_date: string; // YYYY-MM-DD
  scores: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type PlayerProfile = {
  id: string;
  player_id: string;
  name: string;
  computed_at: string;
  data: unknown;
  created_at: string;
  updated_at: string;
};

type CoachingReport = {
  id: string;
  player_id: string;
  type: "baseline" | "progress" | "blurb";
  title: string;
  report_date: string;
  content: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type GoalStep = {
  id: string;
  period_goal_id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  completed: boolean;
  completed_at: string | null;
  sort_order: number;
};

type PeriodGoal = {
  id: string;
  player_id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  steps: GoalStep[];
};

type PlayerVideoUpload = {
  id: string;
  player_id: string;
  video_url: string;
  description: string | null;
  status: "pending" | "reviewed";
  upload_month: string;
  coach_video_response_url: string | null;
  coach_document_response_url: string | null;
  coach_response_description: string | null;
  created_at: string;
  updated_at: string;
};

type CallRequest = {
  id: string;
  player_id: string;
  parent_id: string;
  duration_minutes: number;
  availability: string;
  notes: string | null;
  status: "pending" | "seen";
  seen_at: string | null;
  parent_email: string;
  parent_phone: string | null;
  created_at: string;
};

const BASELINE_LIST_FIELDS = [
  "early_strengths",
  "early_focus_areas",
  "starting_direction",
] as const;

const PROGRESS_SKILL_FIELDS = [
  "first_touch",
  "dribbling",
  "passing",
  "shot_technique",
  "vision",
  "soccer_habits",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function toTextareaString(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean).join("\n");
  }
  return typeof value === "string" ? value : "";
}

function editDraftContent(report: CoachingReport): Record<string, unknown> {
  const content = isRecord(report.content) ? report.content : {};
  if (report.type !== "baseline") return content;

  return {
    ...content,
    early_strengths: toTextareaString(content.early_strengths),
    early_focus_areas: toTextareaString(content.early_focus_areas),
    starting_direction: toTextareaString(content.starting_direction),
  };
}

function normalizeReportContentForSave(
  type: CoachingReport["type"],
  content: Record<string, unknown>,
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
  for (const field of PROGRESS_SKILL_FIELDS) {
    const area = isRecord(content[field]) ? content[field] : {};
    const rating = Number(area.rating);
    normalized[field] = {
      notes: typeof area.notes === "string" ? area.notes : "",
      ...(Number.isFinite(rating) && rating >= 1 && rating <= 5 ? { rating } : {}),
    };
  }
  return normalized;
}

async function api<T>(
  path: string,
  opts: RequestInit & { securityCode?: string },
): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(opts.securityCode
        ? { "x-security-code": opts.securityCode }
        : {}),
      ...(opts.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        disabled={disabled}
        className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 placeholder:text-gray-500 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 disabled:bg-gray-50"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full resize-y rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 placeholder:text-gray-500 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
      />
    </div>
  );
}

function SkillRatingRow({
  label,
  rating,
  notes,
  onRatingChange,
  onNotesChange,
}: {
  label: string;
  rating: number | null;
  notes: string | null;
  onRatingChange: (value: number | null) => void;
  onNotesChange: (value: string | null) => void;
}) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="text-sm font-semibold text-gray-900">{label}</div>
      <div className="mt-3 grid gap-3 md:grid-cols-[160px_1fr]">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Rating (1-5)
          </label>
          <select
            value={rating === null ? "" : String(rating)}
            onChange={(e) => {
              const value = e.target.value;
              onRatingChange(value ? Number(value) : null);
            }}
            className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
          >
            <option value="">No rating</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Notes
          </label>
          <textarea
            value={notes ?? ""}
            onChange={(e) => onNotesChange(e.target.value || null)}
            rows={3}
            placeholder="Coach notes..."
            className="w-full resize-y rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-500 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
          />
        </div>
      </div>
    </div>
  );
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export default function AdminPlayerClient(props: {
  params: Promise<{ playerId: string }>;
}) {
  const [isPending, startTransition] = useTransition();

  const [securityCode, setSecurityCode] = useState("");
  const [authorized, setAuthorized] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [draft, setDraft] = useState<Player | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Testing evaluations
  const [tests, setTests] = useState<PlayerTest[]>([]);

  // Period goals state
  const [periodGoals, setPeriodGoals] = useState<PeriodGoal[]>([]);
  const [newPGTitle, setNewPGTitle] = useState("");
  const [newPGDescription, setNewPGDescription] = useState("");
  const [newPGStartDate, setNewPGStartDate] = useState("");
  const [newPGEndDate, setNewPGEndDate] = useState("");
  const [pgDrafts, setPgDrafts] = useState<
    Record<string, { title: string; description: string; start_date: string; end_date: string }>
  >({});
  const [pgExpanded, setPgExpanded] = useState<Record<string, boolean>>({});
  const [newStepDrafts, setNewStepDrafts] = useState<
    Record<string, { title: string; description: string; target_date: string; sort_order: string }>
  >({});
  const [stepEditDrafts, setStepEditDrafts] = useState<
    Record<string, { title: string; description: string; target_date: string; sort_order: string }>
  >({});
  const [editingStepId, setEditingStepId] = useState<string | null>(null);

  // Coaching reports state
  const [coachingReports, setCoachingReports] = useState<CoachingReport[]>([]);
  const [crExpanded, setCrExpanded] = useState<Record<string, boolean>>({});
  const [crNewType, setCrNewType] = useState<"baseline" | "progress" | "blurb">("blurb");
  const [crNewTitle, setCrNewTitle] = useState("");
  const [crNewDate, setCrNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [crNewContent, setCrNewContent] = useState<Record<string, unknown>>({});
  const [crEditDrafts, setCrEditDrafts] = useState<
    Record<string, { title: string; report_date: string; content: Record<string, unknown> }>
  >({});
  const [testName, setTestName] = useState<string>(
    TEST_DEFINITIONS[0]?.name ?? "",
  );
  const [testDate, setTestDate] = useState<string>("");
  const [testScores, setTestScores] = useState<Record<string, string>>({});
  const [oneVOneRoundsCount, setOneVOneRoundsCount] = useState<number>(5);
  const [oneVOneRounds, setOneVOneRounds] = useState<string[]>(
    Array.from({ length: 5 }, () => ""),
  );
  const [skillMovesCount, setSkillMovesCount] = useState<number>(6);
  const [skillMovesMinCount, setSkillMovesMinCount] = useState<number>(1);
  const [skillMoves, setSkillMoves] = useState<
    Array<{ name: string; score: string }>
  >(
    Array.from({ length: 6 }, (_, i) => ({ name: `Move ${i + 1}`, score: "" })),
  );

  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);

  const [callRequests, setCallRequests] = useState<CallRequest[]>([]);

  const [contentSubmissions, setContentSubmissions] = useState<
    PlayerVideoUpload[]
  >([]);

  const computed = useMemo(
    () => calculatePlayerBirthMeta(draft?.birthdate ?? null),
    [draft?.birthdate],
  );

  useEffect(() => {
    setPlayer(null);
    setDraft(null);
    setMsg(null);
    setErrMsg(null);
    props.params.then(({ playerId }) => setPlayerId(playerId));
  }, [props.params]);

  useEffect(() => {
    if (!playerId) return;

    void (async () => {
      try {
        await loadPlayer(securityCode, playerId);
        await loadTests(securityCode, playerId);
        await loadProfiles(securityCode, playerId);
        await loadPeriodGoals(securityCode, playerId);
        await loadCoachingReports(securityCode, playerId);
        await loadContentSubmissions(securityCode, playerId);
        await loadCallRequests(securityCode, playerId);
      } catch (e) {
        setErrMsg(e instanceof Error ? e.message : "Failed to load data.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  async function verify(code: string) {
    setAuthError(null);
    await api<{ ok: true }>("/api/admin/verify", {
      method: "GET",
      securityCode: code,
    });
    setAuthorized(true);
    // Store in localStorage so child components can access it
    localStorage.setItem("adminSecurityCode", code);
  }

  async function loadPlayer(code: string, id: string) {
    const data = await api<{ player: Player }>(`/api/admin/players/${id}`, {
      method: "GET",
      securityCode: code,
    });
    setPlayer(data.player);
    setDraft(data.player);
  }

  async function loadTests(code: string, id: string) {
    const data = await api<{ tests: PlayerTest[] }>(
      `/api/admin/players/${id}/tests`,
      { method: "GET", securityCode: code },
    );
    setTests(data.tests);
  }

  async function loadProfiles(code: string, id: string) {
    const data = await api<{ profiles: PlayerProfile[] }>(
      `/api/admin/players/${id}/profiles?limit=500`,
      { method: "GET", securityCode: code },
    );
    setProfiles(data.profiles);
  }

  async function loadPeriodGoals(code: string, id: string) {
    const data = await api<{ goals: PeriodGoal[] }>(
      `/api/admin/players/${id}/period-goals`,
      { method: "GET", securityCode: code },
    );
    const list = data.goals ?? [];
    setPeriodGoals(list);
    setPgDrafts((prev) => {
      const next = { ...prev };
      for (const g of list) {
        if (!next[g.id]) {
          next[g.id] = {
            title: g.title,
            description: g.description ?? "",
            start_date: g.start_date,
            end_date: g.end_date,
          };
        }
      }
      return next;
    });
    setNewStepDrafts((prev) => {
      const next = { ...prev };
      for (const g of list) {
        if (!next[g.id]) {
          next[g.id] = { title: "", description: "", target_date: "", sort_order: "0" };
        }
      }
      return next;
    });
  }

  async function createPeriodGoal(code: string, id: string) {
    const title = newPGTitle.trim();
    if (!title) { setErrMsg("Title is required."); return; }
    if (!newPGStartDate || !newPGEndDate) { setErrMsg("Start and end dates are required."); return; }
    await api<{ goal: PeriodGoal }>(`/api/admin/players/${id}/period-goals`, {
      method: "POST",
      securityCode: code,
      body: JSON.stringify({
        title,
        description: newPGDescription.trim() || null,
        start_date: newPGStartDate,
        end_date: newPGEndDate,
      }),
    });
    setNewPGTitle("");
    setNewPGDescription("");
    setNewPGStartDate("");
    setNewPGEndDate("");
    await loadPeriodGoals(code, id);
  }

  async function savePeriodGoal(code: string, pid: string, goalId: string) {
    const d = pgDrafts[goalId];
    if (!d) return;
    const title = d.title.trim();
    if (!title) { setErrMsg("Title is required."); return; }
    await api<{ goal: PeriodGoal }>(
      `/api/admin/players/${pid}/period-goals/${goalId}`,
      {
        method: "PATCH",
        securityCode: code,
        body: JSON.stringify({
          title,
          description: d.description.trim() || null,
          start_date: d.start_date,
          end_date: d.end_date,
        }),
      },
    );
    await loadPeriodGoals(code, pid);
  }

  async function deletePeriodGoal(code: string, pid: string, goalId: string) {
    await api<Record<string, never>>(
      `/api/admin/players/${pid}/period-goals/${goalId}`,
      { method: "DELETE", securityCode: code },
    );
    await loadPeriodGoals(code, pid);
  }

  async function createStep(code: string, pid: string, goalId: string) {
    const sd = newStepDrafts[goalId];
    if (!sd) return;
    const title = sd.title.trim();
    if (!title) { setErrMsg("Step title is required."); return; }
    await api<{ step: GoalStep }>(
      `/api/admin/players/${pid}/period-goals/${goalId}/steps`,
      {
        method: "POST",
        securityCode: code,
        body: JSON.stringify({
          title,
          description: sd.description.trim() || null,
          target_date: sd.target_date || null,
          sort_order: Number(sd.sort_order) || 0,
        }),
      },
    );
    setNewStepDrafts((prev) => ({
      ...prev,
      [goalId]: { title: "", description: "", target_date: "", sort_order: "0" },
    }));
    await loadPeriodGoals(code, pid);
  }

  async function saveStep(
    code: string,
    pid: string,
    goalId: string,
    step: GoalStep,
    patch: Partial<Pick<GoalStep, "title" | "description" | "target_date" | "sort_order" | "completed">>,
  ) {
    await api<{ step: GoalStep }>(
      `/api/admin/players/${pid}/period-goals/${goalId}/steps/${step.id}`,
      {
        method: "PATCH",
        securityCode: code,
        body: JSON.stringify({
          title: patch.title ?? step.title,
          description: patch.description !== undefined ? patch.description : step.description,
          target_date: patch.target_date !== undefined ? patch.target_date : step.target_date,
          sort_order: patch.sort_order !== undefined ? patch.sort_order : step.sort_order,
          completed: patch.completed !== undefined ? patch.completed : step.completed,
        }),
      },
    );
    await loadPeriodGoals(code, pid);
  }

  async function deleteStep(code: string, pid: string, goalId: string, stepId: string) {
    await api<Record<string, never>>(
      `/api/admin/players/${pid}/period-goals/${goalId}/steps/${stepId}`,
      { method: "DELETE", securityCode: code },
    );
    await loadPeriodGoals(code, pid);
  }

  async function loadCoachingReports(code: string, id: string) {
    const data = await api<{ reports: CoachingReport[] }>(
      `/api/admin/players/${id}/coaching-reports`,
      { method: "GET", securityCode: code },
    );
    const list = data.reports ?? [];
    setCoachingReports(list);
    setCrEditDrafts((prev) => {
      const next = { ...prev };
      for (const r of list) {
        if (!next[r.id]) {
          next[r.id] = { title: r.title, report_date: r.report_date, content: editDraftContent(r) };
        }
      }
      return next;
    });
  }

  async function createCoachingReport(code: string, pid: string) {
    const title = crNewTitle.trim();
    if (!title) { setErrMsg("Title is required."); return; }
    await api<{ report: CoachingReport }>(
      `/api/admin/players/${pid}/coaching-reports`,
      {
        method: "POST",
        securityCode: code,
        body: JSON.stringify({
          type: crNewType,
          title,
          report_date: crNewDate,
          content: normalizeReportContentForSave(crNewType, crNewContent),
        }),
      },
    );
    setCrNewTitle("");
    setCrNewDate(new Date().toISOString().slice(0, 10));
    setCrNewContent({});
    await loadCoachingReports(code, pid);
  }

  async function saveCoachingReport(code: string, pid: string, reportId: string) {
    const d = crEditDrafts[reportId];
    if (!d) return;
    const title = d.title.trim();
    if (!title) { setErrMsg("Title is required."); return; }
    await api<{ report: CoachingReport }>(
      `/api/admin/players/${pid}/coaching-reports/${reportId}`,
      {
        method: "PATCH",
        securityCode: code,
        body: JSON.stringify({
          title,
          report_date: d.report_date,
          content: normalizeReportContentForSave(
            coachingReports.find((report) => report.id === reportId)?.type ?? "blurb",
            d.content,
          ),
        }),
      },
    );
    await loadCoachingReports(code, pid);
  }

  async function deleteCoachingReport(code: string, pid: string, reportId: string) {
    await api<Record<string, never>>(
      `/api/admin/players/${pid}/coaching-reports/${reportId}`,
      { method: "DELETE", securityCode: code },
    );
    await loadCoachingReports(code, pid);
  }

  async function loadCallRequests(code: string, id: string) {
    const data = await api<{ requests: CallRequest[] }>(
      `/api/admin/players/${id}/call-requests`,
      { method: "GET", securityCode: code },
    );
    setCallRequests(data.requests ?? []);
  }

  async function loadContentSubmissions(code: string, id: string) {
    const data = await api<{ uploads: PlayerVideoUpload[] }>(
      `/api/admin/players/${id}/content`,
      { method: "GET", securityCode: code },
    );
    setContentSubmissions(data.uploads ?? []);
  }

  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [editTestName, setEditTestName] = useState<string>("");
  const [editTestDate, setEditTestDate] = useState<string>("");
  const [editTestScores, setEditTestScores] = useState<Record<string, string>>(
    {},
  );
  const [editOneVOneRoundsCount, setEditOneVOneRoundsCount] =
    useState<number>(5);
  const [editOneVOneRounds, setEditOneVOneRounds] = useState<string[]>(
    Array.from({ length: 5 }, () => ""),
  );
  const [editSkillMovesCount, setEditSkillMovesCount] = useState<number>(6);
  const [editSkillMoves, setEditSkillMoves] = useState<
    Array<{ name: string; score: string }>
  >(
    Array.from({ length: 6 }, (_, i) => ({ name: `Move ${i + 1}`, score: "" })),
  );

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editProfileName, setEditProfileName] = useState<string>("");

  function clampCount(raw: string, min: number, max: number, fallback: number) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
  }

  function resizeArray<T>(arr: T[], nextLen: number, make: (i: number) => T) {
    if (nextLen <= 0) return [];
    if (arr.length === nextLen) return arr;
    if (arr.length > nextLen) return arr.slice(0, nextLen);
    return [
      ...arr,
      ...Array.from({ length: nextLen - arr.length }, (_, i) =>
        make(arr.length + i),
      ),
    ];
  }

  function beginEditTest(t: PlayerTest) {
    setEditingTestId(t.id);
    setEditTestName(t.test_name);
    setEditTestDate(t.test_date);

    const scores = (t.scores ?? {}) as Record<string, unknown>;
    if (t.test_name === "1v1") {
      const roundsRaw = (scores as { rounds?: unknown }).rounds;
      const rounds = Array.isArray(roundsRaw)
        ? roundsRaw.map((v) => (v === null || v === undefined ? "" : String(v)))
        : Object.entries(scores)
            .map(([k, v]) => {
              const m = /^onevone_round_(\d+)$/.exec(k);
              if (!m) return null;
              return [Number(m[1]), v] as const;
            })
            .filter((x): x is readonly [number, unknown] => x !== null)
            .sort((a, b) => a[0] - b[0])
            .map(([, v]) => (v === null || v === undefined ? "" : String(v)));

      const count = rounds.length ? rounds.length : 5;
      setEditOneVOneRoundsCount(count);
      setEditOneVOneRounds(resizeArray(rounds, count, () => ""));
      setEditTestScores({});
      setEditSkillMovesCount(6);
      setEditSkillMoves(
        Array.from({ length: 6 }, (_, i) => ({
          name: `Move ${i + 1}`,
          score: "",
        })),
      );
      return;
    }

    if (t.test_name === "Skill Moves") {
      const movesRaw = (scores as { moves?: unknown }).moves;
      const moves = Array.isArray(movesRaw)
        ? movesRaw.map((m) => {
            const obj = (m ?? {}) as Record<string, unknown>;
            return {
              name: String(obj.name ?? "").trim(),
              score:
                obj.score === null || obj.score === undefined
                  ? ""
                  : String(obj.score),
            };
          })
        : Object.entries(scores)
            .map(([k, v]) => {
              const m = /^skillmove_(\d+)$/.exec(k);
              if (!m) return null;
              const idx = Number(m[1]);
              const nameKey = `skillmove_name_${idx}`;
              const rawName = scores[nameKey];
              return {
                idx,
                name:
                  rawName === null || rawName === undefined
                    ? `Move ${idx}`
                    : String(rawName).trim() || `Move ${idx}`,
                score: v === null || v === undefined ? "" : String(v),
              };
            })
            .filter(
              (x): x is { idx: number; name: string; score: string } =>
                x !== null,
            )
            .sort((a, b) => a.idx - b.idx)
            .map(({ name, score }) => ({ name, score }));

      const count = moves.length ? moves.length : 6;
      setEditSkillMovesCount(count);
      setEditSkillMoves(
        resizeArray(moves, count, (i) => ({
          name: `Move ${i + 1}`,
          score: "",
        })),
      );
      setEditTestScores({});
      setEditOneVOneRoundsCount(5);
      setEditOneVOneRounds(Array.from({ length: 5 }, () => ""));
      return;
    }

    const asStrings: Record<string, string> = {};
    for (const [k, v] of Object.entries(scores)) {
      if (v === null || v === undefined) continue;
      asStrings[k] = String(v);
    }
    setEditTestScores(asStrings);
  }

  async function saveTestEdits() {
    if (!playerId || !editingTestId) return;
    setMsg(null);
    setErrMsg(null);

    if (!editTestDate) {
      setErrMsg("Test date is required.");
      return;
    }

    const scores =
      editTestName === "1v1"
        ? { rounds: editOneVOneRounds }
        : editTestName === "Skill Moves"
          ? { moves: editSkillMoves }
          : editTestScores;

    await api<{ test: PlayerTest }>(
      `/api/admin/players/${playerId}/tests/${editingTestId}`,
      {
        method: "PATCH",
        securityCode,
        body: JSON.stringify({
          test_name: editTestName,
          test_date: editTestDate,
          scores,
        }),
      },
    );
    await loadTests(securityCode, playerId);
    setEditingTestId(null);
    setMsg("Test updated.");
  }

  async function deleteTest(testId: string) {
    if (!playerId) return;
    setMsg(null);
    setErrMsg(null);
    await api<{ ok: true }>(`/api/admin/players/${playerId}/tests/${testId}`, {
      method: "DELETE",
      securityCode,
    });
    await loadTests(securityCode, playerId);
    if (editingTestId === testId) setEditingTestId(null);
    setMsg("Test deleted.");
  }

  function beginEditProfile(p: PlayerProfile) {
    setEditingProfileId(p.id);
    setEditProfileName(p.name);
  }

  async function saveProfileEdits() {
    if (!playerId || !editingProfileId) return;
    setMsg(null);
    setErrMsg(null);
    const name = editProfileName.trim();
    if (!name) {
      setErrMsg("Profile name is required.");
      return;
    }
    await api<{ profile: PlayerProfile }>(
      `/api/admin/players/${playerId}/profiles/${editingProfileId}`,
      {
        method: "PATCH",
        securityCode,
        body: JSON.stringify({ name }),
      },
    );
    await loadProfiles(securityCode, playerId);
    setEditingProfileId(null);
    setMsg("Profile updated.");
  }

  async function deleteProfile(profileId: string) {
    if (!playerId) return;
    setMsg(null);
    setErrMsg(null);
    await api<{ ok: true }>(
      `/api/admin/players/${playerId}/profiles/${profileId}`,
      { method: "DELETE", securityCode },
    );
    await loadProfiles(securityCode, playerId);
    if (editingProfileId === profileId) setEditingProfileId(null);
    setMsg("Profile deleted.");
  }

  const changed = useMemo(() => {
    if (!player || !draft) return false;
    return JSON.stringify(player) !== JSON.stringify(draft);
  }, [player, draft]);

  return (
    <div className="min-h-screen bg-emerald-50">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-emerald-50 via-white to-white" />

      <header className="relative border-b border-emerald-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Image
              src="/icon.png"
              alt="Admin"
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl"
            />
            <div>
              <div className="text-sm font-semibold text-gray-900">
                Admin • Player editor
              </div>
              <div className="text-sm text-gray-600">
                {draft?.name ?? "Player"} {playerId ? `(${playerId})` : ""}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/admin/players"
              className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300"
            >
              ← Players
            </Link>
            {authorized && playerId && (
              <Link
                href={`/admin/player/${playerId}/preview`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
                title="View as parent sees it"
              >
                <span className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                  Preview Parent View
                </span>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 py-10">
        {!authorized ? (
          <div className="mx-auto max-w-md rounded-3xl border border-emerald-200 bg-white/90 p-6 shadow-sm backdrop-blur">
            <h1 className="text-xl font-semibold text-gray-900">
              Enter security code
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Required again for this page.
            </p>

            {authError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {authError}
              </div>
            )}

            <div className="mt-6 space-y-3">
              <Field
                label="SECURITY_CODE"
                value={securityCode}
                onChange={setSecurityCode}
                type="password"
                placeholder="Enter code"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    if (!playerId) return;
                    await verify(securityCode);
                    await loadPlayer(securityCode, playerId);
                    await loadTests(securityCode, playerId);
                    await loadProfiles(securityCode, playerId);
                    await loadContentSubmissions(securityCode, playerId);
                  } catch (e) {
                    setAuthError(
                      e instanceof Error ? e.message : "Unauthorized",
                    );
                  }
                }}
                className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Enter
              </button>
            </div>
          </div>
        ) : !draft ? (
          <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
            Loading…
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <section className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm lg:col-span-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Player profile
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Edit everything here (admin).
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!playerId) return;
                      setMsg(null);
                      setErrMsg(null);
                      await loadPlayer(securityCode, playerId);
                      await loadTests(securityCode, playerId);
                      await loadProfiles(securityCode, playerId);
                      await loadContentSubmissions(securityCode, playerId);
                      setMsg("Refreshed.");
                    }}
                    disabled={isPending}
                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 disabled:opacity-60"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {(errMsg || msg) && (
                <div
                  className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
                    errMsg
                      ? "border-red-200 bg-red-50 text-red-800"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                  }`}
                >
                  {errMsg ?? msg}
                </div>
              )}

              {/* Profile Picture Display */}
              {draft.profile_photo_url && (
                <div className="mt-6 flex items-center gap-4">
                  <Image
                    src={draft.profile_photo_url}
                    alt={draft.name}
                    width={80}
                    height={80}
                    className="h-20 w-20 rounded-full object-cover border-2 border-emerald-200"
                  />
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Profile Picture</div>
                    <div className="text-xs text-gray-500 mt-1">Update URL below to change</div>
                  </div>
                </div>
              )}

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Name"
                  value={draft.name}
                  onChange={(v) => setDraft({ ...draft, name: v })}
                />
                <Field
                  label="Team / level"
                  value={draft.team_level ?? ""}
                  onChange={(v) =>
                    setDraft({ ...draft, team_level: v || null })
                  }
                />
                <Field
                  label="Birthday"
                  value={draft.birthdate ?? ""}
                  onChange={(v) => setDraft({ ...draft, birthdate: v || null })}
                  type="date"
                />
                <Field
                  label="Computed (age / birth year / age group)"
                  value={[
                    computed.age !== null ? `Age ${computed.age}` : "Age —",
                    computed.birthYear !== null
                      ? `Birth year ${computed.birthYear}`
                      : "Birth year —",
                    computed.ageGroup ?? "Age group —",
                  ].join(" • ")}
                  onChange={() => {}}
                  disabled
                />
                <Field
                  label="Primary position"
                  value={draft.primary_position ?? ""}
                  onChange={(v) =>
                    setDraft({ ...draft, primary_position: v || null })
                  }
                />
                <Field
                  label="Secondary position"
                  value={draft.secondary_position ?? ""}
                  onChange={(v) =>
                    setDraft({ ...draft, secondary_position: v || null })
                  }
                />
                <Field
                  label="Dominant foot"
                  value={draft.dominant_foot ?? ""}
                  onChange={(v) =>
                    setDraft({ ...draft, dominant_foot: v || null })
                  }
                />
                <Field
                  label="Shirt size"
                  value={draft.shirt_size ?? ""}
                  onChange={(v) =>
                    setDraft({ ...draft, shirt_size: v || null })
                  }
                  placeholder="e.g. Youth M"
                />
                <Field
                  label="Profile photo URL"
                  value={draft.profile_photo_url ?? ""}
                  onChange={(v) =>
                    setDraft({ ...draft, profile_photo_url: v || null })
                  }
                />
                <div className="sm:col-span-2">
                  <TextArea
                    label="Location"
                    value={draft.location ?? ""}
                    onChange={(v) =>
                      setDraft({ ...draft, location: v || null })
                    }
                    placeholder="City, area, or general side of town"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Doesn&apos;t have to be exact. Just enough for the coach to
                    understand travel distance.
                  </p>
                </div>
              </div>


              {/* Coaching Reports section */}
              <div className="mt-8 rounded-3xl border border-violet-200 bg-violet-50 p-5">
                <div className="mb-4">
                  <div className="text-sm font-semibold text-gray-900">Feedback &amp; Reports</div>
                  <div className="mt-1 text-sm text-gray-600">
                    Baseline snapshots, progress reports, and coach blurbs visible to the player.
                  </div>
                </div>

                {/* New report form */}
                <div className="mb-4 space-y-3 rounded-2xl border border-violet-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">New Report</div>

                  {/* Type selector */}
                  <div className="flex gap-2">
                    {(["blurb", "baseline", "progress"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setCrNewType(t); setCrNewContent({}); }}
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                          crNewType === t
                            ? "bg-violet-600 text-white"
                            : "border border-violet-200 text-violet-700 hover:bg-violet-50"
                        }`}
                      >
                        {t === "blurb" ? "Coach's Note" : t === "baseline" ? "Baseline Snapshot" : "Progress Report"}
                      </button>
                    ))}
                  </div>

                  <input
                    value={crNewTitle}
                    onChange={(e) => setCrNewTitle(e.target.value)}
                    placeholder="Title"
                    className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
                  />

                  <div>
                    <label className="mb-1 block text-xs text-gray-400">Date</label>
                    <input
                      type="date"
                      value={crNewDate}
                      onChange={(e) => setCrNewDate(e.target.value)}
                      className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
                    />
                  </div>

                  {/* Blurb fields */}
                  {crNewType === "blurb" && (
                    <textarea
                      value={(crNewContent.text as string) ?? ""}
                      onChange={(e) => setCrNewContent({ text: e.target.value })}
                      placeholder="Write your note here…"
                      rows={4}
                      className="w-full resize-y rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
                    />
                  )}

                  {/* Baseline fields */}
                  {crNewType === "baseline" && (() => {
                    const c = crNewContent as {
                      early_coaching_read?: string;
                      early_strengths?: string;
                      early_focus_areas?: string;
                      learning_notes?: string;
                      starting_direction?: string;
                    };
                    const set = (k: string, v: string) => setCrNewContent((p) => ({ ...p, [k]: v }));
                    return (
                      <div className="space-y-3">
                        {[
                          { key: "early_coaching_read", label: "Early Coaching Read", rows: 3 },
                          { key: "early_strengths", label: "Early Strengths (one per line)", rows: 3 },
                          { key: "early_focus_areas", label: "Early Focus Areas (one per line)", rows: 3 },
                          { key: "learning_notes", label: "Learning / Training Notes", rows: 2 },
                          { key: "starting_direction", label: "Starting Training Direction (one per line)", rows: 3 },
                        ].map(({ key, label, rows }) => (
                          <div key={key}>
                            <label className="mb-1 block text-xs text-gray-500">{label}</label>
                            <textarea
                              value={(c as Record<string, string>)[key] ?? ""}
                              onChange={(e) => set(key, e.target.value)}
                              rows={rows}
                              className="w-full resize-y rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Progress report fields */}
                  {crNewType === "progress" && (() => {
                    const c = crNewContent as Record<string, { rating?: string; notes?: string }>;
                    const skillKeys = [
                      { key: "first_touch", label: "First Touch" },
                      { key: "dribbling", label: "Dribbling" },
                      { key: "passing", label: "Passing Technique" },
                      { key: "shot_technique", label: "Shot Technique" },
                      { key: "vision", label: "Vision / Recognition" },
                      { key: "soccer_habits", label: "Soccer Habits" },
                    ];
                    const setText = (section: string, field: string, v: string) =>
                      setCrNewContent((p) => ({
                        ...p,
                        [section]: { ...(p[section] as Record<string, unknown> ?? {}), [field]: v },
                      }));
                    return (
                      <div className="space-y-3">
                        {skillKeys.map(({ key, label }) => (
                          <div key={key} className="rounded-xl border border-violet-100 bg-violet-50/40 p-3">
                            <div className="mb-2 text-xs font-semibold text-gray-700">{label}</div>
                            <div className="grid gap-2 sm:grid-cols-[100px_1fr]">
                              <select
                                value={c[key]?.rating ?? ""}
                                onChange={(e) => setText(key, "rating", e.target.value)}
                                className="rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-sm text-gray-800 outline-none"
                              >
                                <option value="">— Rating —</option>
                                {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
                              </select>
                              <input
                                value={c[key]?.notes ?? ""}
                                onChange={(e) => setText(key, "notes", e.target.value)}
                                placeholder="Coach notes…"
                                className="rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-sm text-gray-800 outline-none"
                              />
                            </div>
                          </div>
                        ))}
                        {[
                          { key: "overall_strengths", label: "Overall Strengths" },
                          { key: "continue_focus", label: "Where to Continue Focus" },
                          { key: "long_term_goals", label: "Long-Term Goals" },
                        ].map(({ key, label }) => (
                          <div key={key}>
                            <label className="mb-1 block text-xs text-gray-500">{label}</label>
                            <textarea
                              value={(crNewContent[key] as string) ?? ""}
                              onChange={(e) => setCrNewContent((p) => ({ ...p, [key]: e.target.value }))}
                              rows={2}
                              className="w-full resize-y rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        if (!playerId) return;
                        setMsg(null); setErrMsg(null);
                        startTransition(async () => {
                          try {
                            await createCoachingReport(securityCode, playerId);
                            setMsg("Report created.");
                          } catch (e) {
                            setErrMsg(e instanceof Error ? e.message : "Failed.");
                          }
                        });
                      }}
                      className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-70"
                    >
                      Create report
                    </button>
                  </div>
                </div>

                {/* List of existing reports */}
                {coachingReports.length === 0 ? (
                  <div className="text-sm text-gray-500">No reports yet.</div>
                ) : (
                  <div className="space-y-2">
                    {coachingReports.map((r) => {
                      const expanded = crExpanded[r.id] ?? false;
                      const d = crEditDrafts[r.id] ?? { title: r.title, report_date: r.report_date, content: r.content };
                      const typeLabel = r.type === "blurb" ? "Coach's Note" : r.type === "baseline" ? "Baseline Snapshot" : "Progress Report";
                      const typeBadge = r.type === "blurb"
                        ? "bg-blue-100 text-blue-700"
                        : r.type === "baseline"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700";

                      return (
                        <div key={r.id} className="overflow-hidden rounded-2xl border border-violet-200 bg-white">
                          <button
                            type="button"
                            onClick={() => setCrExpanded((p) => ({ ...p, [r.id]: !expanded }))}
                            className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-violet-50"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${typeBadge}`}>{typeLabel}</span>
                              <span className="text-sm font-semibold text-gray-900">{r.title}</span>
                              <span className="text-xs text-gray-400">{r.report_date}</span>
                            </div>
                            <span className="text-xs text-gray-400">{expanded ? "▲" : "▼"}</span>
                          </button>

                          {expanded && (
                            <div className="space-y-3 border-t border-violet-100 p-4">
                              <input
                                value={d.title}
                                onChange={(e) => setCrEditDrafts((p) => ({ ...p, [r.id]: { ...d, title: e.target.value } }))}
                                className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:border-violet-300"
                              />
                              <div>
                                <label className="mb-1 block text-xs text-gray-400">Date</label>
                                <input
                                  type="date"
                                  value={d.report_date}
                                  onChange={(e) => setCrEditDrafts((p) => ({ ...p, [r.id]: { ...d, report_date: e.target.value } }))}
                                  className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-violet-300"
                                />
                              </div>

                              {/* Blurb edit */}
                              {r.type === "blurb" && (
                                <textarea
                                  value={(d.content.text as string) ?? ""}
                                  onChange={(e) => setCrEditDrafts((p) => ({ ...p, [r.id]: { ...d, content: { text: e.target.value } } }))}
                                  rows={4}
                                  className="w-full resize-y rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-violet-300"
                                />
                              )}

                              {/* Baseline edit */}
                              {r.type === "baseline" && (() => {
                                const c = d.content as Record<string, string>;
                                const setField = (k: string, v: string) =>
                                  setCrEditDrafts((p) => ({ ...p, [r.id]: { ...d, content: { ...d.content, [k]: v } } }));
                                return (
                                  <div className="space-y-2">
                                    {[
                                      { key: "early_coaching_read", label: "Early Coaching Read", rows: 3 },
                                      { key: "early_strengths", label: "Early Strengths (one per line)", rows: 3 },
                                      { key: "early_focus_areas", label: "Early Focus Areas (one per line)", rows: 3 },
                                      { key: "learning_notes", label: "Learning / Training Notes", rows: 2 },
                                      { key: "starting_direction", label: "Starting Training Direction (one per line)", rows: 3 },
                                    ].map(({ key, label, rows }) => (
                                      <div key={key}>
                                        <label className="mb-0.5 block text-xs text-gray-400">{label}</label>
                                        <textarea value={c[key] ?? ""} onChange={(e) => setField(key, e.target.value)} rows={rows}
                                          className="w-full resize-y rounded-xl border border-violet-200 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-violet-300" />
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}

                              {/* Progress report edit */}
                              {r.type === "progress" && (() => {
                                const c = d.content as Record<string, unknown>;
                                const skillKeys = [
                                  { key: "first_touch", label: "First Touch" },
                                  { key: "dribbling", label: "Dribbling" },
                                  { key: "passing", label: "Passing Technique" },
                                  { key: "shot_technique", label: "Shot Technique" },
                                  { key: "vision", label: "Vision / Recognition" },
                                  { key: "soccer_habits", label: "Soccer Habits" },
                                ];
                                const setText = (section: string, field: string, v: string) =>
                                  setCrEditDrafts((p) => ({
                                    ...p,
                                    [r.id]: { ...d, content: { ...d.content, [section]: { ...(d.content[section] as Record<string, unknown> ?? {}), [field]: v } } },
                                  }));
                                return (
                                  <div className="space-y-2">
                                    {skillKeys.map(({ key, label }) => {
                                      const area = (c[key] as { rating?: string; notes?: string }) ?? {};
                                      return (
                                        <div key={key} className="rounded-xl border border-violet-100 bg-violet-50/40 p-2">
                                          <div className="mb-1 text-xs font-semibold text-gray-700">{label}</div>
                                          <div className="grid gap-2 sm:grid-cols-[100px_1fr]">
                                            <select value={area.rating ?? ""} onChange={(e) => setText(key, "rating", e.target.value)}
                                              className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none">
                                              <option value="">— Rating —</option>
                                              {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
                                            </select>
                                            <input value={area.notes ?? ""} onChange={(e) => setText(key, "notes", e.target.value)}
                                              placeholder="Notes…" className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-sm text-gray-800 outline-none" />
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {[
                                      { key: "overall_strengths", label: "Overall Strengths" },
                                      { key: "continue_focus", label: "Where to Continue Focus" },
                                      { key: "long_term_goals", label: "Long-Term Goals" },
                                    ].map(({ key, label }) => (
                                      <div key={key}>
                                        <label className="mb-0.5 block text-xs text-gray-400">{label}</label>
                                        <textarea value={(c[key] as string) ?? ""}
                                          onChange={(e) => setCrEditDrafts((p) => ({ ...p, [r.id]: { ...d, content: { ...d.content, [key]: e.target.value } } }))}
                                          rows={2} className="w-full resize-y rounded-xl border border-violet-200 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-violet-300" />
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}

                              <div className="flex gap-2">
                                <button type="button" disabled={isPending}
                                  onClick={() => {
                                    if (!playerId) return;
                                    setMsg(null); setErrMsg(null);
                                    startTransition(async () => {
                                      try {
                                        await saveCoachingReport(securityCode, playerId, r.id);
                                        setMsg("Report saved.");
                                      } catch (e) { setErrMsg(e instanceof Error ? e.message : "Failed."); }
                                    });
                                  }}
                                  className="rounded-xl border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:border-violet-300 disabled:opacity-60">
                                  Save
                                </button>
                                <button type="button" disabled={isPending}
                                  onClick={() => {
                                    if (!playerId || !window.confirm(`Delete "${r.title}"?`)) return;
                                    setMsg(null); setErrMsg(null);
                                    startTransition(async () => {
                                      try {
                                        await deleteCoachingReport(securityCode, playerId, r.id);
                                        setMsg("Deleted.");
                                      } catch (e) { setErrMsg(e instanceof Error ? e.message : "Failed."); }
                                    });
                                  }}
                                  className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:border-red-300 disabled:opacity-60">
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Period Goals section */}
              <div className="mt-8 rounded-3xl border border-blue-200 bg-blue-50 p-5">
                <div className="mb-4">
                  <div className="text-sm font-semibold text-gray-900">Period Goals</div>
                  <div className="mt-1 text-sm text-gray-600">
                    Weekly focus periods with steps. Players see these as a timeline.
                  </div>
                </div>

                {/* Create new period goal */}
                <div className="mb-4 space-y-3 rounded-2xl border border-blue-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">New Period Goal</div>
                  <input
                    value={newPGTitle}
                    onChange={(e) => setNewPGTitle(e.target.value)}
                    placeholder="Title (e.g. Weak foot dribbling)"
                    className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                  />
                  <textarea
                    value={newPGDescription}
                    onChange={(e) => setNewPGDescription(e.target.value)}
                    placeholder="Description (optional)"
                    rows={2}
                    className="w-full resize-y rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">Start date</label>
                      <input
                        type="date"
                        value={newPGStartDate}
                        onChange={(e) => setNewPGStartDate(e.target.value)}
                        className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">End date</label>
                      <input
                        type="date"
                        value={newPGEndDate}
                        onChange={(e) => setNewPGEndDate(e.target.value)}
                        className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        if (!playerId) return;
                        setMsg(null);
                        setErrMsg(null);
                        startTransition(async () => {
                          try {
                            await createPeriodGoal(securityCode, playerId);
                            setMsg("Period goal created.");
                          } catch (e) {
                            setErrMsg(e instanceof Error ? e.message : "Failed.");
                          }
                        });
                      }}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-70"
                    >
                      Create goal
                    </button>
                  </div>
                </div>

                {/* List of period goals */}
                {periodGoals.length === 0 ? (
                  <div className="text-sm text-gray-500">No period goals yet.</div>
                ) : (
                  <div className="space-y-3">
                    {periodGoals.map((g) => {
                      const d = pgDrafts[g.id] ?? {
                        title: g.title,
                        description: g.description ?? "",
                        start_date: g.start_date,
                        end_date: g.end_date,
                      };
                      const sd = newStepDrafts[g.id] ?? { title: "", description: "", target_date: "", sort_order: "0" };
                      const expanded = pgExpanded[g.id] ?? false;
                      const doneCount = g.steps.filter((s) => s.completed).length;

                      return (
                        <div key={g.id} className="overflow-hidden rounded-2xl border border-blue-200 bg-white">
                          {/* Goal header row */}
                          <button
                            type="button"
                            onClick={() => setPgExpanded((prev) => ({ ...prev, [g.id]: !expanded }))}
                            className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-blue-50"
                          >
                            <div>
                              <span className="text-sm font-semibold text-gray-900">{g.title}</span>
                              <span className="ml-2 text-xs text-gray-400">
                                {g.start_date} – {g.end_date}
                              </span>
                              {g.steps.length > 0 && (
                                <span className="ml-2 text-xs text-gray-400">
                                  · {doneCount}/{g.steps.length} steps
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-400">{expanded ? "▲" : "▼"}</span>
                          </button>

                          {expanded && (
                            <div className="border-t border-blue-100 p-4 space-y-4">
                              {/* Edit goal fields */}
                              <div className="space-y-3">
                                <input
                                  value={d.title}
                                  onChange={(e) => setPgDrafts((prev) => ({ ...prev, [g.id]: { ...d, title: e.target.value } }))}
                                  className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                                />
                                <textarea
                                  value={d.description}
                                  onChange={(e) => setPgDrafts((prev) => ({ ...prev, [g.id]: { ...d, description: e.target.value } }))}
                                  placeholder="Description (optional)"
                                  rows={2}
                                  className="w-full resize-y rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                                />
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div>
                                    <label className="mb-1 block text-xs text-gray-500">Start date</label>
                                    <input
                                      type="date"
                                      value={d.start_date}
                                      onChange={(e) => setPgDrafts((prev) => ({ ...prev, [g.id]: { ...d, start_date: e.target.value } }))}
                                      className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs text-gray-500">End date</label>
                                    <input
                                      type="date"
                                      value={d.end_date}
                                      onChange={(e) => setPgDrafts((prev) => ({ ...prev, [g.id]: { ...d, end_date: e.target.value } }))}
                                      className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() => {
                                      if (!playerId) return;
                                      setMsg(null);
                                      setErrMsg(null);
                                      startTransition(async () => {
                                        try {
                                          await savePeriodGoal(securityCode, playerId, g.id);
                                          setMsg("Saved.");
                                        } catch (e) {
                                          setErrMsg(e instanceof Error ? e.message : "Failed.");
                                        }
                                      });
                                    }}
                                    className="rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:border-blue-300 disabled:opacity-60"
                                  >
                                    Save goal
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() => {
                                      if (!playerId) return;
                                      if (!window.confirm(`Delete "${g.title}"?`)) return;
                                      setMsg(null);
                                      setErrMsg(null);
                                      startTransition(async () => {
                                        try {
                                          await deletePeriodGoal(securityCode, playerId, g.id);
                                          setMsg("Deleted.");
                                        } catch (e) {
                                          setErrMsg(e instanceof Error ? e.message : "Failed.");
                                        }
                                      });
                                    }}
                                    className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:border-red-300 disabled:opacity-60"
                                  >
                                    Delete goal
                                  </button>
                                </div>
                              </div>

                              {/* Steps */}
                              <div>
                                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Steps</div>
                                {g.steps.length === 0 ? (
                                  <div className="text-xs text-gray-400">No steps yet.</div>
                                ) : (
                                  <div className="space-y-2">
                                    {g.steps.map((step) => {
                                      const isEditing = editingStepId === step.id;
                                      const ed = stepEditDrafts[step.id] ?? {
                                        title: step.title,
                                        description: step.description ?? "",
                                        target_date: step.target_date ?? "",
                                        sort_order: String(step.sort_order),
                                      };
                                      return (
                                        <div key={step.id} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                                          {isEditing ? (
                                            <div className="space-y-2">
                                              <input
                                                value={ed.title}
                                                onChange={(e) => setStepEditDrafts((prev) => ({ ...prev, [step.id]: { ...ed, title: e.target.value } }))}
                                                className="w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-blue-300"
                                                placeholder="Step title"
                                              />
                                              <input
                                                value={ed.description}
                                                onChange={(e) => setStepEditDrafts((prev) => ({ ...prev, [step.id]: { ...ed, description: e.target.value } }))}
                                                className="w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-blue-300"
                                                placeholder="Description (optional)"
                                              />
                                              <div className="grid gap-2 sm:grid-cols-2">
                                                <div>
                                                  <label className="mb-0.5 block text-xs text-gray-400">Target date</label>
                                                  <input
                                                    type="date"
                                                    value={ed.target_date}
                                                    onChange={(e) => setStepEditDrafts((prev) => ({ ...prev, [step.id]: { ...ed, target_date: e.target.value } }))}
                                                    className="w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-blue-300"
                                                  />
                                                </div>
                                                <div>
                                                  <label className="mb-0.5 block text-xs text-gray-400">Sort order</label>
                                                  <input
                                                    type="number"
                                                    value={ed.sort_order}
                                                    onChange={(e) => setStepEditDrafts((prev) => ({ ...prev, [step.id]: { ...ed, sort_order: e.target.value } }))}
                                                    className="w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-blue-300"
                                                  />
                                                </div>
                                              </div>
                                              <div className="flex gap-2">
                                                <button
                                                  type="button"
                                                  disabled={isPending}
                                                  onClick={() => {
                                                    if (!playerId) return;
                                                    setMsg(null);
                                                    setErrMsg(null);
                                                    startTransition(async () => {
                                                      try {
                                                        await saveStep(securityCode, playerId, g.id, step, {
                                                          title: ed.title,
                                                          description: ed.description || null,
                                                          target_date: ed.target_date || null,
                                                          sort_order: Number(ed.sort_order) || 0,
                                                        });
                                                        setEditingStepId(null);
                                                        setMsg("Step saved.");
                                                      } catch (e2) {
                                                        setErrMsg(e2 instanceof Error ? e2.message : "Failed.");
                                                      }
                                                    });
                                                  }}
                                                  className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                                                >
                                                  Save
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => setEditingStepId(null)}
                                                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-500 transition hover:bg-gray-100"
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="flex items-start gap-2">
                                              <input
                                                type="checkbox"
                                                checked={step.completed}
                                                onChange={(e) => {
                                                  if (!playerId) return;
                                                  startTransition(async () => {
                                                    try {
                                                      await saveStep(securityCode, playerId, g.id, step, { completed: e.target.checked });
                                                    } catch (e2) {
                                                      setErrMsg(e2 instanceof Error ? e2.message : "Failed.");
                                                    }
                                                  });
                                                }}
                                                className="mt-1 h-3.5 w-3.5 shrink-0 accent-emerald-600"
                                              />
                                              <div className="min-w-0 flex-1">
                                                <div className={`text-sm font-medium ${step.completed ? "text-gray-400 line-through" : "text-gray-800"}`}>
                                                  {step.title}
                                                </div>
                                                {step.description && (
                                                  <div className="text-xs text-gray-400">{step.description}</div>
                                                )}
                                                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                                                  {step.target_date && <span>📅 {step.target_date}</span>}
                                                  <span>order: {step.sort_order}</span>
                                                </div>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setStepEditDrafts((prev) => ({
                                                    ...prev,
                                                    [step.id]: {
                                                      title: step.title,
                                                      description: step.description ?? "",
                                                      target_date: step.target_date ?? "",
                                                      sort_order: String(step.sort_order),
                                                    },
                                                  }));
                                                  setEditingStepId(step.id);
                                                }}
                                                className="shrink-0 rounded-lg border border-blue-100 px-2 py-1 text-xs text-blue-500 transition hover:border-blue-300"
                                              >
                                                Edit
                                              </button>
                                              <button
                                                type="button"
                                                disabled={isPending}
                                                onClick={() => {
                                                  if (!playerId) return;
                                                  if (!window.confirm(`Delete step "${step.title}"?`)) return;
                                                  startTransition(async () => {
                                                    try {
                                                      await deleteStep(securityCode, playerId, g.id, step.id);
                                                    } catch (e2) {
                                                      setErrMsg(e2 instanceof Error ? e2.message : "Failed.");
                                                    }
                                                  });
                                                }}
                                                className="shrink-0 rounded-lg border border-red-100 px-2 py-1 text-xs text-red-500 transition hover:border-red-300 disabled:opacity-60"
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Add step */}
                                <div className="mt-3 space-y-2 rounded-xl border border-dashed border-blue-200 p-3">
                                  <div className="text-xs font-semibold text-gray-500">Add step</div>
                                  <input
                                    value={sd.title}
                                    onChange={(e) => setNewStepDrafts((prev) => ({ ...prev, [g.id]: { ...sd, title: e.target.value } }))}
                                    placeholder="Step title"
                                    className="w-full rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                                  />
                                  <input
                                    value={sd.description}
                                    onChange={(e) => setNewStepDrafts((prev) => ({ ...prev, [g.id]: { ...sd, description: e.target.value } }))}
                                    placeholder="Description (optional)"
                                    className="w-full rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                                  />
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <div>
                                      <label className="mb-0.5 block text-xs text-gray-400">Target date (optional)</label>
                                      <input
                                        type="date"
                                        value={sd.target_date}
                                        onChange={(e) => setNewStepDrafts((prev) => ({ ...prev, [g.id]: { ...sd, target_date: e.target.value } }))}
                                        className="w-full rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                                      />
                                    </div>
                                    <div>
                                      <label className="mb-0.5 block text-xs text-gray-400">Sort order</label>
                                      <input
                                        type="number"
                                        value={sd.sort_order}
                                        onChange={(e) => setNewStepDrafts((prev) => ({ ...prev, [g.id]: { ...sd, sort_order: e.target.value } }))}
                                        className="w-full rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex justify-end">
                                    <button
                                      type="button"
                                      disabled={isPending}
                                      onClick={() => {
                                        if (!playerId) return;
                                        setMsg(null);
                                        setErrMsg(null);
                                        startTransition(async () => {
                                          try {
                                            await createStep(securityCode, playerId, g.id);
                                            setMsg("Step added.");
                                          } catch (e) {
                                            setErrMsg(e instanceof Error ? e.message : "Failed.");
                                          }
                                        });
                                      }}
                                      className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-70"
                                    >
                                      Add step
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Call Requests section */}
              {callRequests.length > 0 && (
                <div className="mt-8 rounded-3xl border border-indigo-200 bg-indigo-50 p-5">
                  <div className="mb-4">
                    <div className="text-sm font-semibold text-gray-900">Call Requests</div>
                    <div className="mt-1 text-sm text-gray-600">
                      Parent-requested calls for this player.
                    </div>
                  </div>
                  <div className="space-y-3">
                    {callRequests.map((cr) => (
                      <div
                        key={cr.id}
                        className="rounded-2xl border border-indigo-200 bg-white p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                cr.status === "pending"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {cr.status === "pending" ? "Pending" : "Seen"}
                            </span>
                            <span className="inline-flex rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                              {cr.duration_minutes} min
                            </span>
                          </div>
                          {cr.status === "pending" && playerId && (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => {
                                startTransition(async () => {
                                  try {
                                    await api(
                                      `/api/admin/players/${playerId}/call-requests/${cr.id}`,
                                      {
                                        method: "PATCH",
                                        securityCode,
                                        body: JSON.stringify({ status: "seen" }),
                                      }
                                    );
                                    await loadCallRequests(securityCode, playerId);
                                  } catch (e) {
                                    setErrMsg(e instanceof Error ? e.message : "Failed.");
                                  }
                                });
                              }}
                              className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
                            >
                              Mark Seen
                            </button>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-gray-700">{cr.availability}</p>
                        {cr.notes && (
                          <p className="mt-1 text-xs text-gray-500 italic">{cr.notes}</p>
                        )}
                        <div className="mt-3 flex items-center gap-3 flex-wrap">
                          <a
                            href={`mailto:${cr.parent_email}`}
                            className="text-xs font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-700"
                          >
                            {cr.parent_email}
                          </a>
                          {cr.parent_phone && (
                            <a
                              href={`tel:${cr.parent_phone}`}
                              className="text-xs font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-700"
                            >
                              {cr.parent_phone}
                            </a>
                          )}
                          <span className="text-xs text-gray-400 ml-auto">
                            {new Date(cr.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!player) return;
                    setDraft(player);
                    setMsg(null);
                    setErrMsg(null);
                  }}
                  className="rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300"
                >
                  Reset
                </button>
                <button
                  type="button"
                  disabled={!changed || isPending}
                  onClick={() => {
                    if (!draft) return;
                    setMsg(null);
                    setErrMsg(null);

                    const name = draft.name.trim();
                    if (!name) {
                      setErrMsg("Name is required.");
                      return;
                    }
                    startTransition(async () => {
                      try {
                        const data = await api<{ player: Player }>(
                          `/api/admin/players/${draft.id}`,
                          {
                            method: "PATCH",
                            securityCode,
                            body: JSON.stringify({
                              name,
                              birthdate: draft.birthdate,
                              team_level: draft.team_level,
                              primary_position: draft.primary_position,
                              secondary_position: draft.secondary_position,
                              dominant_foot: draft.dominant_foot,
                              shirt_size: draft.shirt_size,
                              location: draft.location,
                              profile_photo_url: draft.profile_photo_url,
                              strengths: draft.strengths,
                              focus_areas: draft.focus_areas,
                              long_term_development_notes:
                                draft.long_term_development_notes,
                              first_touch_rating: draft.first_touch_rating,
                              first_touch_notes: draft.first_touch_notes,
                              one_v_one_ability_rating:
                                draft.one_v_one_ability_rating,
                              one_v_one_ability_notes:
                                draft.one_v_one_ability_notes,
                              passing_technique_rating:
                                draft.passing_technique_rating,
                              passing_technique_notes:
                                draft.passing_technique_notes,
                              shot_technique_rating: draft.shot_technique_rating,
                              shot_technique_notes: draft.shot_technique_notes,
                              vision_recognition_rating:
                                draft.vision_recognition_rating,
                              vision_recognition_notes:
                                draft.vision_recognition_notes,
                              great_soccer_habits_rating:
                                draft.great_soccer_habits_rating,
                              great_soccer_habits_notes:
                                draft.great_soccer_habits_notes,
                            }),
                          },
                        );
                        setPlayer(data.player);
                        setDraft(data.player);
                        setMsg("Saved.");
                      } catch (e) {
                        setErrMsg(
                          e instanceof Error ? e.message : "Save failed.",
                        );
                      }
                    });
                  }}
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isPending ? "Saving…" : "Save changes"}
                </button>
              </div>

              <div className="mt-8">
                <ContentSubmissionsSection
                  playerId={playerId ?? ""}
                  submissions={contentSubmissions}
                  onReload={async () => {
                    if (!playerId) return;
                    await loadPlayer(securityCode, playerId);
                    await loadTests(securityCode, playerId);
                    await loadProfiles(securityCode, playerId);
                    await loadContentSubmissions(securityCode, playerId);
                  }}
                />
              </div>
            </section>

            <aside className="space-y-6">
              <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
                <div className="text-sm font-semibold text-gray-900">
                  Testing evaluations
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  Create a test entry for this player.
                </p>
                <div className="mt-5 grid gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">
                      Test
                    </label>
                    <select
                      value={testName}
                      onChange={(e) => {
                        const next = e.target.value;
                        setTestName(next);
                        setTestScores({});
                        if (next === "1v1") {
                          setOneVOneRoundsCount(5);
                          setOneVOneRounds(Array.from({ length: 5 }, () => ""));
                        }
                        if (next === "Skill Moves") {
                          // Collect ALL unique move names and their most recent scores
                          const allSkillMovesTests = tests
                            .filter((t) => t.test_name === "Skill Moves")
                            .sort((a, b) => {
                              if (a.test_date !== b.test_date) {
                                return b.test_date.localeCompare(a.test_date);
                              }
                              return b.created_at.localeCompare(a.created_at);
                            });

                          if (allSkillMovesTests.length > 0) {
                            // Build a map of move name -> most recent score
                            const moveScoresMap = new Map<string, string>();

                            // Process tests from newest to oldest, so earlier iterations set the most recent scores
                            for (const test of allSkillMovesTests) {
                              const scores = test.scores ?? {};
                              const movesRaw = (scores as { moves?: unknown })
                                .moves;

                              if (Array.isArray(movesRaw)) {
                                movesRaw.forEach((m) => {
                                  const obj = (m ?? {}) as Record<
                                    string,
                                    unknown
                                  >;
                                  const name = String(obj.name ?? "").trim();
                                  if (name && !moveScoresMap.has(name)) {
                                    // First time seeing this move (most recent)
                                    const score =
                                      obj.score === null ||
                                      obj.score === undefined
                                        ? ""
                                        : String(obj.score);
                                    moveScoresMap.set(name, score);
                                  }
                                });
                              } else {
                                // Legacy format
                                Object.entries(scores).forEach(([k, v]) => {
                                  const m = /^skillmove_name_(\d+)$/.exec(k);
                                  if (m) {
                                    const name = String(v ?? "").trim();
                                    if (name && !moveScoresMap.has(name)) {
                                      const idx = Number(m[1]);
                                      const scoreKey = `skillmove_${idx}`;
                                      const score =
                                        scores[scoreKey] === null ||
                                        scores[scoreKey] === undefined
                                          ? ""
                                          : String(scores[scoreKey]);
                                      moveScoresMap.set(name, score);
                                    }
                                  }
                                });
                              }
                            }

                            // Convert to array
                            const movesWithScores = Array.from(
                              moveScoresMap.entries(),
                            ).map(([name, score]) => ({
                              name,
                              score,
                            }));

                            const minCount = movesWithScores.length; // Can't have fewer than existing moves
                            const count = Math.max(
                              6,
                              movesWithScores.length + 2,
                            );

                            setSkillMovesMinCount(minCount);
                            setSkillMovesCount(count);
                            setSkillMoves([
                              ...movesWithScores,
                              ...Array.from(
                                { length: count - movesWithScores.length },
                                (_, i) => ({
                                  name: `Move ${movesWithScores.length + i + 1}`,
                                  score: "",
                                }),
                              ),
                            ]);
                          } else {
                            // No previous test - use default blank moves
                            setSkillMovesMinCount(1);
                            setSkillMovesCount(6);
                            setSkillMoves(
                              Array.from({ length: 6 }, (_, i) => ({
                                name: `Move ${i + 1}`,
                                score: "",
                              })),
                            );
                          }
                        }
                      }}
                      className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                    >
                      {TEST_DEFINITIONS.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Field
                    label="Test date"
                    value={testDate}
                    onChange={setTestDate}
                    type="date"
                  />

                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="text-xs font-semibold text-gray-900">
                      Scores
                    </div>
                    <div className="mt-3 grid gap-3">
                      {testName === "1v1" ? (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="text-sm text-gray-700">
                              Number of rounds
                            </div>
                            <input
                              value={String(oneVOneRoundsCount)}
                              onChange={(e) => {
                                const next = clampCount(
                                  e.target.value,
                                  1,
                                  50,
                                  5,
                                );
                                setOneVOneRoundsCount(next);
                                setOneVOneRounds((prev) =>
                                  resizeArray(prev, next, () => ""),
                                );
                              }}
                              inputMode="numeric"
                              className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                            />
                          </div>

                          {oneVOneRounds.map((v, i) => (
                            <div key={i} className="grid grid-cols-2 gap-3">
                              <div className="text-sm text-gray-700">
                                Round {i + 1} score
                              </div>
                              <input
                                value={v}
                                onChange={(e) =>
                                  setOneVOneRounds((prev) =>
                                    prev.map((x, idx) =>
                                      idx === i ? e.target.value : x,
                                    ),
                                  )
                                }
                                inputMode="decimal"
                                className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                                placeholder="—"
                              />
                            </div>
                          ))}
                        </>
                      ) : testName === "Skill Moves" ? (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="text-sm text-gray-700">
                              Number of moves
                            </div>
                            <select
                              value={String(skillMovesCount)}
                              onChange={(e) => {
                                const next = Number(e.target.value);
                                setSkillMovesCount(next);
                                setSkillMoves((prev) =>
                                  resizeArray(prev, next, (i) => ({
                                    name: `Move ${i + 1}`,
                                    score: "",
                                  })),
                                );
                              }}
                              className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                            >
                              {Array.from(
                                { length: 51 - skillMovesMinCount },
                                (_, i) => skillMovesMinCount + i,
                              ).map((num) => (
                                <option key={num} value={num}>
                                  {num}
                                </option>
                              ))}
                            </select>
                          </div>

                          {skillMoves.map((m, i) => (
                            <div key={i} className="grid gap-3 sm:grid-cols-3">
                              <input
                                value={m.name}
                                onChange={(e) =>
                                  setSkillMoves((prev) =>
                                    prev.map((x, idx) =>
                                      idx === i
                                        ? { ...x, name: e.target.value }
                                        : x,
                                    ),
                                  )
                                }
                                className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 sm:col-span-2"
                                placeholder={`Move ${i + 1} name`}
                              />
                              <input
                                value={m.score}
                                onChange={(e) =>
                                  setSkillMoves((prev) =>
                                    prev.map((x, idx) =>
                                      idx === i
                                        ? { ...x, score: e.target.value }
                                        : x,
                                    ),
                                  )
                                }
                                inputMode="decimal"
                                className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                                placeholder="Score"
                              />
                            </div>
                          ))}
                        </>
                      ) : (
                        (
                          TEST_DEFINITIONS.find((t) => t.name === testName)
                            ?.fields ?? []
                        ).map((f) => (
                          <div key={f.key} className="grid grid-cols-2 gap-3">
                            <div className="text-sm text-gray-700">
                              {f.label}
                            </div>
                            <input
                              value={testScores[f.key] ?? ""}
                              onChange={(e) =>
                                setTestScores((prev) => ({
                                  ...prev,
                                  [f.key]: e.target.value,
                                }))
                              }
                              inputMode={
                                f.type === "number" ? "decimal" : "text"
                              }
                              className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                              placeholder="—"
                            />
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (!playerId) return;
                      setMsg(null);
                      setErrMsg(null);

                      if (!testDate) {
                        setErrMsg("Test date is required.");
                        return;
                      }

                      startTransition(async () => {
                        try {
                          const scores =
                            testName === "1v1"
                              ? { rounds: oneVOneRounds }
                              : testName === "Skill Moves"
                                ? { moves: skillMoves }
                                : testScores;

                          await api<{ test: PlayerTest }>(
                            `/api/admin/players/${playerId}/tests`,
                            {
                              method: "POST",
                              securityCode,
                              body: JSON.stringify({
                                test_name: testName,
                                test_date: testDate,
                                scores,
                              }),
                            },
                          );

                          setTestScores({});
                          setOneVOneRounds(Array.from({ length: 5 }, () => ""));
                          setOneVOneRoundsCount(5);
                          setSkillMoves(
                            Array.from({ length: 6 }, (_, i) => ({
                              name: `Move ${i + 1}`,
                              score: "",
                            })),
                          );
                          setSkillMovesCount(6);
                          await loadTests(securityCode, playerId);
                          setMsg("Test saved.");
                        } catch (e) {
                          setErrMsg(
                            e instanceof Error
                              ? e.message
                              : "Failed to save test.",
                          );
                        }
                      });
                    }}
                    disabled={isPending}
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isPending ? "Saving…" : "Save test"}
                  </button>
                </div>

                <div className="mt-6 border-t border-emerald-200 pt-4">
                  <div className="text-xs font-semibold text-gray-900">
                    All tests
                  </div>
                  <div className="mt-3 grid gap-2">
                    {tests.length === 0 ? (
                      <div className="text-sm text-gray-600">No tests yet.</div>
                    ) : (
                      tests.map((t) => (
                        <div
                          key={t.id}
                          className="rounded-2xl border border-emerald-200 bg-white px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-gray-900">
                              {t.test_name}
                            </div>
                            <div className="text-sm text-gray-600">
                              {t.test_date}
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {(() => {
                              const s = (t.scores ?? {}) as Record<
                                string,
                                unknown
                              >;
                              if (
                                t.test_name === "1v1" &&
                                Array.isArray(
                                  (s as { rounds?: unknown }).rounds,
                                )
                              ) {
                                return `${
                                  (s as { rounds: unknown[] }).rounds.length
                                } rounds`;
                              }
                              if (
                                t.test_name === "Skill Moves" &&
                                Array.isArray((s as { moves?: unknown }).moves)
                              ) {
                                return `${
                                  (s as { moves: unknown[] }).moves.length
                                } moves`;
                              }
                              return `${Object.keys(s).length} fields`;
                            })()}
                          </div>
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-semibold text-emerald-700">
                              View scores
                            </summary>
                            <pre className="mt-3 max-h-56 overflow-auto rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-gray-800">
                              {JSON.stringify(t.scores ?? {}, null, 2)}
                            </pre>
                          </details>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => beginEditTest(t)}
                              className="rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Delete test "${t.test_name}" on ${t.test_date}?`,
                                  )
                                ) {
                                  startTransition(async () => {
                                    try {
                                      await deleteTest(t.id);
                                    } catch (e) {
                                      setErrMsg(
                                        e instanceof Error
                                          ? e.message
                                          : "Failed to delete test.",
                                      );
                                    }
                                  });
                                }
                              }}
                              className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:border-red-300"
                            >
                              Delete
                            </button>
                          </div>

                          {editingTestId === t.id && (
                            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                              <div className="text-xs font-semibold text-gray-900">
                                Edit test
                              </div>

                              <div className="mt-3 grid gap-3">
                                <div className="space-y-1.5">
                                  <label className="text-sm font-medium text-gray-700">
                                    Test
                                  </label>
                                  <select
                                    value={editTestName}
                                    onChange={(e) => {
                                      const next = e.target.value;
                                      setEditTestName(next);
                                      setEditTestScores({});
                                      if (next === "1v1") {
                                        setEditOneVOneRoundsCount(5);
                                        setEditOneVOneRounds(
                                          Array.from({ length: 5 }, () => ""),
                                        );
                                      }
                                      if (next === "Skill Moves") {
                                        setEditSkillMovesCount(6);
                                        setEditSkillMoves(
                                          Array.from({ length: 6 }, (_, i) => ({
                                            name: `Move ${i + 1}`,
                                            score: "",
                                          })),
                                        );
                                      }
                                    }}
                                    className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                                  >
                                    {TEST_DEFINITIONS.map((td) => (
                                      <option key={td.id} value={td.name}>
                                        {td.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <Field
                                  label="Test date"
                                  value={editTestDate}
                                  onChange={setEditTestDate}
                                  type="date"
                                />

                                <div className="rounded-2xl border border-emerald-200 bg-white p-4">
                                  <div className="text-xs font-semibold text-gray-900">
                                    Scores
                                  </div>
                                  <div className="mt-3 grid gap-3">
                                    {editTestName === "1v1" ? (
                                      <>
                                        <div className="grid grid-cols-2 gap-3">
                                          <div className="text-sm text-gray-700">
                                            Number of rounds
                                          </div>
                                          <input
                                            value={String(
                                              editOneVOneRoundsCount,
                                            )}
                                            onChange={(e) => {
                                              const next = clampCount(
                                                e.target.value,
                                                1,
                                                50,
                                                5,
                                              );
                                              setEditOneVOneRoundsCount(next);
                                              setEditOneVOneRounds((prev) =>
                                                resizeArray(
                                                  prev,
                                                  next,
                                                  () => "",
                                                ),
                                              );
                                            }}
                                            inputMode="numeric"
                                            className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                                          />
                                        </div>
                                        {editOneVOneRounds.map((v, i) => (
                                          <div
                                            key={i}
                                            className="grid grid-cols-2 gap-3"
                                          >
                                            <div className="text-sm text-gray-700">
                                              Round {i + 1} score
                                            </div>
                                            <input
                                              value={v}
                                              onChange={(e) =>
                                                setEditOneVOneRounds((prev) =>
                                                  prev.map((x, idx) =>
                                                    idx === i
                                                      ? e.target.value
                                                      : x,
                                                  ),
                                                )
                                              }
                                              inputMode="decimal"
                                              className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                                              placeholder="—"
                                            />
                                          </div>
                                        ))}
                                      </>
                                    ) : editTestName === "Skill Moves" ? (
                                      <>
                                        <div className="grid grid-cols-2 gap-3">
                                          <div className="text-sm text-gray-700">
                                            Number of moves
                                          </div>
                                          <select
                                            value={String(editSkillMovesCount)}
                                            onChange={(e) => {
                                              const next = Number(
                                                e.target.value,
                                              );
                                              setEditSkillMovesCount(next);
                                              setEditSkillMoves((prev) =>
                                                resizeArray(
                                                  prev,
                                                  next,
                                                  (i) => ({
                                                    name: `Move ${i + 1}`,
                                                    score: "",
                                                  }),
                                                ),
                                              );
                                            }}
                                            className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                                          >
                                            {Array.from(
                                              { length: 50 },
                                              (_, i) => i + 1,
                                            ).map((num) => (
                                              <option key={num} value={num}>
                                                {num}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        {editSkillMoves.map((m, i) => (
                                          <div
                                            key={i}
                                            className="grid gap-3 sm:grid-cols-3"
                                          >
                                            <input
                                              value={m.name}
                                              onChange={(e) =>
                                                setEditSkillMoves((prev) =>
                                                  prev.map((x, idx) =>
                                                    idx === i
                                                      ? {
                                                          ...x,
                                                          name: e.target.value,
                                                        }
                                                      : x,
                                                  ),
                                                )
                                              }
                                              className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 sm:col-span-2"
                                              placeholder={`Move ${i + 1} name`}
                                            />
                                            <input
                                              value={m.score}
                                              onChange={(e) =>
                                                setEditSkillMoves((prev) =>
                                                  prev.map((x, idx) =>
                                                    idx === i
                                                      ? {
                                                          ...x,
                                                          score: e.target.value,
                                                        }
                                                      : x,
                                                  ),
                                                )
                                              }
                                              inputMode="decimal"
                                              className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                                              placeholder="Score"
                                            />
                                          </div>
                                        ))}
                                      </>
                                    ) : (
                                      (
                                        TEST_DEFINITIONS.find(
                                          (td) => td.name === editTestName,
                                        )?.fields ?? []
                                      ).map((f) => (
                                        <div
                                          key={f.key}
                                          className="grid grid-cols-2 gap-3"
                                        >
                                          <div className="text-sm text-gray-700">
                                            {f.label}
                                          </div>
                                          <input
                                            value={editTestScores[f.key] ?? ""}
                                            onChange={(e) =>
                                              setEditTestScores((prev) => ({
                                                ...prev,
                                                [f.key]: e.target.value,
                                              }))
                                            }
                                            inputMode={
                                              f.type === "number"
                                                ? "decimal"
                                                : "text"
                                            }
                                            className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                                            placeholder="—"
                                          />
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-wrap justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditingTestId(null)}
                                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() => {
                                      startTransition(async () => {
                                        try {
                                          await saveTestEdits();
                                        } catch (e) {
                                          setErrMsg(
                                            e instanceof Error
                                              ? e.message
                                              : "Failed to update test.",
                                          );
                                        }
                                      });
                                    }}
                                    className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-70"
                                  >
                                    {isPending ? "Saving…" : "Save changes"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
                <div className="text-sm font-semibold text-gray-900">Meta</div>
                <div className="mt-3 space-y-2 text-sm text-gray-600">
                  <div>
                    <span className="text-gray-500">Parent ID:</span>{" "}
                    <span className="font-mono text-gray-800">
                      {draft.parent_id}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Created:</span>{" "}
                    <span className="text-gray-800">{draft.created_at}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Updated:</span>{" "}
                    <span className="text-gray-800">{draft.updated_at}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      Player profile snapshots
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      Recompute derived stats from all tests (creates a new
                      snapshot each time).
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    disabled={isPending || !playerId}
                    onClick={() => {
                      if (!playerId) return;
                      setMsg(null);
                      setErrMsg(null);
                      startTransition(async () => {
                        try {
                          await api<{ profile: PlayerProfile }>(
                            `/api/admin/players/${playerId}/profiles`,
                            {
                              method: "POST",
                              securityCode,
                              body: JSON.stringify({
                                name: `Recompute ${new Date().toLocaleString()}`,
                              }),
                            },
                          );
                          await loadProfiles(securityCode, playerId);
                          setMsg("Profile recomputed.");
                        } catch (e) {
                          setErrMsg(
                            e instanceof Error
                              ? e.message
                              : "Failed to recompute profile.",
                          );
                        }
                      });
                    }}
                    className="w-full rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isPending ? "Working…" : "Recompute stats"}
                  </button>
                </div>

                <div className="mt-5 border-t border-emerald-200 pt-4">
                  <div className="text-xs font-semibold text-gray-900">
                    All profile snapshots
                  </div>
                  <div className="mt-3 grid gap-2">
                    {profiles.length === 0 ? (
                      <div className="text-sm text-gray-600">
                        No profile snapshots yet.
                      </div>
                    ) : (
                      profiles.map((p) => (
                        <div
                          key={p.id}
                          className="rounded-2xl border border-emerald-200 bg-white px-4 py-3"
                        >
                          {editingProfileId === p.id ? (
                            <div className="space-y-3">
                              <Field
                                label="Profile name"
                                value={editProfileName}
                                onChange={setEditProfileName}
                              />

                              <div className="flex flex-wrap justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingProfileId(null)}
                                  className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => {
                                    startTransition(async () => {
                                      try {
                                        await saveProfileEdits();
                                      } catch (e) {
                                        setErrMsg(
                                          e instanceof Error
                                            ? e.message
                                            : "Failed to update profile.",
                                        );
                                      }
                                    });
                                  }}
                                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-70"
                                >
                                  {isPending ? "Saving…" : "Save changes"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start justify-between gap-3">
                                <div className="text-sm font-semibold text-gray-900">
                                  {p.name}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {new Date(p.computed_at).toLocaleString()}
                                </div>
                              </div>

                              <details className="mt-3">
                                <summary className="cursor-pointer text-xs font-semibold text-emerald-700">
                                  View data
                                </summary>
                                <pre className="mt-3 max-h-72 overflow-auto rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-gray-800">
                                  {JSON.stringify(p.data, null, 2)}
                                </pre>
                              </details>

                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => beginEditProfile(p)}
                                  className="rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300"
                                >
                                  Rename
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Delete profile snapshot "${p.name}"?`,
                                      )
                                    ) {
                                      startTransition(async () => {
                                        try {
                                          await deleteProfile(p.id);
                                        } catch (e) {
                                          setErrMsg(
                                            e instanceof Error
                                              ? e.message
                                              : "Failed to delete profile.",
                                          );
                                        }
                                      });
                                    }
                                  }}
                                  className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:border-red-300"
                                >
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-gray-700 shadow-sm">
                This page intentionally requires the security code again. We do
                not persist it across pages.
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
