import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Image from "next/image";

import { authOptions } from "@/lib/auth";
import { sql } from "@/db";
import { rankBannerGradient, type RankKey } from "@/lib/rankSystem";
import Link from "next/link";
import { calculateAgeFromBirthdate } from "@/lib/playerAge";
import { ParentPortalHeader } from "@/app/ui/ParentPortalHeader";
import { TrainingRequestButton } from "./ui/TrainingRequestButton";
import {
  formatUsdPrice,
  getGroupSessionSignupPrice,
} from "@/lib/groupSessionPricing";

type PlayerRow = {
  id: string;
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
  in_privates: boolean;
  owner_name: string | null;
  created_at: string;
  updated_at: string;
};

type GroupSessionRow = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  session_date: string;
  session_date_end: string | null;
  location: string | null;
  price: number | null;
  curriculum: string | null;
  max_players: number;
  signup_count: number;
};

type ParentRow = {
  email: string | null;
  phone: string | null;
  name: string | null;
  is_admin: boolean;
};

type UpcomingSignupRow = {
  group_session_id: string;
  first_name: string | null;
  last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  emergency_contact: string | null;
};

const GROUP_TIME_ZONE = "America/Phoenix";

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatSessionStart(value: string | null) {
  const date = parseDate(value);
  if (!date) return "—";
  return date.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: GROUP_TIME_ZONE,
  });
}

function formatTime(value: string | null) {
  const date = parseDate(value);
  if (!date) return "—";
  return date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: GROUP_TIME_ZONE,
  });
}

function formatTimeRange(start: string | null, end: string | null) {
  const startTime = formatTime(start);
  const endTime = formatTime(end);
  if (startTime === "—" && endTime === "—") return "—";
  if (endTime === "—") return startTime;
  return `${startTime} - ${endTime}`;
}

function splitPlayerName(name: string) {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) return { firstName: "", lastName: "" };
  const [firstName, ...rest] = cleaned.split(" ");
  return { firstName, lastName: rest.join(" ") };
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function playerInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function PlayersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fplayers");
  }

  const parentId = session.user.id;
  if (!parentId) {
    redirect("/login?callbackUrl=%2Fplayers");
  }

  const parentRows = (await sql`
    SELECT email, phone, name, is_admin
    FROM parents
    WHERE id = ${parentId}
    LIMIT 1
  `) as unknown as ParentRow[];
  const parent = parentRows[0] ?? {
    email: null,
    phone: null,
    name: null,
    is_admin: false,
  };

  // Admins can see every player from the portal (handy for jumping into any
  // player); regular parents only see their own.
  const players = (
    parent.is_admin
      ? await sql`
          SELECT
            p.id, p.name, p.birthdate::text AS birthdate, p.birth_year,
            p.team_level, p.primary_position, p.secondary_position,
            p.dominant_foot, p.shirt_size, p.location, p.profile_photo_url,
            p.strengths, p.focus_areas, p.long_term_development_notes,
            p.in_privates, owner.name AS owner_name,
            p.created_at, p.updated_at
          FROM players p
          LEFT JOIN parents owner ON owner.id = p.parent_id
          ORDER BY p.created_at DESC
        `
      : await sql`
          SELECT
            id, name, birthdate::text AS birthdate, birth_year,
            team_level, primary_position, secondary_position,
            dominant_foot, shirt_size, location, profile_photo_url,
            strengths, focus_areas, long_term_development_notes,
            in_privates, NULL AS owner_name,
            created_at, updated_at
          FROM players
          WHERE parent_id = ${parentId}
          ORDER BY created_at DESC
        `
  ) as unknown as PlayerRow[];

  const hasPrivatePackagePlayer = players.some((p) => p.in_privates);

  // Latest computed overall rank per player (for tinting the card banner).
  const rankRows = (await sql`
    SELECT DISTINCT ON (player_id)
      player_id::text AS player_id,
      data->'ranks'->'overall'->>'rank' AS rank
    FROM player_profiles
    ORDER BY player_id, computed_at DESC, created_at DESC
  `) as unknown as Array<{ player_id: string; rank: string | null }>;
  const rankByPlayer = new Map(rankRows.map((r) => [r.player_id, r.rank]));

  const groupSessions = (await sql`
    SELECT
      gs.id::text AS id,
      gs.title,
      gs.description,
      gs.image_url,
      gs.session_date::text AS session_date,
      gs.session_date_end::text AS session_date_end,
      gs.location,
      gs.price::float8 AS price,
      gs.curriculum,
      gs.max_players,
      COUNT(ps.id)::int AS signup_count
    FROM group_sessions gs
    LEFT JOIN player_signups ps
      ON ps.group_session_id = gs.id
      AND ps.has_paid = true
    WHERE COALESCE(gs.session_date_end, gs.session_date) >= NOW()
    GROUP BY
      gs.id,
      gs.title,
      gs.description,
      gs.image_url,
      gs.session_date,
      gs.session_date_end,
      gs.location,
      gs.price,
      gs.curriculum,
      gs.max_players,
      gs.created_at
    ORDER BY gs.session_date ASC, gs.created_at ASC
  `) as unknown as GroupSessionRow[];

  const upcomingSignups = (await sql`
    SELECT
      ps.group_session_id::text AS group_session_id,
      ps.first_name,
      ps.last_name,
      ps.contact_email,
      ps.contact_phone,
      ps.emergency_contact
    FROM player_signups ps
    JOIN group_sessions gs ON gs.id = ps.group_session_id
    WHERE COALESCE(gs.session_date_end, gs.session_date) >= NOW()
      AND ps.has_paid = true
  `) as unknown as UpcomingSignupRow[];

  const playerFullNames = new Set(
    players.map((p) => normalizeText(p.name)).filter(Boolean)
  );
  const playerFirstLast = new Set(
    players
      .flatMap((p) => {
        const split = splitPlayerName(p.name);
        const first = normalizeText(split.firstName);
        const last = normalizeText(split.lastName);
        const values = [`${first}|${last}`];
        if (!last) values.push(`${first}|player`);
        return values;
      })
      .filter((value) => value !== "|")
  );
  const parentEmail = normalizeText(parent.email);
  const parentPhoneDigits = normalizeDigits(parent.phone);
  const parentName = normalizeText(parent.name);

  const alreadySignedUpSessionIds = new Set(
    upcomingSignups
      .filter((signup) => {
        const signupEmail = normalizeText(signup.contact_email);
        const signupPhoneDigits = normalizeDigits(signup.contact_phone);
        const emergencyContactText = normalizeText(signup.emergency_contact);
        const emergencyContactDigits = normalizeDigits(signup.emergency_contact);
        const signupFirst = normalizeText(signup.first_name);
        const signupLast = normalizeText(signup.last_name);
        const signupFull = normalizeText(
          `${signup.first_name ?? ""} ${signup.last_name ?? ""}`
        );

        const emailMatch = Boolean(parentEmail && signupEmail === parentEmail);
        const phoneMatch = Boolean(
          parentPhoneDigits &&
            (signupPhoneDigits === parentPhoneDigits ||
              emergencyContactDigits.includes(parentPhoneDigits))
        );
        const parentNameMatch = Boolean(
          parentName && emergencyContactText.includes(parentName)
        );
        const playerNameMatch = Boolean(
          (signupFull && playerFullNames.has(signupFull)) ||
            playerFirstLast.has(`${signupFirst}|${signupLast}`)
        );

        return emailMatch || phoneMatch || parentNameMatch || playerNameMatch;
      })
      .map((signup) => signup.group_session_id)
  );

  const firstName = parent.name?.split(" ")[0];
  const greeting = firstName ? `Welcome back, ${firstName}` : "Your players";

  return (
    <div className="min-h-screen bg-emerald-50">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-emerald-50 via-white to-white" />

      <ParentPortalHeader
        title={greeting}
        subtitle="Tap a player to view their profile and track their progress."
        isAdmin={parent.is_admin}
        email={parent.email}
        phone={parent.phone}
      />

      <main className="relative mx-auto max-w-6xl px-6 py-12">
        {players.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
            No players yet. Player profiles are created by Coach David after
            your private session.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {players.map((p) => {
              const age = calculateAgeFromBirthdate(p.birthdate);
              const initials = playerInitials(p.name);
              const rankKey = (rankByPlayer.get(p.id) ?? null) as RankKey | null;
              const banner = rankKey ? rankBannerGradient(rankKey) : null;

              return (
                <Link
                  key={p.id}
                  href={`/player/${p.id}`}
                  className="group rounded-2xl border border-emerald-200 bg-white shadow-sm transition hover:border-emerald-300 hover:shadow-lg"
                >
                  {/* Banner with avatar — tinted by rank when available */}
                  <div
                    className={`relative h-20 rounded-t-2xl ${
                      banner
                        ? ""
                        : "bg-linear-to-br from-emerald-500 to-emerald-700"
                    }`}
                    style={
                      banner
                        ? {
                            backgroundImage: `linear-gradient(to bottom right, ${banner.from}, ${banner.to})`,
                          }
                        : undefined
                    }
                  >
                    <div className="absolute bottom-0 left-5 translate-y-1/2">
                      {p.profile_photo_url ? (
                        <Image
                          src={p.profile_photo_url}
                          alt={p.name}
                          width={64}
                          height={64}
                          className="h-16 w-16 rounded-full border-4 border-white object-cover shadow-md"
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-emerald-100 shadow-md">
                          <span className="text-xl font-bold text-emerald-700">
                            {initials}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="px-5 pb-5 pt-11">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-lg font-bold text-gray-900">
                          {p.name}
                        </div>
                        {p.team_level && (
                          <div className="mt-0.5 text-sm text-gray-500">
                            {p.team_level}
                          </div>
                        )}
                        {parent.is_admin && p.owner_name && (
                          <div className="mt-0.5 text-xs text-gray-400">
                            Parent: {p.owner_name}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-emerald-600 transition-transform group-hover:translate-x-0.5">
                        View →
                      </span>
                    </div>

                    {/* Attribute pills */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.primary_position && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          {p.primary_position}
                          {p.secondary_position
                            ? ` / ${p.secondary_position}`
                            : ""}
                        </span>
                      )}
                      {age !== null && (
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                          Age {age}
                        </span>
                      )}
                      {p.dominant_foot && (
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                          {p.dominant_foot} foot
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <section className="mt-10">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Upcoming Group Sessions
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Group sessions help players train with game-like intensity, build
              confidence with teammates, and get more quality repetitions.
            </p>
          </div>

          {groupSessions.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
              No upcoming group sessions are posted yet. Check back soon.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groupSessions.map((groupSession) => {
                const alreadySignedUp = alreadySignedUpSessionIds.has(groupSession.id);
                const standardSignupPrice = getGroupSessionSignupPrice(
                  false,
                  groupSession.price
                );
                const privateSignupPrice = getGroupSessionSignupPrice(
                  true,
                  groupSession.price
                );

                return (
                  <Link
                    key={groupSession.id}
                    href={`/group-sessions/${groupSession.id}`}
                    className="group block overflow-hidden rounded-3xl border border-emerald-300 bg-emerald-500 shadow-sm transition hover:border-emerald-400 hover:shadow-md"
                  >
                    {groupSession.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={groupSession.image_url}
                        alt={groupSession.title}
                        className="h-52 w-full bg-white object-contain p-6"
                      />
                    ) : (
                      <div className="flex h-52 w-full items-center justify-center bg-white p-6">
                        <Image
                          src="/icon.png"
                          alt="David's Soccer Training"
                          width={200}
                          height={200}
                          className="h-28 w-28 object-contain"
                        />
                      </div>
                    )}

                    <div className="bg-emerald-500 p-6 text-emerald-50">
                      <h3 className="text-2xl font-bold leading-tight text-white">
                        {groupSession.title}
                      </h3>
                      <div className="mt-4 space-y-2 text-base leading-snug text-emerald-50/95">
                        <p>
                          <span className="font-semibold text-white">When:</span>{" "}
                          {formatSessionStart(groupSession.session_date)}
                        </p>
                        <p>
                          <span className="font-semibold text-white">Time:</span>{" "}
                          {formatTimeRange(
                            groupSession.session_date,
                            groupSession.session_date_end
                          )}
                        </p>
                        <p>
                          <span className="font-semibold text-white">Location:</span>{" "}
                          {groupSession.location ?? "TBD"}
                        </p>
                        <p>
                          <span className="font-semibold text-white">Price:</span>{" "}
                          {hasPrivatePackagePlayer ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="text-emerald-100 line-through">
                                {formatUsdPrice(standardSignupPrice)}
                              </span>
                              <span className="font-bold text-white">
                                {formatUsdPrice(privateSignupPrice)}
                              </span>
                            </span>
                          ) : (
                            `${formatUsdPrice(standardSignupPrice)} per signup`
                          )}
                        </p>
                        {hasPrivatePackagePlayer ? (
                          <p className="text-sm text-emerald-100">
                            Private package players get the discounted signup rate.
                          </p>
                        ) : null}
                        <p className="text-white">
                          {groupSession.max_players > 0
                            ? `${Math.max(
                                groupSession.max_players - groupSession.signup_count,
                                0
                              )} spots remaining`
                            : "Open enrollment"}
                        </p>
                      </div>

                      {groupSession.curriculum ? (
                        <p className="mt-4 text-sm leading-snug text-emerald-50/95">
                          Focus: {groupSession.curriculum}
                        </p>
                      ) : null}

                      {alreadySignedUp ? (
                        <p className="mt-4 rounded-lg bg-emerald-700/30 px-3 py-2 text-sm font-semibold text-white">
                          Already signed up. Email davidfalesct@gmail.com to cancel/reschedule.
                        </p>
                      ) : null}

                      <div className="mt-6 inline-flex rounded-full bg-white px-5 py-2 text-lg font-bold text-emerald-900 transition group-hover:bg-emerald-50">
                        {alreadySignedUp ? "Already Signed Up" : "View Details & Sign Up"}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <div className="mt-10 flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-gray-500">New player or ready to add more sessions?</p>
          <TrainingRequestButton />
        </div>
      </main>
    </div>
  );
}
