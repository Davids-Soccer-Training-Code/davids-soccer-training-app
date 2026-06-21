export type PlayerVideoMode = "recommendations" | "browse" | "continue" | "pinned";

export type PlayerTabType =
  | "rank"
  | "tests"
  | "goals"
  | "reports"
  | "uploads"
  | "dashboard"
  | "settings";
export type PlayerSectionType = "tests" | "feedback" | "workspace";

export type PlayerHashState = {
  section: PlayerSectionType | null;
  tab: PlayerTabType | null;
  feedbackId: string | null;
  testId: string | null;
  goalId: string | null;
  uploadId: string | null;
};

const DEFAULT_HASH_STATE: PlayerHashState = {
  section: null,
  tab: null,
  feedbackId: null,
  testId: null,
  goalId: null,
  uploadId: null,
};

const TAB_SET = new Set<PlayerTabType>([
  "rank",
  "tests",
  "goals",
  "reports",
  "uploads",
  "dashboard",
  "settings",
]);

const SECTION_SET = new Set<PlayerSectionType>([
  "tests",
  "feedback",
  "workspace",
]);

function asPlayerTab(value: string | null | undefined): PlayerTabType | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return TAB_SET.has(normalized as PlayerTabType)
    ? (normalized as PlayerTabType)
    : null;
}

function asPlayerSection(
  value: string | null | undefined,
): PlayerSectionType | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return SECTION_SET.has(normalized as PlayerSectionType)
    ? (normalized as PlayerSectionType)
    : null;
}

function cleanId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

function parsePlainHashToken(token: string): Partial<PlayerHashState> {
  const normalized = normalizeToken(token);

  if (normalized === "tests") {
    return { section: "workspace", tab: "tests" };
  }

  if (normalized === "feedback") {
    return { section: "feedback" };
  }

  if (
    normalized === "training-goals" ||
    normalized === "traininggoals"
  ) {
    return { section: "workspace", tab: "goals" };
  }

  if (
    normalized === "online-extra-help" ||
    normalized === "onlineextrahelp" ||
    normalized === "extra-help" ||
    normalized === "extrahelp" ||
    normalized === "content-upload"
  ) {
    return { section: "workspace", tab: "uploads" };
  }

  const asTab = asPlayerTab(normalized);
  if (asTab) {
    return { section: "workspace", tab: asTab };
  }

  if (
    normalized.startsWith("feedback:") ||
    normalized.startsWith("feedback/")
  ) {
    const feedbackId = cleanId(token.slice(9));
    return feedbackId ? { section: "feedback", feedbackId } : {};
  }

  if (
    normalized.startsWith("test:") ||
    normalized.startsWith("test/") ||
    normalized.startsWith("tests:") ||
    normalized.startsWith("tests/")
  ) {
    const testId = cleanId(token.replace(/^[^:/]+[:/]/, ""));
    return testId ? { section: "workspace", tab: "tests", testId } : {};
  }

  if (
    normalized.startsWith("goal:") ||
    normalized.startsWith("goal/") ||
    normalized.startsWith("goals:") ||
    normalized.startsWith("goals/")
  ) {
    const goalId = cleanId(token.replace(/^[^:/]+[:/]/, ""));
    return goalId ? { section: "workspace", tab: "goals", goalId } : {};
  }

  if (
    normalized.startsWith("upload:") ||
    normalized.startsWith("upload/") ||
    normalized.startsWith("uploads:") ||
    normalized.startsWith("uploads/")
  ) {
    const uploadId = cleanId(token.replace(/^[^:/]+[:/]/, ""));
    return uploadId ? { section: "workspace", tab: "uploads", uploadId } : {};
  }

  return {};
}

export function parsePlayerHash(rawHash: string): PlayerHashState {
  const state: PlayerHashState = { ...DEFAULT_HASH_STATE };
  const hash = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  if (!hash) return state;

  const decoded = decodeURIComponent(hash).trim();
  if (!decoded) return state;

  if (!decoded.includes("=") && !decoded.includes("&")) {
    const tokenData = parsePlainHashToken(decoded);
    Object.assign(state, tokenData);
    return finalizeHashState(state);
  }

  const params = new URLSearchParams(decoded);
  const genericId = cleanId(params.get("id"));

  state.section =
    asPlayerSection(params.get("section")) ??
    asPlayerSection(params.get("scroll")) ??
    asPlayerSection(params.get("to"));

  state.tab =
    asPlayerTab(params.get("tab")) ??
    asPlayerTab(params.get("content")) ??
    asPlayerTab(params.get("panel"));

  state.feedbackId =
    cleanId(params.get("feedbackId")) ??
    cleanId(params.get("feedback")) ??
    cleanId(params.get("fb"));

  state.testId = cleanId(params.get("testId")) ?? cleanId(params.get("test"));
  state.goalId = cleanId(params.get("goalId")) ?? cleanId(params.get("goal"));
  state.uploadId =
    cleanId(params.get("uploadId")) ?? cleanId(params.get("upload"));

  if (genericId) {
    const genericTab =
      asPlayerTab(params.get("tab")) ?? asPlayerTab(params.get("content"));
    if (genericTab === "tests" && !state.testId) state.testId = genericId;
    if (genericTab === "goals" && !state.goalId) state.goalId = genericId;
    if (genericTab === "uploads" && !state.uploadId)
      state.uploadId = genericId;
  }

  return finalizeHashState(state);
}

function finalizeHashState(state: PlayerHashState): PlayerHashState {
  if (!state.tab) {
    if (state.testId) state.tab = "tests";
    else if (state.goalId) state.tab = "goals";
    else if (state.uploadId) state.tab = "uploads";
  }

  if (!state.section) {
    if (state.feedbackId) state.section = "feedback";
    else if (state.tab) state.section = "workspace";
  }

  return state;
}

export function scrollToPlayerSection(sectionId: string) {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    const element = document.getElementById(sectionId);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export function updatePlayerHash(
  nextState: Partial<PlayerHashState>,
  mode: "replace" | "push" = "replace",
) {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams();
  if (nextState.section) params.set("section", nextState.section);
  if (nextState.tab) params.set("tab", nextState.tab);
  if (nextState.feedbackId) params.set("feedbackId", nextState.feedbackId);
  if (nextState.testId) params.set("testId", nextState.testId);
  if (nextState.goalId) params.set("goalId", nextState.goalId);
  if (nextState.uploadId) params.set("uploadId", nextState.uploadId);

  const nextHash = params.toString();
  const currentHash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  if (nextHash === currentHash) return;

  const nextUrl = `${window.location.pathname}${window.location.search}${
    nextHash ? `#${nextHash}` : ""
  }`;
  if (mode === "push") {
    window.history.pushState(null, "", nextUrl);
    return;
  }
  window.history.replaceState(null, "", nextUrl);
}
