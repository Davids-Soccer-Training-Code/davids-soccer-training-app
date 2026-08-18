"use client";

import { useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";

import type { CoachSlug } from "@/lib/bookingSchedule";
import { CoachSwitcher } from "@/app/admin/ui/CoachSwitcher";

export type CoachPlayerPackage = {
  type: string;
  total: number;
  // Sessions actually delivered.
  done: number;
  // Sessions on the calendar but not yet run.
  booked: number;
  // Not yet delivered (booked ones included).
  left: number;
  // Not yet delivered and not yet on the calendar.
  unbooked: number;
  // True when the family has more than one player, so the balance below is
  // drawn down by every sibling — not this player alone.
  shared: boolean;
};

export type CoachPlayer = {
  crmPlayerId: number;
  // The app account uuid, or null when this CRM player has no account yet.
  appId: string | null;
  // Kit handed over, and a photo taken with any coach. Tracked per player, not
  // per coach — the same shirt and the same photo count on every roster.
  hasShirt: boolean;
  hasPhoto: boolean;
  name: string;
  parentName: string | null;
  parentAppId: string | null;
  withCoach: number;
  lastSession: string; // YYYY-MM-DD (Arizona)
  // Sessions booked with this coach that haven't happened yet.
  upcoming: number;
  nextSession: string | null; // YYYY-MM-DD (Arizona)
  // Trained in the last six weeks, or has something booked ahead.
  active: boolean;
  pkg: CoachPlayerPackage | null;
  // Labels of the other coaches who have also trained this player. Empty when
  // this coach is the only one.
  otherCoaches: string[];
};

type CoachTab = { slug: CoachSlug; label: string; players: CoachPlayer[] };

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtList(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function fmtPackage(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Package progress: delivered sessions solid, booked-but-not-yet-run in a
// lighter tint, the untouched remainder as bare track. Scaled by the larger of
// the package size and what's actually on it, so an overrun package fills the
// bar instead of spilling past it.
function PackageBar({ pkg }: { pkg: CoachPlayerPackage }) {
  const scale = Math.max(pkg.total, pkg.done + pkg.booked, 1);
  const pct = (n: number) => `${(n / scale) * 100}%`;

  return (
    <div
      className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-gray-100"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={pkg.total}
      aria-valuenow={pkg.done}
      aria-label={`${pkg.done} of ${pkg.total} sessions used, ${pkg.booked} booked`}
    >
      <div className="bg-emerald-600" style={{ width: pct(pkg.done) }} />
      <div className="bg-emerald-300" style={{ width: pct(pkg.booked) }} />
    </div>
  );
}

/**
 * One tick box on a player card. Flips immediately and rolls back if the save
 * fails, so a coach working down a roster is never waiting on the network.
 */
function CheckItem({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
        checked
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <input
        type="checkbox"
        className="h-3.5 w-3.5 accent-emerald-600"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function PlayerCard({ p }: { p: CoachPlayer }) {
  const [hasShirt, setHasShirt] = useState(p.hasShirt);
  const [hasPhoto, setHasPhoto] = useState(p.hasPhoto);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  function save(patch: { hasShirt?: boolean; hasPhoto?: boolean }) {
    const prevShirt = hasShirt;
    const prevPhoto = hasPhoto;
    if (patch.hasShirt !== undefined) setHasShirt(patch.hasShirt);
    if (patch.hasPhoto !== undefined) setHasPhoto(patch.hasPhoto);
    setSaving(true);
    setFailed(false);

    void fetch(`/api/admin/coach-players/${p.crmPlayerId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((res) => {
        if (res.ok) return;
        // Put the box back where it was rather than leaving a tick that never
        // actually saved.
        setHasShirt(prevShirt);
        setHasPhoto(prevPhoto);
        setFailed(true);
      })
      .catch(() => {
        setHasShirt(prevShirt);
        setHasPhoto(prevPhoto);
        setFailed(true);
      })
      .finally(() => setSaving(false));
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {p.appId ? (
            <Link
              href={`/admin/player/${p.appId}`}
              className="text-lg font-bold tracking-tight text-emerald-700 underline-offset-2 hover:underline"
            >
              {p.name}
            </Link>
          ) : (
            <div className="text-lg font-bold tracking-tight text-gray-900">{p.name}</div>
          )}
          <div className="mt-0.5 text-sm text-gray-600">
            {p.parentAppId && p.parentName ? (
              <Link
                href={`/admin/parent/${p.parentAppId}`}
                className="underline-offset-2 hover:underline"
              >
                {p.parentName}
              </Link>
            ) : (
              p.parentName
            )}
          </div>
          {p.upcoming > 0 && p.nextSession && (
            <div className="mt-1 text-xs font-semibold text-emerald-700">
              Next session {fmtDate(p.nextSession)}
              {p.upcoming > 1 ? ` · ${p.upcoming} booked` : ""}
            </div>
          )}
          {p.otherCoaches.length > 0 && (
            <div className="mt-1 text-xs font-medium text-sky-700">
              Also coached by {fmtList(p.otherCoaches)}
            </div>
          )}
          {!p.appId && (
            <div className="mt-1 text-xs font-medium text-amber-700">
              This player does not have an account yet.
            </div>
          )}
        </div>

        <div className="text-right">
          {p.pkg ? (
            <>
              <div className="text-lg font-bold tracking-tight text-emerald-700">
                {p.pkg.left} left
              </div>
              <div className="text-xs text-gray-500">
                {p.pkg.done} of {p.pkg.total} used · {fmtPackage(p.pkg.type)}
              </div>
              {p.pkg.booked > 0 && (
                <div className="text-xs text-gray-500">
                  {p.pkg.booked} booked · {p.pkg.unbooked} not scheduled
                </div>
              )}
              {p.pkg.shared && (
                <span className="mt-1 inline-block rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                  Family package
                </span>
              )}
            </>
          ) : (
            <>
              <div className="text-lg font-bold tracking-tight text-gray-900">
                {p.withCoach} session{p.withCoach === 1 ? "" : "s"}
              </div>
              <div className="text-xs text-gray-500">No package · pay as they go</div>
            </>
          )}
        </div>
      </div>

      {p.pkg && <PackageBar pkg={p.pkg} />}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CheckItem
          label="Shirt"
          checked={hasShirt}
          disabled={saving}
          onChange={(next) => save({ hasShirt: next })}
        />
        <CheckItem
          label="Photo with coach"
          checked={hasPhoto}
          disabled={saving}
          onChange={(next) => save({ hasPhoto: next })}
        />
        {failed && <span className="text-xs font-medium text-red-600">Didn&apos;t save</span>}
      </div>

      {/* The session count already leads the card when there's no package, so
          the footer doesn't repeat it there. */}
      <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
        {p.pkg && (
          <>
            {p.withCoach} session{p.withCoach === 1 ? "" : "s"} with you ·{" "}
          </>
        )}
        last on {fmtDate(p.lastSession)}
      </div>
    </div>
  );
}

// A group of players under its own heading. Renders nothing when empty, so a
// coach whose players are all current never sees an "Out of the program"
// heading with nothing under it.
function Group({
  title,
  hint,
  players,
}: {
  title: string;
  hint: string;
  players: CoachPlayer[];
}) {
  if (players.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500">
          {title}
        </h2>
        <span className="text-xs text-gray-400">
          {players.length} · {hint}
        </span>
      </div>
      <div className="space-y-3">
        {players.map((p) => (
          <PlayerCard key={p.crmPlayerId} p={p} />
        ))}
      </div>
    </section>
  );
}

export function CoachPlayersClient({ coaches }: { coaches: CoachTab[] }) {
  const [active, setActive] = useState<CoachSlug>(coaches[0]?.slug ?? "david");
  const current = coaches.find((c) => c.slug === active) ?? coaches[0];

  const players = current?.players ?? [];
  const inProgram = players.filter((p) => p.active);
  const outOfProgram = players.filter((p) => !p.active);

  return (
    <div>
      <CoachSwitcher
        items={coaches.map((c) => ({ slug: c.slug, label: c.label, count: c.players.length }))}
        active={active}
        onChange={setActive}
      />

      {!current || current.players.length === 0 ? (
        <div className="rounded-3xl border border-emerald-200 bg-white p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-600">
            No players trained by this coach yet.
          </p>
        </div>
      ) : (
        <>
          <Group
            title="In the program"
            hint="Trained in the last 6 weeks, or booked ahead"
            players={inProgram}
          />
          {inProgram.length > 0 && outOfProgram.length > 0 && (
            <hr className="my-8 border-emerald-200" />
          )}
          <Group
            title="Out of the program"
            hint="No session in the last 6 weeks"
            players={outOfProgram}
          />
        </>
      )}
    </div>
  );
}
