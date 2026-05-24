import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Image from "next/image";

import { authOptions } from "@/lib/auth";
import { sql } from "@/db";
import Link from "next/link";
import { calculateAgeFromBirthdate } from "@/lib/playerAge";
import { ParentPortalHeader } from "@/app/ui/ParentPortalHeader";
import { TrainingRequestButton } from "./ui/TrainingRequestButton";

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
  created_at: string;
  updated_at: string;
};

type ParentRow = {
  email: string | null;
  phone: string | null;
  name: string | null;
  is_admin: boolean;
};

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

  const players = (await sql`
    SELECT
      id,
      name,
      birthdate::text AS birthdate,
      birth_year,
      team_level,
      primary_position,
      secondary_position,
      dominant_foot,
      shirt_size,
      location,
      profile_photo_url,
      strengths,
      focus_areas,
      long_term_development_notes,
      created_at,
      updated_at
    FROM players
    WHERE parent_id = ${parentId}
    ORDER BY created_at DESC
  `) as unknown as PlayerRow[];

  const firstName = parent.name?.split(" ")[0];
  const greeting = firstName ? `Welcome back, ${firstName}` : "Your players";

  const firstPlayer = players[0] ?? null;
  const defaultPlayerName = players.length === 1 ? (firstPlayer?.name ?? "") : "";
  const defaultLocation = players.length === 1 ? (firstPlayer?.location ?? "") : "";

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

              return (
                <Link
                  key={p.id}
                  href={`/player/${p.id}`}
                  className="group rounded-2xl border border-emerald-200 bg-white shadow-sm transition hover:border-emerald-300 hover:shadow-lg"
                >
                  {/* Banner with avatar */}
                  <div className="relative h-20 rounded-t-2xl bg-linear-to-br from-emerald-500 to-emerald-700">
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

        <div className="mt-10 flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-gray-500">New player or ready to add more sessions?</p>
          <TrainingRequestButton />
        </div>
      </main>
    </div>
  );
}
