"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Mail,
  MessageSquare,
  Pencil,
  Printer,
  Search,
  Users,
} from "lucide-react";

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
  // The player's own details, already resolved best-source-first by the page
  // query: the app account, then the app-side details table, then the CRM.
  age: number | null;
  // Only an app account carries a real birthday. When it's set, it beats any
  // hand-typed age — that number goes stale every year.
  birthdate: string | null; // YYYY-MM-DD
  team: string | null;
  position: string | null;
  // Shown beside the primary position; app accounts only, and not editable
  // here — the profile page owns it.
  secondaryPosition: string | null;
  coachNotes: string | null;
  // The CRM's intake note. Read-only: it's what the family said when they
  // signed up, not something a coach should overwrite from the roster.
  crmNotes: string | null;
  // An upcoming session has nobody attached to it in the CRM, and this player
  // was matched to it only by being in the family that booked.
  unconfirmed: boolean;
  parentName: string | null;
  parentAppId: string | null;
  // Contact details live on the card because /admin/parent is owner-only — a
  // coach following the parent link just hits the unlock screen.
  parentPhone: string | null;
  parentEmail: string | null;
  secondParentName: string | null;
  withCoach: number;
  // Null for a player who is booked but has never trained with this coach yet.
  lastSession: string | null; // YYYY-MM-DD (Arizona)
  // Sessions booked with this coach that haven't happened yet.
  upcoming: number;
  nextSession: string | null; // YYYY-MM-DD (Arizona)
  // Trained in the last six weeks, or has something booked ahead.
  active: boolean;
  // Trained in the last six weeks. `active` also counts booked-ahead players,
  // but only these end up on the printed score card.
  recent: boolean;
  pkg: CoachPlayerPackage | null;
  // Labels of the other coaches who have also trained this player. Empty when
  // this coach is the only one.
  otherCoaches: string[];
};

type CoachTab = { slug: CoachSlug; label: string; players: CoachPlayer[] };

// The DOM id of a player's card. The coach calendar links names here
// (/admin/coach-players?coach=…&player=<crmPlayerId>), so this is the one place
// that decides what that id looks like.
export function cardId(crmPlayerId: number): string {
  return `player-${crmPlayerId}`;
}

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

// Numbers come from two places with no agreed format — the CRM stores whatever
// was typed in, the app stores bare digits. Display a US 10-digit number the
// familiar way and leave anything else (extensions, international) alone.
function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

// Everything a coach might type to find a player: their name, either parent,
// and the contact details themselves — phone digits with the punctuation
// stripped, so "6025551234" matches a number stored as "(602) 555-1234".
function haystack(p: CoachPlayer): string {
  return [
    p.name,
    p.team ?? "",
    p.position ?? "",
    p.parentName ?? "",
    p.secondParentName ?? "",
    p.parentEmail ?? "",
    p.parentPhone ?? "",
    (p.parentPhone ?? "").replace(/\D/g, ""),
  ]
    .join(" ")
    .toLowerCase();
}

function matches(p: CoachPlayer, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = haystack(p);
  // Every word has to land somewhere, so "jack 602" narrows instead of
  // widening the way a plain substring search would.
  return q.split(/\s+/).every((word) => hay.includes(word));
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

/**
 * The parent's phone and email, right on the card. The parent link above goes
 * to /admin/parent, which is owner-only — so for a coach it's a locked door.
 * These are real links, not text, so a coach on a phone can tap to call or
 * text without copying digits by hand.
 */
function ContactRow({ p }: { p: CoachPlayer }) {
  if (!p.parentPhone && !p.parentEmail) {
    return (
      <div className="mt-1.5 text-xs text-gray-400">No contact details on file</div>
    );
  }

  const chip =
    "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800";

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {p.parentPhone && (
        // Texting, not calling: a coach tapping a parent's number on the roster
        // is almost always sending a quick message about a session, and a
        // mis-tap that starts a phone call is a far worse accident than one that
        // opens an empty draft. The href keeps the raw digits; only the label is
        // prettied up.
        <a href={`sms:${p.parentPhone.replace(/[^\d+]/g, "")}`} className={chip}>
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          {fmtPhone(p.parentPhone)}
        </a>
      )}
      {p.parentEmail && (
        <a href={`mailto:${p.parentEmail}`} className={chip}>
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{p.parentEmail}</span>
        </a>
      )}
    </div>
  );
}

// The age to trust. A birthday on the app account is the only source that
// stays right without anyone maintaining it, so it wins over the number the
// CRM (or a coach) typed in at some point in the past.
function ageFromBirthdate(birthdate: string): number {
  const dob = new Date(birthdate + "T12:00:00");
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function displayAge(d: PlayerDetails): number | null {
  if (d.birthdate) return ageFromBirthdate(d.birthdate);
  return d.age;
}

// The four editable facts about the player, kept together so the card, the
// form and the save all move the same object.
export type PlayerDetails = {
  age: number | null;
  birthdate: string | null;
  team: string | null;
  position: string | null;
  secondaryPosition: string | null;
  notes: string | null;
};

/**
 * Age, team and position as chips. A missing one still gets a chip — a muted
 * "Add team" — so a coach scanning the roster can see which new players have
 * nothing on file rather than having them look identical to filled-in ones.
 */
function DetailChips({
  d,
  onEdit,
}: {
  d: PlayerDetails;
  onEdit: () => void;
}) {
  const age = displayAge(d);
  const position = d.secondaryPosition
    ? `${d.position} / ${d.secondaryPosition}`
    : d.position;

  const items: Array<{ value: string | null; empty: string }> = [
    { value: age !== null ? `Age ${age}` : null, empty: "Add age" },
    { value: d.team, empty: "Add team" },
    { value: position, empty: "Add position" },
  ];

  const set =
    "rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700";
  const unset =
    "rounded-lg border border-dashed border-gray-300 px-2 py-1 text-xs font-medium text-gray-400";

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <span key={item.empty} className={item.value ? set : unset}>
          {item.value ?? item.empty}
        </span>
      ))}
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
      >
        <Pencil className="h-3 w-3" />
        Edit
      </button>
    </div>
  );
}

/**
 * The CRM's intake note — what the family said when they signed up. Stays on
 * the card while the coach note is being edited, because it's usually the
 * context they're writing against.
 */
function CrmNote({ note }: { note: string | null }) {
  if (!note) return null;
  return (
    <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        From the CRM
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-500">{note}</p>
    </div>
  );
}

/**
 * The coach's own note. A separate box from the CRM's, rather than one field
 * that overwrites it — they're two different things.
 */
function CoachNote({ note }: { note: string | null }) {
  if (!note) return null;
  return (
    <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
        Coach notes
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-700">{note}</p>
    </div>
  );
}

/**
 * The inline edit form. Replaces the chips and notes while open, so the card
 * doesn't show the same fact twice in two states.
 */
function DetailsForm({
  draft,
  setDraft,
  saving,
  onSave,
  onCancel,
}: {
  draft: PlayerDetails;
  setDraft: (next: PlayerDetails) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const input =
    "w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 disabled:bg-gray-50 disabled:text-gray-500";
  const label = "text-[11px] font-semibold uppercase tracking-wide text-gray-500";

  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={label}>Age</label>
          <input
            type="number"
            min={3}
            max={25}
            className={`${input} mt-1`}
            value={draft.birthdate ? displayAge(draft) ?? "" : draft.age ?? ""}
            disabled={saving || Boolean(draft.birthdate)}
            onChange={(e) =>
              setDraft({
                ...draft,
                age: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
          {draft.birthdate && (
            // A real birthday is better data than a number anyone types here,
            // so the box is locked rather than fighting the profile page.
            <p className="mt-1 text-[11px] text-gray-500">
              From their birthday — change it on the player&apos;s profile.
            </p>
          )}
        </div>
        <div>
          <label className={label}>Team</label>
          <input
            type="text"
            className={`${input} mt-1`}
            value={draft.team ?? ""}
            disabled={saving}
            placeholder="e.g. Rush SC 11B"
            onChange={(e) => setDraft({ ...draft, team: e.target.value || null })}
          />
        </div>
        <div>
          <label className={label}>Position</label>
          <input
            type="text"
            className={`${input} mt-1`}
            value={draft.position ?? ""}
            disabled={saving}
            placeholder="e.g. Center Mid"
            onChange={(e) => setDraft({ ...draft, position: e.target.value || null })}
          />
        </div>
      </div>

      <div className="mt-3">
        <label className={label}>Coach notes</label>
        <textarea
          rows={3}
          className={`${input} mt-1 resize-y`}
          value={draft.notes ?? ""}
          disabled={saving}
          placeholder="What this player needs to work on, what motivates them, anything a coach should know."
          onChange={(e) => setDraft({ ...draft, notes: e.target.value || null })}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function PlayerCard({ p, focused }: { p: CoachPlayer; focused: boolean }) {
  const [hasShirt, setHasShirt] = useState(p.hasShirt);
  const [hasPhoto, setHasPhoto] = useState(p.hasPhoto);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const [details, setDetails] = useState<PlayerDetails>({
    age: p.age,
    birthdate: p.birthdate,
    team: p.team,
    position: p.position,
    secondaryPosition: p.secondaryPosition,
    notes: p.coachNotes,
  });
  const [draft, setDraft] = useState<PlayerDetails>(details);
  const [editing, setEditing] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsFailed, setDetailsFailed] = useState(false);

  function saveDetails() {
    setSavingDetails(true);
    setDetailsFailed(false);

    void fetch(`/api/admin/coach-players/${p.crmPlayerId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        // The age box is locked when a birthday is on file, so there is
        // nothing to send for those players.
        age: draft.birthdate ? undefined : draft.age,
        team: draft.team,
        position: draft.position,
        notes: draft.notes,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("save failed");
        setDetails(draft);
        setEditing(false);
      })
      // The form stays open with what the coach typed still in it, so a failed
      // save never costs them the text they just wrote.
      .catch(() => setDetailsFailed(true))
      .finally(() => setSavingDetails(false));
  }

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
    <div
      id={cardId(p.crmPlayerId)}
      // scroll-mt keeps the card clear of the sticky header when it's scrolled
      // to; the ring fades out on its own once they've spotted it.
      className={`scroll-mt-24 rounded-2xl border bg-white p-4 shadow-sm transition ${
        focused
          ? "border-emerald-400 ring-2 ring-emerald-300"
          : "border-emerald-200"
      }`}
    >
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
            {p.secondParentName && (
              <span className="text-gray-500"> &amp; {p.secondParentName}</span>
            )}
          </div>
          <ContactRow p={p} />
          {!editing && (
            <DetailChips
              d={details}
              onEdit={() => {
                setDraft(details);
                setDetailsFailed(false);
                setEditing(true);
              }}
            />
          )}
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
          {p.unconfirmed && (
            <div className="mt-1 text-xs font-medium text-amber-700">
              No player attached to that session in the CRM — showing the family
              who booked it. Confirm who&apos;s coming.
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
                {p.withCoach === 0
                  ? "New player"
                  : `${p.withCoach} session${p.withCoach === 1 ? "" : "s"}`}
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
        {/* Same one-page coaching sheet as the player admin page. This page is
            session-authenticated, so it can be a plain link rather than the
            security-code fetch the standalone player page needs. */}
        {p.appId && (
          <a
            href={`/api/admin/players/${p.appId}/print`}
            target="_blank"
            rel="noopener noreferrer"
            title="One-page A4 coaching sheet"
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-50"
          >
            <Printer className="h-3.5 w-3.5" />
            Print sheet
          </a>
        )}
      </div>

      <CrmNote note={p.crmNotes} />

      {editing ? (
        <>
          <DetailsForm
            draft={draft}
            setDraft={setDraft}
            saving={savingDetails}
            onSave={saveDetails}
            onCancel={() => {
              setDraft(details);
              setDetailsFailed(false);
              setEditing(false);
            }}
          />
          {detailsFailed && (
            <p className="mt-2 text-xs font-medium text-red-600">
              Didn&apos;t save — try again.
            </p>
          )}
        </>
      ) : (
        <CoachNote note={details.notes} />
      )}

      {/* The session count already leads the card when there's no package, so
          the footer doesn't repeat it there. */}
      <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
        {p.lastSession === null ? (
          // Booked but never trained with this coach. Saying "last on —" would
          // read as missing data rather than as a player they haven't met.
          "Booked in — no session with you yet"
        ) : (
          <>
            {p.pkg && (
              <>
                {p.withCoach} session{p.withCoach === 1 ? "" : "s"} with you ·{" "}
              </>
            )}
            last on {fmtDate(p.lastSession)}
          </>
        )}
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
  focus,
}: {
  title: string;
  hint: string;
  players: CoachPlayer[];
  focus: number | null;
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
          <PlayerCard key={p.crmPlayerId} p={p} focused={p.crmPlayerId === focus} />
        ))}
      </div>
    </section>
  );
}

export function CoachPlayersClient({
  coaches,
  initialCoach,
  focusPlayer,
}: {
  coaches: CoachTab[];
  // Both come from the URL, which is how the coach calendar hands a player
  // over: it names the tab and the card to land on.
  initialCoach: CoachSlug | null;
  focusPlayer: number | null;
}) {
  const [active, setActive] = useState<CoachSlug>(
    initialCoach ?? coaches[0]?.slug ?? "david"
  );
  const [query, setQuery] = useState("");
  const current = coaches.find((c) => c.slug === active) ?? coaches[0];

  // Arriving from the calendar: put the linked player's card on screen. It runs
  // after the tab is set, so a player on another coach's tab still lands right.
  // The ring is dropped as soon as they touch the page — it's a "here they are",
  // not a selection that needs clearing.
  const [focused, setFocused] = useState<number | null>(focusPlayer);
  const scrolledTo = useRef<number | null>(null);

  useEffect(() => {
    if (focusPlayer == null || scrolledTo.current === focusPlayer) return;
    const el = document.getElementById(cardId(focusPlayer));
    if (!el) return;
    // A frame later than the navigation's own scroll-to-top, which would
    // otherwise cancel this one halfway. The "already done" mark is set inside
    // the frame, not before it: an effect that gets cleaned up before its frame
    // runs — which is every mount under StrictMode — must be free to try again.
    const frame = requestAnimationFrame(() => {
      scrolledTo.current = focusPlayer;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusPlayer, active]);

  useEffect(() => {
    if (focused == null) return;
    const drop = () => setFocused(null);
    // Any deliberate move by the coach means they've found them.
    window.addEventListener("pointerdown", drop, { once: true });
    window.addEventListener("keydown", drop, { once: true });
    return () => {
      window.removeEventListener("pointerdown", drop);
      window.removeEventListener("keydown", drop);
    };
  }, [focused]);

  // While searching, the tab badges count matches instead of roster size — a
  // coach who searches a player they've never trained can see at a glance
  // which coach does have them, rather than checking every tab by hand.
  const counts = useMemo(
    () =>
      new Map(
        coaches.map((c) => [c.slug, c.players.filter((p) => matches(p, query)).length])
      ),
    [coaches, query]
  );

  const players = useMemo(
    () => (current?.players ?? []).filter((p) => matches(p, query)),
    [current, query]
  );

  // What the printed score card will actually contain: trained recently, not
  // merely booked ahead. Kept off `query` so the badge doesn't move while the
  // coach is searching.
  const recentCount = useMemo(
    () => (current?.players ?? []).filter((p) => p.recent).length,
    [current]
  );

  const searching = query.trim().length > 0;
  const inProgram = players.filter((p) => p.active);
  const outOfProgram = players.filter((p) => !p.active);
  // Where else this player turned up, so a fruitless search on one tab points
  // at the tab that does have them.
  const elsewhere = searching
    ? coaches.filter((c) => c.slug !== active && (counts.get(c.slug) ?? 0) > 0)
    : [];

  // Switching tabs by hand replaces the URL rather than pushing, so flicking
  // between coaches doesn't fill the Back button — and it drops the linked
  // player, who belongs to the tab they arrived on.
  function pickCoach(slug: CoachSlug) {
    setActive(slug);
    setFocused(null);
    const url = new URL(window.location.href);
    url.searchParams.set("coach", slug);
    url.searchParams.delete("player");
    window.history.replaceState(null, "", url);
  }

  return (
    <div>
      <CoachSwitcher
        items={coaches.map((c) => ({
          slug: c.slug,
          label: c.label,
          count: counts.get(c.slug) ?? 0,
        }))}
        active={active}
        onChange={pickCoach}
      />

      <div className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder="Search player, parent, phone, or email..."
              aria-label="Search players"
              className="w-full rounded-xl border border-emerald-200 bg-white py-2 pl-9 pr-3 text-gray-900 placeholder:text-gray-500 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
            />
          </div>
          {/* One printable page of blank score cells for everyone this coach
              has trained in the last six weeks. */}
          <a
            href={`/api/admin/coach-players/score-card?coach=${active}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            <ClipboardList className="h-4 w-4" />
            Score card
            {recentCount > 0 && (
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-xs font-bold">
                {recentCount}
              </span>
            )}
          </a>
        </div>
        {searching && (
          <p className="mt-2 text-xs text-gray-500">
            {players.length} match{players.length === 1 ? "" : "es"} on{" "}
            {current?.label ?? "this coach"}
            {elsewhere.length > 0 && (
              <>
                {" · also "}
                {elsewhere.map((c) => `${c.label} (${counts.get(c.slug)})`).join(", ")}
              </>
            )}
          </p>
        )}
      </div>

      {!current || current.players.length === 0 ? (
        <div className="rounded-3xl border border-emerald-200 bg-white p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-600">
            No players on this coach&apos;s roster yet.
          </p>
        </div>
      ) : players.length === 0 ? (
        <div className="rounded-3xl border border-emerald-200 bg-white p-10 text-center">
          <Search className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-600">
            No player matches &ldquo;{query.trim()}&rdquo; on this coach&apos;s roster.
          </p>
          {elsewhere.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {elsewhere.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => setActive(c.slug)}
                  className="rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300"
                >
                  {c.label} ({counts.get(c.slug)})
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <Group
            title="In the program"
            hint="Trained in the last 6 weeks, or booked ahead"
            players={inProgram}
            focus={focused}
          />
          {inProgram.length > 0 && outOfProgram.length > 0 && (
            <hr className="my-8 border-emerald-200" />
          )}
          <Group
            title="Out of the program"
            hint="No session in the last 6 weeks"
            players={outOfProgram}
            focus={focused}
          />
        </>
      )}
    </div>
  );
}
