import { put } from "@vercel/blob";
import { NextRequest } from "next/server";

import { assertAdmin } from "@/lib/adminAuth";
import { COACH_SLUGS } from "@/lib/bookingSchedule";
import { COACH_PHOTO_PREFIX } from "@/lib/coachPhoto";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

function sanitizeBlobFilename(name: string) {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return cleaned || "upload";
}

// POST /api/admin/coaches/photo
// Body: multipart with `slug` and `file`. Uploads a coach headshot to Blob and
// returns its URL. Deliberately does NOT touch crm_staff — the URL is persisted
// by the coaches PATCH when the admin saves the card, which is also what cleans
// up the coach's previous photo. Admin only.
export async function POST(req: NextRequest) {
  const err = await assertAdmin(req);
  if (err) return err;

  const form = await req.formData().catch(() => null);
  if (!form) return new Response("Expected multipart form data", { status: 400 });

  const slug = String(form.get("slug") ?? "");
  if (!(COACH_SLUGS as readonly string[]).includes(slug)) {
    return new Response("Unknown coach", { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return new Response("Missing file", { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return new Response("Please upload an image file.", { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return new Response("Image too large (max 8MB).", { status: 400 });
  }

  const key = `${COACH_PHOTO_PREFIX}${slug}-${Date.now()}-${crypto.randomUUID()}-${sanitizeBlobFilename(file.name)}`;
  const blob = await put(key, file, { access: "public" });

  return Response.json({ url: blob.url });
}
