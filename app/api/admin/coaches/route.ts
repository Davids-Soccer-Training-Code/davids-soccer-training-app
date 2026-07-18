import { NextRequest } from "next/server";
import { sql } from "@/db";
import { assertAdmin } from "@/lib/adminAuth";
import { COACH_SLUGS } from "@/lib/bookingSchedule";
import { sanitizeSchedule, sanitizeHorizon } from "@/lib/coaches";

export const dynamic = "force-dynamic";

// PATCH /api/admin/coaches
// Body: { slug, bio, role, horizonMonths, booking_schedule }
// Updates a coach's editable booking profile (availability periods, booking
// horizon, and public bio/role). These live in dedicated columns, separate from
// the CRM's own description/role. Admin only.
export async function PATCH(req: NextRequest) {
  const err = await assertAdmin(req);
  if (err) return err;

  const body = (await req.json().catch(() => null)) as {
    slug?: unknown;
    bio?: unknown;
    role?: unknown;
    horizonMonths?: unknown;
    booking_schedule?: unknown;
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

  const rows = (await sql`
    UPDATE crm_staff
    SET booking_bio = ${bio},
        booking_role = ${role},
        booking_horizon_months = ${horizonMonths},
        booking_schedule = ${JSON.stringify(schedule)}::jsonb,
        updated_at = now()
    WHERE slug = ${slug}
    RETURNING slug, booking_bio, booking_role, booking_horizon_months, booking_schedule
  `) as unknown as Array<{
    slug: string;
    booking_bio: string | null;
    booking_role: string | null;
    booking_horizon_months: number;
    booking_schedule: unknown;
  }>;

  if (rows.length === 0) return new Response("Coach not found", { status: 404 });
  return Response.json({ ok: true, coach: rows[0] });
}
