import { del } from "@vercel/blob";
import { NextRequest } from "next/server";
import { sql } from "@/db";
import { assertAdmin } from "@/lib/adminAuth";
import { COACH_SLUGS } from "@/lib/bookingSchedule";
import { isManagedCoachPhotoUrl } from "@/lib/coachPhoto";
import { sanitizeSchedule, sanitizeHorizon, sanitizeLocations } from "@/lib/coaches";

// A photo_url we are willing to store: an https URL, or null to clear it.
// Anything else is treated as "clear" rather than written through blindly.
function sanitizePhotoUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

// PATCH /api/admin/coaches
// Body: { slug, bio, role, horizonMonths, booking_schedule, booking_locations,
// photo_url }
// Updates a coach's editable booking profile (availability periods, booking
// horizon, public bio/role, and headshot). These live in dedicated columns,
// separate from the CRM's own description/role. Admin only.
export async function PATCH(req: NextRequest) {
  const err = await assertAdmin(req);
  if (err) return err;

  const body = (await req.json().catch(() => null)) as {
    slug?: unknown;
    bio?: unknown;
    role?: unknown;
    horizonMonths?: unknown;
    booking_schedule?: unknown;
    booking_locations?: unknown;
    photo_url?: unknown;
  } | null;
  if (!body) return new Response("Invalid JSON", { status: 400 });

  const slug = typeof body.slug === "string" ? body.slug : "";
  if (!(COACH_SLUGS as readonly string[]).includes(slug)) {
    return new Response("Unknown coach", { status: 400 });
  }

  const bio = typeof body.bio === "string" ? body.bio.trim() || null : null;
  const role = typeof body.role === "string" ? body.role.trim() || null : null;
  const horizonMonths = sanitizeHorizon(body.horizonMonths);
  const schedule = sanitizeSchedule(body.booking_schedule);
  const locations = sanitizeLocations(body.booking_locations);
  const photoUrl = sanitizePhotoUrl(body.photo_url);

  // Read the outgoing photo before overwriting it so we can bin the old file.
  const priorRows = (await sql`
    SELECT photo_url FROM crm_staff WHERE slug = ${slug} LIMIT 1
  `) as unknown as Array<{ photo_url: string | null }>;
  const priorPhotoUrl = priorRows[0]?.photo_url ?? null;

  const rows = (await sql`
    UPDATE crm_staff
    SET booking_bio = ${bio},
        booking_role = ${role},
        booking_horizon_months = ${horizonMonths},
        booking_schedule = ${JSON.stringify(schedule)}::jsonb,
        booking_locations = ${JSON.stringify(locations)}::jsonb,
        photo_url = ${photoUrl},
        updated_at = now()
    WHERE slug = ${slug}
    RETURNING slug, booking_bio, booking_role, booking_horizon_months, booking_schedule,
              booking_locations, photo_url
  `) as unknown as Array<{
    slug: string;
    booking_bio: string | null;
    booking_role: string | null;
    booking_horizon_months: number;
    booking_schedule: unknown;
    booking_locations: unknown;
    photo_url: string | null;
  }>;

  if (rows.length === 0) return new Response("Coach not found", { status: 404 });

  // The save already succeeded; a failed cleanup must never fail the request.
  // Only files we uploaded are eligible, so a hand-set URL is never deleted.
  if (priorPhotoUrl !== photoUrl && isManagedCoachPhotoUrl(priorPhotoUrl)) {
    try {
      await del(priorPhotoUrl);
    } catch {
      // Orphaned blob; not worth surfacing to the admin.
    }
  }

  return Response.json({ ok: true, coach: rows[0] });
}
