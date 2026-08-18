import "server-only";

import { sql } from "@/db";

/**
 * Matching a /book booking request against the CRM.
 *
 * Booking requests are filled in by parents on a public page — no account, and
 * phone and email are both optional — so nothing links them to a CRM family.
 * This scores every CRM parent against the free text on the request so an admin
 * can pick the right one (or decide it really is a new family) before the
 * session gets created.
 *
 * The whole CRM is small (a few hundred parents), so this loads it in one query
 * and scores in memory rather than reaching for a fuzzy-match extension. That
 * also means the scoring is testable without a database.
 */

export type MatchTier = "strong" | "likely" | "possible";

export type CrmPlayerLite = { id: number; name: string };

export type PackageState = {
  id: number;
  packageType: string;
  totalSessions: number;
  /** Sessions on this package already delivered (start time in the past). */
  used: number;
  /** Sessions on this package on the calendar but not yet delivered. */
  booked: number;
  remaining: number;
};

export type MatchCandidate = {
  parentId: number;
  parentName: string;
  secondaryParentName: string | null;
  email: string | null;
  phone: string | null;
  isDead: boolean;
  players: CrmPlayerLite[];
  activePackage: PackageState | null;
  lastSessionDate: string | null;
  tier: MatchTier;
  reasons: string[];
  /** Player on this family whose name matches the request exactly, if any. */
  suggestedPlayerId: number | null;
};

export type BookingRequestIdentity = {
  parentName: string;
  playerName: string;
  phone: string | null;
  email: string | null;
};

export type MatchResult = {
  candidates: MatchCandidate[];
  /** What the confirm dialog should pre-select. Null when nothing matched. */
  suggestedParentId: number | null;
  suggestedType: "first" | "session";
  suggestedPackageId: number | null;
};

// --- normalizers -----------------------------------------------------------

/** Last 10 digits, so +1 (480) 555-1234 and 4805551234 compare equal. */
export function normalizePhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/** Lowercase, punctuation stripped, whitespace collapsed. */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(value: string | null | undefined): string[] {
  return normalizeName(value).split(" ").filter((t) => t.length > 2);
}

/** Do two names share a meaningful token without being the same name? */
function namesOverlap(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = nameTokens(a);
  const right = new Set(nameTokens(b));
  return left.some((token) => right.has(token));
}

// --- scoring ---------------------------------------------------------------

type ParentRecord = {
  parentId: number;
  parentName: string;
  secondaryParentName: string | null;
  email: string | null;
  phone: string | null;
  isDead: boolean;
  players: CrmPlayerLite[];
  activePackage: PackageState | null;
  lastSessionDate: string | null;
};

const TIER_RANK: Record<MatchTier, number> = { strong: 0, likely: 1, possible: 2 };

/**
 * Score CRM families against one booking request. Exported separately from the
 * query so it can be exercised without a database.
 */
export function scoreCandidates(
  request: BookingRequestIdentity,
  parents: ParentRecord[]
): MatchCandidate[] {
  const reqPhone = normalizePhone(request.phone);
  const reqEmail = normalizeEmail(request.email);
  const reqParent = normalizeName(request.parentName);
  const reqPlayer = normalizeName(request.playerName);

  const candidates: MatchCandidate[] = [];

  for (const parent of parents) {
    const reasons: string[] = [];

    const phoneMatch = reqPhone != null && normalizePhone(parent.phone) === reqPhone;
    if (phoneMatch) reasons.push("Phone matches");

    const emailMatch = reqEmail != null && normalizeEmail(parent.email) === reqEmail;
    if (emailMatch) reasons.push("Email matches");

    // The booking may come from either parent, so check both name fields.
    const parentNameExact =
      reqParent.length > 0 &&
      (normalizeName(parent.parentName) === reqParent ||
        normalizeName(parent.secondaryParentName) === reqParent);
    if (parentNameExact) reasons.push("Parent name matches");

    const matchedPlayer =
      reqPlayer.length > 0
        ? parent.players.find((p) => normalizeName(p.name) === reqPlayer) ?? null
        : null;
    if (matchedPlayer) reasons.push(`Player name matches ${matchedPlayer.name}`);

    const nameClose =
      !parentNameExact &&
      !matchedPlayer &&
      (namesOverlap(request.parentName, parent.parentName) ||
        namesOverlap(request.parentName, parent.secondaryParentName) ||
        parent.players.some((p) => namesOverlap(request.playerName, p.name)));
    if (nameClose) reasons.push("Similar name");

    let tier: MatchTier | null = null;
    if (phoneMatch || emailMatch) tier = "strong";
    else if (parentNameExact && matchedPlayer) tier = "likely";
    else if (parentNameExact || matchedPlayer || nameClose) tier = "possible";

    if (!tier) continue;

    candidates.push({
      ...parent,
      tier,
      reasons,
      suggestedPlayerId: matchedPlayer?.id ?? null,
    });
  }

  candidates.sort((a, b) => {
    const byTier = TIER_RANK[a.tier] - TIER_RANK[b.tier];
    if (byTier !== 0) return byTier;
    // More corroborating signals first, then live families over dead leads.
    if (b.reasons.length !== a.reasons.length) return b.reasons.length - a.reasons.length;
    if (a.isDead !== b.isDead) return a.isDead ? 1 : -1;
    return a.parentName.localeCompare(b.parentName);
  });

  return candidates;
}

/**
 * Which session type to pre-select, given the best match.
 *
 * A family with room left on an active package should burn a package session; a
 * known family without one gets a regular session; anyone else is new and gets
 * a first session.
 */
export function suggestSessionType(top: MatchCandidate | undefined): {
  type: "first" | "session";
  packageId: number | null;
} {
  if (!top) return { type: "first", packageId: null };
  if (top.activePackage && top.activePackage.remaining > 0) {
    return { type: "session", packageId: top.activePackage.id };
  }
  if (top.lastSessionDate) return { type: "session", packageId: null };
  return { type: "first", packageId: null };
}

// --- data loading ----------------------------------------------------------

type ParentRow = {
  parent_id: number;
  parent_name: string;
  secondary_parent_name: string | null;
  email: string | null;
  phone: string | null;
  is_dead: boolean | null;
  players: CrmPlayerLite[] | null;
  package_id: number | null;
  package_type: string | null;
  total_sessions: number | null;
  package_used: number | null;
  package_booked: number | null;
  last_session_date: string | null;
};

/**
 * Every CRM family, with players, active package usage, and last session date.
 *
 * Package usage is counted live from the sessions actually carrying the
 * package_id rather than read off `crm_packages.sessions_completed`, which has
 * drifted out of date — the same correction the coach-players page makes.
 */
async function loadParents(): Promise<ParentRecord[]> {
  const rows = (await sql`
    WITH pkg AS (
      SELECT DISTINCT ON (parent_id) parent_id, id, total_sessions, package_type
      FROM crm_packages
      WHERE is_active
      ORDER BY parent_id, start_date DESC NULLS LAST, id DESC
    ),
    used AS (
      SELECT
        package_id,
        count(*) FILTER (WHERE (session_date::timestamptz) <= now())::int AS done,
        count(*) FILTER (WHERE (session_date::timestamptz) >  now())::int AS booked
      FROM crm_sessions
      WHERE package_id IS NOT NULL AND cancelled IS NOT TRUE
      GROUP BY package_id
    ),
    last_seen AS (
      SELECT parent_id, max(session_date) AS session_date
      FROM (
        SELECT parent_id, session_date FROM crm_sessions
        WHERE cancelled IS NOT TRUE AND (session_date::timestamptz) <= now()
        UNION ALL
        SELECT parent_id, session_date FROM crm_first_sessions
        WHERE cancelled IS NOT TRUE AND (session_date::timestamptz) <= now()
      ) s
      GROUP BY parent_id
    )
    SELECT
      cp.id                       AS parent_id,
      cp.name                     AS parent_name,
      cp.secondary_parent_name,
      cp.email,
      cp.phone,
      cp.is_dead,
      COALESCE(
        (SELECT json_agg(json_build_object('id', pl.id, 'name', pl.name) ORDER BY pl.name)
         FROM crm_players pl WHERE pl.parent_id = cp.id),
        '[]'::json
      )                           AS players,
      pkg.id                      AS package_id,
      pkg.package_type,
      pkg.total_sessions,
      COALESCE(used.done, 0)      AS package_used,
      COALESCE(used.booked, 0)    AS package_booked,
      to_char(ls.session_date::timestamptz AT TIME ZONE 'America/Phoenix', 'YYYY-MM-DD')
                                  AS last_session_date
    FROM crm_parents cp
    LEFT JOIN pkg       ON pkg.parent_id = cp.id
    LEFT JOIN used      ON used.package_id = pkg.id
    LEFT JOIN last_seen ls ON ls.parent_id = cp.id
    ORDER BY cp.name ASC
  `) as unknown as ParentRow[];

  return rows.map((row) => {
    const total = row.total_sessions ?? 0;
    const usedCount = row.package_used ?? 0;
    const bookedCount = row.package_booked ?? 0;

    return {
      parentId: Number(row.parent_id),
      parentName: row.parent_name,
      secondaryParentName: row.secondary_parent_name,
      email: row.email,
      phone: row.phone,
      isDead: row.is_dead === true,
      players: (row.players ?? []).map((p) => ({ id: Number(p.id), name: p.name })),
      activePackage:
        row.package_id != null
          ? {
              id: Number(row.package_id),
              packageType: row.package_type ?? "package",
              totalSessions: total,
              used: usedCount,
              booked: bookedCount,
              // Sessions already on the calendar count against what's left,
              // otherwise a fully-booked package still looks available.
              remaining: Math.max(0, total - usedCount - bookedCount),
            }
          : null,
      lastSessionDate: row.last_session_date,
    };
  });
}

/** Rank CRM families against a booking request and suggest what to create. */
export async function matchBookingRequest(
  request: BookingRequestIdentity
): Promise<MatchResult> {
  const candidates = scoreCandidates(request, await loadParents());
  // Only a confident match should drive the pre-selection; "possible" is
  // listed for a human to judge, never auto-picked.
  const top = candidates[0];
  const confident = top && top.tier !== "possible" ? top : undefined;
  const { type, packageId } = suggestSessionType(confident);

  return {
    candidates,
    suggestedParentId: confident?.parentId ?? null,
    suggestedType: type,
    suggestedPackageId: packageId,
  };
}
