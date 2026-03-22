import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { del, put } from "@vercel/blob";

import { sql } from "@/db";
import { authOptions } from "@/lib/auth";
import {
  PLAYER_DASHBOARD_URL,
  sendGroupSignupConfirmationEmail,
  sendGroupSignupOwnerNotificationEmail,
} from "@/lib/groupSignupEmails";

export const dynamic = "force-dynamic";

const ADMIN_TIME_ZONE = "America/Phoenix";

type GroupSessionRow = {
  id: number;
  title: string;
  description: string | null;
  image_url: string | null;
  session_date: string;
  session_date_end: string | null;
  location: string | null;
  price: number | null;
  curriculum: string | null;
  max_players: number;
  created_at: string;
  updated_at: string;
};

type GroupSignupRow = {
  id: number;
  group_session_id: number;
  first_name: string;
  last_name: string;
  birthday: string | null;
  foot: string | null;
  team: string | null;
  notes: string | null;
  signup_price: number | null;
  amount_paid: number | null;
  contact_email: string;
  contact_phone: string | null;
  emergency_contact: string;
  has_paid: boolean;
  created_at: string;
  updated_at: string;
  linked_parent_id: string | null;
  linked_parent_name: string | null;
  linked_player_id: string | null;
  linked_player_name: string | null;
  latest_profile_id: string | null;
  latest_profile_name: string | null;
  latest_profile_computed_at: string | null;
};

type AppPlayerRow = {
  id: string;
  name: string;
  birthdate: string | null;
  dominant_foot: string | null;
  team_level: string | null;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
};

type SessionEmailRow = {
  id: number;
  title: string;
  session_date: string;
  session_date_end: string | null;
  location: string | null;
  price: number | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ADMIN_TIME_ZONE,
  }).format(parsed);
}

function formatMoney(value: number | null) {
  if (value === null) return "Not set";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPlayerName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

function splitName(name: string) {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) return { firstName: "", lastName: "" };
  const [firstName, ...rest] = cleaned.split(" ");
  return { firstName, lastName: rest.join(" ") };
}

function cleanNullableText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function cleanRequiredText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function parsePositiveInt(value: FormDataEntryValue | null, fallback = 0) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function parseNullableMoney(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function sanitizeBlobFilename(name: string) {
  const trimmed = name.trim().toLowerCase();
  const cleaned = trimmed.replace(/[^a-z0-9._-]+/g, "-");
  return cleaned || "upload";
}

function isManagedGroupSessionBlobUrl(url: string | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.endsWith(".blob.vercel-storage.com") &&
      parsed.pathname.startsWith("/group-sessions/")
    );
  } catch {
    return false;
  }
}

async function uploadGroupSessionImage(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please upload an image file.");
  }
  const maxBytes = 8 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error("Image too large (max 8MB).");
  }

  const fileName = sanitizeBlobFilename(file.name);
  const key = `group-sessions/${Date.now()}-${crypto.randomUUID()}-${fileName}`;
  const blob = await put(key, file, { access: "public" });
  return blob.url;
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ADMIN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  if (!year || !month || !day || !hour || !minute) return "";

  const normalizedHour = hour === "24" ? "00" : hour;
  return `${year}-${month}-${day}T${normalizedHour}:${minute}`;
}

async function requireAdminAccess() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    throw new Error("Unauthorized");
  }
}

async function createGroupSessionAction(formData: FormData) {
  "use server";

  await requireAdminAccess();

  const title = cleanRequiredText(formData.get("title"));
  const sessionDate = cleanRequiredText(formData.get("session_date"));
  if (!title || !sessionDate) return;

  const description = cleanNullableText(formData.get("description"));
  const imageFile = formData.get("image_file");
  let imageUrl: string | null = null;
  if (imageFile instanceof File && imageFile.size > 0) {
    imageUrl = await uploadGroupSessionImage(imageFile);
  }
  const sessionDateEnd = cleanNullableText(formData.get("session_date_end"));
  const location = cleanNullableText(formData.get("location"));
  const price = parseNullableMoney(formData.get("price"));
  const curriculum = cleanNullableText(formData.get("curriculum"));
  const maxPlayers = parsePositiveInt(formData.get("max_players"), 0);

  await sql`
    INSERT INTO group_sessions (
      title,
      description,
      image_url,
      session_date,
      session_date_end,
      location,
      price,
      curriculum,
      max_players
    )
    VALUES (
      ${title},
      ${description},
      ${imageUrl},
      ${sessionDate}::timestamp AT TIME ZONE ${ADMIN_TIME_ZONE},
      CASE
        WHEN ${sessionDateEnd} IS NULL THEN NULL
        ELSE ${sessionDateEnd}::timestamp AT TIME ZONE ${ADMIN_TIME_ZONE}
      END,
      ${location},
      ${price},
      ${curriculum},
      ${maxPlayers}
    )
  `;

  revalidatePath("/admin/group-training");
}

async function updateGroupSessionAction(formData: FormData) {
  "use server";

  await requireAdminAccess();

  const sessionId = parsePositiveInt(formData.get("session_id"), 0);
  const title = cleanRequiredText(formData.get("title"));
  const sessionDate = cleanRequiredText(formData.get("session_date"));
  if (!sessionId || !title || !sessionDate) return;

  const description = cleanNullableText(formData.get("description"));
  const existingImageUrl = cleanNullableText(formData.get("existing_image_url"));
  const imageFile = formData.get("image_file");
  const removeImage = String(formData.get("remove_image") ?? "") === "on";
  let imageUrl = removeImage ? null : existingImageUrl;
  if (imageFile instanceof File && imageFile.size > 0) {
    imageUrl = await uploadGroupSessionImage(imageFile);
    if (isManagedGroupSessionBlobUrl(existingImageUrl) && existingImageUrl !== imageUrl) {
      try {
        await del(existingImageUrl);
      } catch {
        // Ignore cleanup failures to avoid blocking admin edits.
      }
    }
  } else if (removeImage && isManagedGroupSessionBlobUrl(existingImageUrl)) {
    try {
      await del(existingImageUrl);
    } catch {
      // Ignore cleanup failures to avoid blocking admin edits.
    }
  }
  const sessionDateEnd = cleanNullableText(formData.get("session_date_end"));
  const location = cleanNullableText(formData.get("location"));
  const price = parseNullableMoney(formData.get("price"));
  const curriculum = cleanNullableText(formData.get("curriculum"));
  const maxPlayers = parsePositiveInt(formData.get("max_players"), 0);

  await sql`
    UPDATE group_sessions
    SET
      title = ${title},
      description = ${description},
      image_url = ${imageUrl},
      session_date = ${sessionDate}::timestamp AT TIME ZONE ${ADMIN_TIME_ZONE},
      session_date_end = CASE
        WHEN ${sessionDateEnd} IS NULL THEN NULL
        ELSE ${sessionDateEnd}::timestamp AT TIME ZONE ${ADMIN_TIME_ZONE}
      END,
      location = ${location},
      price = ${price},
      curriculum = ${curriculum},
      max_players = ${maxPlayers},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${sessionId}
  `;

  revalidatePath("/admin/group-training");
}

async function deleteGroupSessionAction(formData: FormData) {
  "use server";

  await requireAdminAccess();

  const sessionId = parsePositiveInt(formData.get("session_id"), 0);
  if (!sessionId) return;

  const existingRows = (await sql`
    SELECT image_url
    FROM group_sessions
    WHERE id = ${sessionId}
    LIMIT 1
  `) as unknown as Array<{ image_url: string | null }>;
  const existingImageUrl = existingRows[0]?.image_url ?? null;

  await sql`
    DELETE FROM group_sessions
    WHERE id = ${sessionId}
  `;

  if (isManagedGroupSessionBlobUrl(existingImageUrl)) {
    try {
      await del(existingImageUrl);
    } catch {
      // Ignore cleanup failures to avoid blocking deletes.
    }
  }

  revalidatePath("/admin/group-training");
}

async function deleteGroupSessionSignupAction(formData: FormData) {
  "use server";

  await requireAdminAccess();

  const signupId = parsePositiveInt(formData.get("signup_id"), 0);
  if (!signupId) return;

  await sql`
    DELETE FROM player_signups
    WHERE id = ${signupId}
  `;

  revalidatePath("/admin/group-training");
}

async function addSignupFromAppPlayerAction(formData: FormData) {
  "use server";

  await requireAdminAccess();

  const groupSessionId = parsePositiveInt(formData.get("group_session_id"), 0);
  const appPlayerId = cleanRequiredText(formData.get("app_player_id"));
  if (!groupSessionId || !appPlayerId) return;

  const playerRows = (await sql`
    SELECT
      p.id,
      p.name,
      p.birthdate::text AS birthdate,
      p.dominant_foot,
      p.team_level,
      parent.name AS parent_name,
      parent.email AS parent_email,
      parent.phone AS parent_phone
    FROM players p
    LEFT JOIN parents parent ON parent.id = p.parent_id
    WHERE p.id = ${appPlayerId}
    LIMIT 1
  `) as unknown as AppPlayerRow[];
  const player = playerRows[0];
  if (!player) return;

  const sessionRows = (await sql`
    SELECT price::float8 AS price
         , id::int AS id
         , title
         , session_date::text AS session_date
         , session_date_end::text AS session_date_end
         , location
    FROM group_sessions
    WHERE id = ${groupSessionId}
    LIMIT 1
  `) as unknown as SessionEmailRow[];
  const session = sessionRows[0];
  if (!session) return;
  const sessionPrice = session.price ?? null;

  const split = splitName(player.name);
  const firstName = split.firstName || "Player";
  const lastName = split.lastName || "Player";

  const emergencyContact =
    cleanNullableText(formData.get("emergency_contact_override")) ||
    cleanNullableText(player.parent_name) ||
    cleanNullableText(player.parent_email) ||
    "Parent";
  const contactEmail =
    cleanNullableText(formData.get("contact_email_override")) ||
    cleanNullableText(player.parent_email) ||
    null;
  const contactPhone =
    cleanNullableText(formData.get("contact_phone_override")) ||
    cleanNullableText(player.parent_phone);
  if (!contactEmail) return;

  const hasPaid = String(formData.get("has_paid") ?? "") === "on";
  const signupPrice = parseNullableMoney(formData.get("signup_price")) ?? sessionPrice;
  const amountPaidInput = parseNullableMoney(formData.get("amount_paid"));
  const amountPaid = hasPaid ? amountPaidInput ?? signupPrice : null;

  await sql`
    INSERT INTO player_signups (
      group_session_id,
      first_name,
      last_name,
      emergency_contact,
      contact_email,
      contact_phone,
      birthday,
      foot,
      team,
      notes,
      has_paid,
      signup_price,
      amount_paid
    )
    VALUES (
      ${groupSessionId},
      ${firstName},
      ${lastName},
      ${emergencyContact},
      ${contactEmail},
      ${contactPhone},
      ${player.birthdate}::date,
      ${player.dominant_foot},
      ${player.team_level},
      ${cleanNullableText(formData.get("notes"))},
      ${hasPaid},
      ${signupPrice},
      ${amountPaid}
    )
  `;

  if (hasPaid) {
    const playerFullName = `${firstName} ${lastName}`.trim();
    const loginEmail = contactEmail;
    const ownerAlertEmail =
      process.env.GROUP_SIGNUP_ALERT_EMAIL ||
      process.env.GMAIL_USER_GROUPS ||
      "davidfalesct@gmail.com";

    try {
      await sendGroupSignupConfirmationEmail({
        to: contactEmail,
        firstName,
        playerNames: [playerFullName],
        sessionTitle: session.title,
        sessionDate: session.session_date,
        sessionDateEnd: session.session_date_end,
        location: session.location,
        receiptUrl: null,
        loginEmail,
        loginPassword: null,
      });
    } catch (emailError) {
      console.error("Failed to send group signup confirmation email", emailError);
    }

    try {
      await sendGroupSignupOwnerNotificationEmail({
        to: ownerAlertEmail,
        playerNames: [playerFullName],
        emergencyContact,
        contactPhone,
        contactEmail,
        sessionTitle: session.title,
        sessionDate: session.session_date,
        sessionDateEnd: session.session_date_end,
        location: session.location,
        receiptUrl: null,
        parentPortalUrl: PLAYER_DASHBOARD_URL,
        parentLoginEmail: loginEmail,
        parentLoginPassword: null,
      });
    } catch (ownerEmailError) {
      console.error("Failed to send group signup owner alert email", ownerEmailError);
    }
  }

  revalidatePath("/admin/group-training");
}

async function addManualSignupAction(formData: FormData) {
  "use server";

  await requireAdminAccess();

  const groupSessionId = parsePositiveInt(formData.get("group_session_id"), 0);
  if (!groupSessionId) return;

  const firstName = cleanRequiredText(formData.get("first_name"));
  const lastName = cleanRequiredText(formData.get("last_name"));
  const emergencyContact = cleanRequiredText(formData.get("emergency_contact"));
  const contactEmail = cleanRequiredText(formData.get("contact_email"));
  if (!firstName || !lastName || !emergencyContact || !contactEmail) return;
  const contactPhone = cleanNullableText(formData.get("contact_phone"));

  const sessionRows = (await sql`
    SELECT
      id::int AS id,
      title,
      session_date::text AS session_date,
      session_date_end::text AS session_date_end,
      location,
      price::float8 AS price
    FROM group_sessions
    WHERE id = ${groupSessionId}
    LIMIT 1
  `) as unknown as SessionEmailRow[];
  const session = sessionRows[0];
  if (!session) return;

  const hasPaid = String(formData.get("has_paid") ?? "") === "on";
  const signupPrice = parseNullableMoney(formData.get("signup_price")) ?? session.price;
  const amountPaidInput = parseNullableMoney(formData.get("amount_paid"));
  const amountPaid = hasPaid ? amountPaidInput ?? signupPrice : null;

  await sql`
    INSERT INTO player_signups (
      group_session_id,
      first_name,
      last_name,
      emergency_contact,
      contact_email,
      contact_phone,
      birthday,
      foot,
      team,
      notes,
      has_paid,
      signup_price,
      amount_paid
    )
    VALUES (
      ${groupSessionId},
      ${firstName},
      ${lastName},
      ${emergencyContact},
      ${contactEmail},
      ${contactPhone},
      ${cleanNullableText(formData.get("birthday"))}::date,
      ${cleanNullableText(formData.get("foot"))},
      ${cleanNullableText(formData.get("team"))},
      ${cleanNullableText(formData.get("notes"))},
      ${hasPaid},
      ${signupPrice},
      ${amountPaid}
    )
  `;

  if (hasPaid) {
    const playerFullName = `${firstName} ${lastName}`.trim();
    const ownerAlertEmail =
      process.env.GROUP_SIGNUP_ALERT_EMAIL ||
      process.env.GMAIL_USER_GROUPS ||
      "davidfalesct@gmail.com";

    try {
      await sendGroupSignupConfirmationEmail({
        to: contactEmail,
        firstName,
        playerNames: [playerFullName],
        sessionTitle: session.title,
        sessionDate: session.session_date,
        sessionDateEnd: session.session_date_end,
        location: session.location,
        receiptUrl: null,
        loginEmail: contactEmail,
        loginPassword: null,
      });
    } catch (emailError) {
      console.error("Failed to send group signup confirmation email", emailError);
    }

    try {
      await sendGroupSignupOwnerNotificationEmail({
        to: ownerAlertEmail,
        playerNames: [playerFullName],
        emergencyContact,
        contactPhone,
        contactEmail,
        sessionTitle: session.title,
        sessionDate: session.session_date,
        sessionDateEnd: session.session_date_end,
        location: session.location,
        receiptUrl: null,
        parentPortalUrl: PLAYER_DASHBOARD_URL,
        parentLoginEmail: contactEmail,
        parentLoginPassword: null,
      });
    } catch (ownerEmailError) {
      console.error("Failed to send group signup owner alert email", ownerEmailError);
    }
  }

  revalidatePath("/admin/group-training");
}

export default async function GroupTrainingPage() {
  const [sessionRows, signupRows, appPlayerRows] = await Promise.all([
    sql`
      SELECT
        gs.id::int AS id,
        gs.title,
        gs.description,
        gs.image_url,
        gs.session_date::text AS session_date,
        gs.session_date_end::text AS session_date_end,
        gs.location,
        gs.price::float8 AS price,
        gs.curriculum,
        gs.max_players::int AS max_players,
        gs.created_at::text AS created_at,
        gs.updated_at::text AS updated_at
      FROM group_sessions gs
      ORDER BY gs.session_date DESC, gs.created_at DESC
    `,
    sql`
      SELECT
        ps.id::int AS id,
        ps.group_session_id::int AS group_session_id,
        ps.first_name,
        ps.last_name,
        ps.birthday::text AS birthday,
        ps.foot,
        ps.team,
        ps.notes,
        ps.signup_price::float8 AS signup_price,
        ps.amount_paid::float8 AS amount_paid,
        ps.contact_email,
        ps.contact_phone,
        ps.emergency_contact,
        ps.has_paid,
        ps.created_at::text AS created_at,
        ps.updated_at::text AS updated_at,
        parent_match.id AS linked_parent_id,
        parent_match.name AS linked_parent_name,
        player_match.id AS linked_player_id,
        player_match.name AS linked_player_name,
        profile_match.id AS latest_profile_id,
        profile_match.name AS latest_profile_name,
        profile_match.computed_at::text AS latest_profile_computed_at
      FROM player_signups ps
      LEFT JOIN LATERAL (
        SELECT p.id, p.name, p.created_at
        FROM parents p
        WHERE
          (
            NULLIF(lower(trim(ps.contact_email)), '') IS NOT NULL
            AND lower(trim(coalesce(p.email, ''))) = lower(trim(ps.contact_email))
          )
          OR (
            NULLIF(regexp_replace(coalesce(ps.contact_phone, ''), '\\D', '', 'g'), '') IS NOT NULL
            AND regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g') = regexp_replace(coalesce(ps.contact_phone, ''), '\\D', '', 'g')
          )
          OR (
            NULLIF(regexp_replace(coalesce(ps.emergency_contact, ''), '\\D', '', 'g'), '') IS NOT NULL
            AND regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g') = regexp_replace(coalesce(ps.emergency_contact, ''), '\\D', '', 'g')
          )
        ORDER BY
          CASE
            WHEN NULLIF(lower(trim(ps.contact_email)), '') IS NOT NULL
              AND lower(trim(coalesce(p.email, ''))) = lower(trim(ps.contact_email))
              THEN 0
            WHEN NULLIF(regexp_replace(coalesce(ps.contact_phone, ''), '\\D', '', 'g'), '') IS NOT NULL
              AND regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g') = regexp_replace(coalesce(ps.contact_phone, ''), '\\D', '', 'g')
              THEN 1
            ELSE 2
          END,
          p.created_at ASC
        LIMIT 1
      ) parent_match ON true
      LEFT JOIN LATERAL (
        SELECT pl.id, pl.name, pl.created_at
        FROM players pl
        WHERE pl.parent_id = parent_match.id
          AND (
            lower(trim(pl.name)) = lower(trim(concat(ps.first_name, ' ', ps.last_name)))
            OR (
              split_part(lower(trim(pl.name)), ' ', 1) = lower(trim(ps.first_name))
              AND (
                lower(trim(coalesce(ps.last_name, ''))) = ''
                OR lower(trim(coalesce(ps.last_name, ''))) = 'player'
              )
            )
          )
        ORDER BY
          CASE
            WHEN lower(trim(pl.name)) = lower(trim(concat(ps.first_name, ' ', ps.last_name)))
              THEN 0
            ELSE 1
          END,
          pl.created_at ASC
        LIMIT 1
      ) player_match ON true
      LEFT JOIN LATERAL (
        SELECT pp.id, pp.name, pp.computed_at
        FROM player_profiles pp
        WHERE pp.player_id = player_match.id
        ORDER BY pp.computed_at DESC, pp.created_at DESC
        LIMIT 1
      ) profile_match ON true
      ORDER BY ps.group_session_id DESC, ps.has_paid DESC, ps.created_at DESC
    `,
    sql`
      SELECT
        p.id,
        p.name,
        p.birthdate::text AS birthdate,
        p.dominant_foot,
        p.team_level,
        parent.name AS parent_name,
        parent.email AS parent_email,
        parent.phone AS parent_phone
      FROM players p
      LEFT JOIN parents parent ON parent.id = p.parent_id
      ORDER BY p.name ASC, p.created_at DESC
    `,
  ]);

  const sessions = sessionRows as unknown as GroupSessionRow[];
  const signups = signupRows as unknown as GroupSignupRow[];
  const appPlayers = appPlayerRows as unknown as AppPlayerRow[];

  const signupsBySession = new Map<number, GroupSignupRow[]>();
  for (const signup of signups) {
    const existing = signupsBySession.get(signup.group_session_id) ?? [];
    existing.push(signup);
    signupsBySession.set(signup.group_session_id, existing);
  }

  return (
    <div className="min-h-screen bg-emerald-50">
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-3 rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Group Sessions Admin</h1>
            <p className="mt-2 text-sm text-gray-600">
              Session and signup visibility, including profile-link status.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin"
              className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300"
            >
              Back to admin
            </Link>
            <Link
              href="/admin/private-sessions"
              className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300"
            >
              Open private sessions
            </Link>
          </div>
        </div>

        <section className="mb-8 rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-emerald-700">
              Add Session
            </summary>
            <form
              action={createGroupSessionAction}
              encType="multipart/form-data"
              className="mt-4 grid gap-3 md:grid-cols-2"
            >
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Title
                <input
                  name="title"
                  required
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                />
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Session Date
                <input
                  name="session_date"
                  type="datetime-local"
                  required
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                />
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                End Date
                <input
                  name="session_date_end"
                  type="datetime-local"
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                />
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Location
                <input
                  name="location"
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                />
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Price (USD)
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                />
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Max Players
                <input
                  name="max_players"
                  type="number"
                  min="0"
                  defaultValue={0}
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                />
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600 md:col-span-2">
                Upload Image
                <input
                  name="image_file"
                  type="file"
                  accept="image/*"
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                />
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600 md:col-span-2">
                Description
                <textarea
                  name="description"
                  rows={2}
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                />
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600 md:col-span-2">
                Curriculum
                <textarea
                  name="curriculum"
                  rows={2}
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                />
              </label>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Add Session
                </button>
              </div>
            </form>
          </details>
        </section>

        <section className="mb-8 rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Add Players to Group Sessions</h2>
          <p className="mt-1 text-sm text-gray-600">
            Add by selecting an app player, or manually enter a prospect/player.
          </p>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <details className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-emerald-700">
                Add From App Player
              </summary>
              <form action={addSignupFromAppPlayerAction} className="mt-4 grid gap-3">
                <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Session
                  <select
                    name="group_session_id"
                    required
                    className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                  >
                    <option value="">Select session</option>
                    {sessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        #{session.id} - {session.title} ({formatDateTime(session.session_date)})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  App Player
                  <select
                    name="app_player_id"
                    required
                    className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                  >
                    <option value="">Select player</option>
                    {appPlayers.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name} - {player.parent_name || player.parent_email || "No parent label"}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Notes (optional)
                  <textarea
                    name="notes"
                    rows={2}
                    className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Signup Price (optional)
                    <input
                      name="signup_price"
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Amount Paid (optional)
                    <input
                      name="amount_paid"
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-800"
                    />
                  </label>
                </div>

                <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  <input name="has_paid" type="checkbox" className="h-4 w-4" />
                  Mark as paid
                </label>

                <details className="rounded-xl border border-emerald-200 bg-white p-3">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Optional Contact Overrides
                  </summary>
                  <div className="mt-3 grid gap-3">
                    <input
                      name="emergency_contact_override"
                      placeholder="Emergency contact override"
                      className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                    />
                    <input
                      name="contact_email_override"
                      type="email"
                      placeholder="Contact email override"
                      className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                    />
                    <input
                      name="contact_phone_override"
                      placeholder="Contact phone override"
                      className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                    />
                  </div>
                </details>

                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Add App Player Signup
                </button>
              </form>
            </details>

            <details className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-amber-700">
                Manual Add
              </summary>
              <form action={addManualSignupAction} className="mt-4 grid gap-3">
                <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Session
                  <select
                    name="group_session_id"
                    required
                    className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800"
                  >
                    <option value="">Select session</option>
                    {sessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        #{session.id} - {session.title} ({formatDateTime(session.session_date)})
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    name="first_name"
                    required
                    placeholder="First name"
                    className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800"
                  />
                  <input
                    name="last_name"
                    required
                    placeholder="Last name"
                    className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    name="birthday"
                    type="date"
                    placeholder="Birthday"
                    className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800"
                  />
                  <input
                    name="foot"
                    placeholder="Preferred foot"
                    className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800"
                  />
                </div>

                <input
                  name="team"
                  placeholder="Team"
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800"
                />
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Notes"
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800"
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    name="emergency_contact"
                    required
                    placeholder="Emergency contact"
                    className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800"
                  />
                  <input
                    name="contact_phone"
                    placeholder="Contact phone"
                    className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800"
                  />
                </div>

                <input
                  name="contact_email"
                  type="email"
                  required
                  placeholder="Contact email"
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800"
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Signup Price (optional)
                    <input
                      name="signup_price"
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Amount Paid (optional)
                    <input
                      name="amount_paid"
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800"
                    />
                  </label>
                </div>

                <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  <input name="has_paid" type="checkbox" className="h-4 w-4" />
                  Mark as paid
                </label>

                <button
                  type="submit"
                  className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                >
                  Add Manual Signup
                </button>
              </form>
            </details>
          </div>
        </section>

        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Sessions + Signup Link Audit</h2>
            <div className="text-sm text-gray-600">{sessions.length} sessions</div>
          </div>

          {sessions.length === 0 ? (
            <div className="rounded-3xl border border-emerald-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
              No group sessions found.
            </div>
          ) : (
            sessions.map((session) => {
              const sessionSignups = signupsBySession.get(session.id) ?? [];
              const totalSignups = sessionSignups.length;
              const paidSignups = sessionSignups.filter(
                (signup) => signup.has_paid
              ).length;
              const prospectSignups = totalSignups - paidSignups;
              const paidSpotsLeft = Math.max(session.max_players - paidSignups, 0);
              const paidRows = sessionSignups.filter((signup) => signup.has_paid);
              const prospectRows = sessionSignups.filter((signup) => !signup.has_paid);

              return (
                <article
                  key={session.id}
                  className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-[280px] flex-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        Session #{session.id}
                      </div>
                      <h3 className="mt-1 text-xl font-semibold text-gray-900">{session.title}</h3>
                      <p className="mt-1 text-sm text-gray-600">
                        {formatDateTime(session.session_date)}
                        {session.session_date_end
                          ? ` to ${formatDateTime(session.session_date_end)}`
                          : ""}
                      </p>
                      {session.location && (
                        <p className="mt-1 text-sm text-gray-600">Location: {session.location}</p>
                      )}
                      <p className="mt-1 text-xs text-gray-500">
                        Created: {formatDateTime(session.created_at)} | Updated:{" "}
                        {formatDateTime(session.updated_at)}
                      </p>
                    </div>
                    <div className="grid gap-2 text-right text-sm">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-gray-700">
                        Price: <span className="font-semibold text-gray-900">{formatMoney(session.price)}</span>
                      </div>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-gray-700">
                        Max: <span className="font-semibold text-gray-900">{session.max_players}</span>
                      </div>
                    </div>
                    {session.image_url && (
                      <div className="w-full sm:w-52">
                        <a
                          href={session.image_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-2xl border border-emerald-200 bg-white p-2"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={session.image_url}
                            alt={`${session.title} session photo`}
                            className="h-32 w-full rounded-xl object-cover"
                          />
                          <span className="mt-2 block text-xs font-semibold text-emerald-700">
                            Open full image
                          </span>
                        </a>
                      </div>
                    )}
                  </div>

                  {session.description && (
                    <p className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 px-4 py-3 text-sm text-gray-700">
                      {session.description}
                    </p>
                  )}
                  {session.curriculum && (
                    <p className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 px-4 py-3 text-sm text-gray-700">
                      <span className="font-semibold text-gray-800">Curriculum:</span>{" "}
                      {session.curriculum}
                    </p>
                  )}

                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Kids</div>
                      <div className="mt-1 text-2xl font-semibold text-gray-900">{totalSignups}</div>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Paid</div>
                      <div className="mt-1 text-2xl font-semibold text-gray-900">{paidSignups}</div>
                    </div>
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Prospects</div>
                      <div className="mt-1 text-2xl font-semibold text-amber-900">{prospectSignups}</div>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Spots Left (Paid)</div>
                      <div className="mt-1 text-2xl font-semibold text-gray-900">{paidSpotsLeft}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <details className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-emerald-700">
                        Edit Session
                      </summary>
                      <form
                        action={updateGroupSessionAction}
                        encType="multipart/form-data"
                        className="mt-3 grid gap-2 md:grid-cols-2"
                      >
                        <input type="hidden" name="session_id" value={session.id} />
                        <input
                          type="hidden"
                          name="existing_image_url"
                          value={session.image_url ?? ""}
                        />
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                          Title
                          <input
                            name="title"
                            required
                            defaultValue={session.title}
                            className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                          Session Date
                          <input
                            name="session_date"
                            type="datetime-local"
                            required
                            defaultValue={toDateTimeLocalValue(session.session_date)}
                            className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                          End Date
                          <input
                            name="session_date_end"
                            type="datetime-local"
                            defaultValue={toDateTimeLocalValue(session.session_date_end)}
                            className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                          Location
                          <input
                            name="location"
                            defaultValue={session.location ?? ""}
                            className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                          Price (USD)
                          <input
                            name="price"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={session.price ?? ""}
                            className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                          Max Players
                          <input
                            name="max_players"
                            type="number"
                            min="0"
                            defaultValue={session.max_players}
                            className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600 md:col-span-2">
                          Upload New Image
                          <input
                            name="image_file"
                            type="file"
                            accept="image/*"
                            className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                          />
                        </label>
                        <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600 md:col-span-2">
                          <input name="remove_image" type="checkbox" className="h-4 w-4" />
                          Remove current image
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600 md:col-span-2">
                          Description
                          <textarea
                            name="description"
                            rows={2}
                            defaultValue={session.description ?? ""}
                            className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-gray-600 md:col-span-2">
                          Curriculum
                          <textarea
                            name="curriculum"
                            rows={2}
                            defaultValue={session.curriculum ?? ""}
                            className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm text-gray-800"
                          />
                        </label>
                        <div className="md:col-span-2">
                          <button
                            type="submit"
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                          >
                            Save Session
                          </button>
                        </div>
                      </form>
                    </details>

                    <form action={deleteGroupSessionAction}>
                      <input type="hidden" name="session_id" value={session.id} />
                      <button
                        type="submit"
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:border-red-300"
                      >
                        Delete Session
                      </button>
                    </form>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div className="overflow-x-auto rounded-2xl border border-emerald-200">
                      <div className="bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                        Paid Players ({paidRows.length})
                      </div>
                      <table className="min-w-full divide-y divide-emerald-200 text-sm">
                        <thead className="bg-emerald-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                          <tr>
                            <th className="px-3 py-2">Player</th>
                            <th className="px-3 py-2">Contact</th>
                            <th className="px-3 py-2">Parent Link</th>
                            <th className="px-3 py-2">Player/Profile Link</th>
                            <th className="px-3 py-2">Created</th>
                            <th className="px-3 py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-emerald-100 bg-white">
                          {paidRows.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-3 py-4 text-gray-600">
                                No paid players for this session.
                              </td>
                            </tr>
                          ) : (
                            paidRows.map((signup) => (
                              <tr key={signup.id} className="align-top">
                                <td className="px-3 py-3">
                                  <div className="font-medium text-gray-900">
                                    {formatPlayerName(signup.first_name, signup.last_name)}
                                  </div>
                                  <div className="text-xs text-gray-600">Signup #{signup.id}</div>
                                  <div className="text-xs text-gray-600">
                                    Birthday: {signup.birthday || "-"}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    Foot: {signup.foot || "-"} | Team: {signup.team || "-"}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    Price: {formatMoney(signup.signup_price)} | Paid:{" "}
                                    {formatMoney(signup.amount_paid)}
                                  </div>
                                  {signup.notes && (
                                    <div className="mt-1 text-xs text-gray-600">Notes: {signup.notes}</div>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-xs text-gray-700">
                                  <div>{signup.contact_email || "-"}</div>
                                  <div>{signup.contact_phone || "-"}</div>
                                  <div>Emergency: {signup.emergency_contact || "-"}</div>
                                </td>
                                <td className="px-3 py-3">
                                  {signup.linked_parent_id ? (
                                    <div className="space-y-1 text-xs">
                                      <div className="text-gray-700">
                                        {signup.linked_parent_name || "Linked parent"}
                                      </div>
                                      <Link
                                        href={`/admin/parent/${signup.linked_parent_id}`}
                                        className="font-semibold text-emerald-700 hover:text-emerald-800"
                                      >
                                        View parent
                                      </Link>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-red-700">Not linked</span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {signup.linked_player_id ? (
                                    <div className="space-y-1 text-xs">
                                      <div className="text-gray-700">
                                        {signup.linked_player_name || "Linked player"}
                                      </div>
                                      <Link
                                        href={`/admin/player/${signup.linked_player_id}`}
                                        className="font-semibold text-emerald-700 hover:text-emerald-800"
                                      >
                                        View player profile
                                      </Link>
                                      {signup.latest_profile_id && (
                                        <div className="text-gray-600">
                                          Latest snapshot: {signup.latest_profile_name || "Profile"} (
                                          {formatDateTime(signup.latest_profile_computed_at)})
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-red-700">Not linked</span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-xs text-gray-600">
                                  <div>{formatDateTime(signup.created_at)}</div>
                                  <div className="text-gray-500">
                                    Updated: {formatDateTime(signup.updated_at)}
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <form action={deleteGroupSessionSignupAction}>
                                    <input type="hidden" name="signup_id" value={signup.id} />
                                    <button
                                      type="submit"
                                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:border-red-300"
                                    >
                                      Remove player
                                    </button>
                                  </form>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-amber-200">
                      <div className="bg-amber-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
                        Prospects ({prospectRows.length})
                      </div>
                      <table className="min-w-full divide-y divide-amber-200 text-sm">
                        <thead className="bg-amber-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                          <tr>
                            <th className="px-3 py-2">Prospect</th>
                            <th className="px-3 py-2">Contact</th>
                            <th className="px-3 py-2">Parent Link</th>
                            <th className="px-3 py-2">Player/Profile Link</th>
                            <th className="px-3 py-2">Created</th>
                            <th className="px-3 py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100 bg-white">
                          {prospectRows.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-3 py-4 text-gray-600">
                                No prospects for this session.
                              </td>
                            </tr>
                          ) : (
                            prospectRows.map((signup) => (
                              <tr key={signup.id} className="align-top">
                                <td className="px-3 py-3">
                                  <div className="font-medium text-gray-900">
                                    {formatPlayerName(signup.first_name, signup.last_name)}
                                  </div>
                                  <div className="text-xs text-gray-600">Signup #{signup.id}</div>
                                  <div className="text-xs text-gray-600">
                                    Birthday: {signup.birthday || "-"}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    Foot: {signup.foot || "-"} | Team: {signup.team || "-"}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    Price: {formatMoney(signup.signup_price)} | Paid:{" "}
                                    {formatMoney(signup.amount_paid)}
                                  </div>
                                  {signup.notes && (
                                    <div className="mt-1 text-xs text-gray-600">Notes: {signup.notes}</div>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-xs text-gray-700">
                                  <div>{signup.contact_email || "-"}</div>
                                  <div>{signup.contact_phone || "-"}</div>
                                  <div>Emergency: {signup.emergency_contact || "-"}</div>
                                </td>
                                <td className="px-3 py-3">
                                  {signup.linked_parent_id ? (
                                    <div className="space-y-1 text-xs">
                                      <div className="text-gray-700">
                                        {signup.linked_parent_name || "Linked parent"}
                                      </div>
                                      <Link
                                        href={`/admin/parent/${signup.linked_parent_id}`}
                                        className="font-semibold text-emerald-700 hover:text-emerald-800"
                                      >
                                        View parent
                                      </Link>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-red-700">Not linked</span>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  {signup.linked_player_id ? (
                                    <div className="space-y-1 text-xs">
                                      <div className="text-gray-700">
                                        {signup.linked_player_name || "Linked player"}
                                      </div>
                                      <Link
                                        href={`/admin/player/${signup.linked_player_id}`}
                                        className="font-semibold text-emerald-700 hover:text-emerald-800"
                                      >
                                        View player profile
                                      </Link>
                                      {signup.latest_profile_id && (
                                        <div className="text-gray-600">
                                          Latest snapshot: {signup.latest_profile_name || "Profile"} (
                                          {formatDateTime(signup.latest_profile_computed_at)})
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-red-700">Not linked</span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-xs text-gray-600">
                                  <div>{formatDateTime(signup.created_at)}</div>
                                  <div className="text-gray-500">
                                    Updated: {formatDateTime(signup.updated_at)}
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <form action={deleteGroupSessionSignupAction}>
                                    <input type="hidden" name="signup_id" value={signup.id} />
                                    <button
                                      type="submit"
                                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:border-red-300"
                                    >
                                      Remove prospect
                                    </button>
                                  </form>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </main>
    </div>
  );
}
