import { NextRequest } from "next/server";

import { sql } from "@/db";
import { assertAdmin } from "@/lib/adminAuth";
import { assertOwnerAccess } from "@/lib/ownerGate";

export const dynamic = "force-dynamic";

/** Saved training addresses offered when confirming a booking request. */
export async function GET(req: NextRequest) {
  const err = await assertAdmin(req);
  if (err) return err;
  const locked = await assertOwnerAccess(req);
  if (locked) return locked;

  const locations = (await sql`
    SELECT id, label, address FROM booking_locations ORDER BY created_at ASC
  `) as unknown as Array<{ id: string; label: string; address: string }>;

  return Response.json({ locations });
}

export async function POST(req: NextRequest) {
  const err = await assertAdmin(req);
  if (err) return err;
  const locked = await assertOwnerAccess(req);
  if (locked) return locked;

  const body = (await req.json().catch(() => ({}))) as { label?: string; address?: string };
  const label = (body.label ?? "").trim();
  const address = (body.address ?? "").trim();
  if (!label || !address) {
    return Response.json({ error: "label and address are required" }, { status: 400 });
  }

  const rows = (await sql`
    INSERT INTO booking_locations (label, address)
    SELECT ${label}, ${address}
    WHERE NOT EXISTS (SELECT 1 FROM booking_locations WHERE address = ${address})
    RETURNING id, label, address
  `) as unknown as Array<{ id: string; label: string; address: string }>;

  if (rows.length === 0) {
    return Response.json({ error: "That address is already saved." }, { status: 409 });
  }
  return Response.json({ location: rows[0] }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const err = await assertAdmin(req);
  if (err) return err;
  const locked = await assertOwnerAccess(req);
  if (locked) return locked;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  await sql`DELETE FROM booking_locations WHERE id = ${id}`;
  return new Response(null, { status: 204 });
}
