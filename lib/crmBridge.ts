import "server-only";

/**
 * Client for the CRM's /api/integrations/booking-request endpoint.
 *
 * The CRM owns everything that happens when a session is created — Google
 * Calendar invites, the 48/24/6h reminders, the coach SMS — so confirming a
 * booking request hands the work over there rather than reimplementing it here
 * against the shared database.
 */

export const CRM_BASE_URL = (
  process.env.CRM_BASE_URL || "https://davids-soccer-training-crm.vercel.app"
).replace(/\/+$/, "");

/** The one training location booking requests default to. Editable per booking. */
export const DEFAULT_BOOKING_ADDRESS = "3005 E Queen Creek Rd, Gilbert, AZ 85298";

export type CrmSessionKind = "first" | "session";

export type CrmParentRef = { id: number } | { create: { name: string; email?: string | null; phone?: string | null } };
export type CrmPlayerRef = { id: number } | { create: { name: string } };

export type CreateCrmSessionInput = {
  kind: CrmSessionKind;
  parent: CrmParentRef;
  players: CrmPlayerRef[];
  /** Arizona-local "YYYY-MM-DDTHH:MM"; the CRM converts to UTC. */
  session_date: string;
  session_end_date?: string;
  location?: string | null;
  price?: number | null;
  title?: string | null;
  notes?: string | null;
  package_id?: number | null;
  coach_slug?: string | null;
  send_email_updates?: boolean;
};

export type CreateCrmSessionResult =
  | { ok: true; sessionId: number; parentId: number; playerIds: number[] }
  | { ok: false; error: string };

export async function createCrmSession(
  input: CreateCrmSessionInput
): Promise<CreateCrmSessionResult> {
  const secret = (process.env.BRIDGE_SECRET || "").trim();
  if (!secret) return { ok: false, error: "BRIDGE_SECRET is not configured" };

  let res: Response;
  try {
    res = await fetch(`${CRM_BASE_URL}/api/integrations/booking-request`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(input),
      cache: "no-store",
    });
  } catch (error) {
    return { ok: false, error: `Could not reach the CRM: ${(error as Error).message}` };
  }

  const text = await res.text();
  if (!res.ok) {
    // The CRM answers with {error} for its own failures and plain text for
    // anything the platform rejected before the route ran.
    let message = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed?.error) message = parsed.error;
    } catch {
      // keep the raw body
    }
    return { ok: false, error: `CRM refused the session (${res.status}): ${message}` };
  }

  try {
    const parsed = JSON.parse(text) as {
      parent_id?: number;
      player_ids?: number[];
      session?: { id?: number };
    };
    const sessionId = Number(parsed.session?.id);
    if (!Number.isFinite(sessionId)) {
      return { ok: false, error: "CRM returned no session id" };
    }
    return {
      ok: true,
      sessionId,
      parentId: Number(parsed.parent_id),
      playerIds: (parsed.player_ids ?? []).map(Number),
    };
  } catch {
    return { ok: false, error: "CRM returned a response that could not be parsed" };
  }
}
