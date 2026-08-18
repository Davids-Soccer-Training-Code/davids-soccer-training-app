"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { ImagePlus, Plus, Star, Trash2 } from "lucide-react";
import {
  isWholeHourBlock,
  scheduleToPeriodHours,
  type CoachLocation,
  type CoachSchedule,
  type CoachSlug,
  type DayBlocks,
  type SchedulePeriod,
} from "@/lib/bookingSchedule";
import { CoachSwitcher } from "@/app/admin/ui/CoachSwitcher";

export type EditableCoach = {
  slug: CoachSlug;
  label: string;
  role: string | null;
  bio: string;
  photoUrl: string | null;
  schedule: CoachSchedule;
  horizonMonths: number;
  locations: CoachLocation[];
};

// A location with a stable client id for React keys.
type UiLocation = CoachLocation & { uid: string };

// Week rendered Monday-first, Sunday last.
const WEEK: { dow: number; label: string }[] = [
  { dow: 1, label: "Monday" },
  { dow: 2, label: "Tuesday" },
  { dow: 3, label: "Wednesday" },
  { dow: 4, label: "Thursday" },
  { dow: 5, label: "Friday" },
  { dow: 6, label: "Saturday" },
  { dow: 0, label: "Sunday" },
];

// A period with a stable client id for React keys.
type UiPeriod = { uid: string; start: string | null; end: string | null; days: DayBlocks };

function emptyDays(): DayBlocks {
  const d: DayBlocks = {};
  for (let i = 0; i <= 6; i++) d[String(i)] = [];
  return d;
}

function toUi(schedule: CoachSchedule): UiPeriod[] {
  return schedule.map((p) => {
    const days = emptyDays();
    for (let i = 0; i <= 6; i++) {
      days[String(i)] = (p.days[String(i)] ?? []).map((b) => ({ start: b.start, end: b.end }));
    }
    return { uid: crypto.randomUUID(), start: p.start, end: p.end, days };
  });
}

function fromUi(periods: UiPeriod[]): CoachSchedule {
  return periods.map(({ start, end, days }): SchedulePeriod => ({ start, end, days }));
}

// Fallback monogram for a coach with no headshot yet.
function initialsOf(label: string) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function CoachCard({ initial }: { initial: EditableCoach }) {
  const [periods, setPeriods] = useState<UiPeriod[]>(() => toUi(initial.schedule));
  const [horizon, setHorizon] = useState(String(initial.horizonMonths));
  const [role, setRole] = useState(initial.role ?? "");
  const [bio, setBio] = useState(initial.bio);
  const [photoUrl, setPhotoUrl] = useState<string | null>(initial.photoUrl);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [locations, setLocations] = useState<UiLocation[]>(() =>
    initial.locations.map((l) => ({ ...l, uid: crypto.randomUUID() }))
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // ── Location mutators ──
  function addLocation() {
    setLocations((prev) => [
      ...prev,
      { uid: crypto.randomUUID(), city: "", address: "", preferred: prev.length === 0 },
    ]);
  }
  function removeLocation(uid: string) {
    setLocations((prev) => {
      const next = prev.filter((l) => l.uid !== uid);
      // If we removed the preferred one, promote the first remaining location.
      if (next.length > 0 && !next.some((l) => l.preferred)) next[0].preferred = true;
      return [...next];
    });
  }
  function setLocationField(uid: string, field: "city" | "address", value: string) {
    setLocations((prev) => prev.map((l) => (l.uid === uid ? { ...l, [field]: value } : l)));
  }
  function setPreferred(uid: string) {
    setLocations((prev) => prev.map((l) => ({ ...l, preferred: l.uid === uid })));
  }

  // Any invalid (non-whole-hour) block blocks saving.
  const hasErrors = useMemo(
    () =>
      periods.some((p) =>
        WEEK.some(({ dow }) => (p.days[String(dow)] ?? []).some((b) => !isWholeHourBlock(b)))
      ),
    [periods]
  );

  const preview = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return scheduleToPeriodHours(fromUi(periods), today);
  }, [periods]);

  // ── Mutators ──
  function patchPeriod(uid: string, fn: (p: UiPeriod) => UiPeriod) {
    setPeriods((prev) => prev.map((p) => (p.uid === uid ? fn(p) : p)));
  }
  function addPeriod() {
    setPeriods((prev) => [...prev, { uid: crypto.randomUUID(), start: null, end: null, days: emptyDays() }]);
  }
  function removePeriod(uid: string) {
    setPeriods((prev) => prev.filter((p) => p.uid !== uid));
  }
  function setPeriodDate(uid: string, which: "start" | "end", value: string) {
    patchPeriod(uid, (p) => ({ ...p, [which]: value || null }));
  }
  function addBlock(uid: string, dow: number) {
    patchPeriod(uid, (p) => ({
      ...p,
      days: { ...p.days, [String(dow)]: [...(p.days[String(dow)] ?? []), { start: "08:00", end: "09:00" }] },
    }));
  }
  function removeBlock(uid: string, dow: number, idx: number) {
    patchPeriod(uid, (p) => ({
      ...p,
      days: { ...p.days, [String(dow)]: (p.days[String(dow)] ?? []).filter((_, i) => i !== idx) },
    }));
  }
  function setBlockTime(uid: string, dow: number, idx: number, which: "start" | "end", value: string) {
    patchPeriod(uid, (p) => ({
      ...p,
      days: {
        ...p.days,
        [String(dow)]: (p.days[String(dow)] ?? []).map((b, i) =>
          i === idx ? { ...b, [which]: value } : b
        ),
      },
    }));
  }

  // Uploads the picked file straight away and swaps the preview. The URL is
  // only written to the DB when the card is saved, which is also what deletes
  // the photo this one replaces.
  async function uploadPhoto(file: File) {
    setUploading(true);
    setError(null);
    setStatus("idle");
    try {
      const form = new FormData();
      form.append("slug", initial.slug);
      form.append("file", file);
      const res = await fetch("/api/admin/coaches/photo", { method: "POST", body: form });
      if (!res.ok) {
        setError((await res.text().catch(() => "")) || "Upload failed.");
        setStatus("error");
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (data.url) setPhotoUrl(data.url);
    } catch {
      setError("Network error while uploading. Please try again.");
      setStatus("error");
    } finally {
      setUploading(false);
      // Let the same file be re-picked after a failure.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function save() {
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/admin/coaches", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: initial.slug,
          bio,
          role,
          photo_url: photoUrl,
          horizonMonths: Number(horizon),
          booking_schedule: fromUi(periods),
          booking_locations: locations.map(({ city, address, preferred }) => ({
            city,
            address,
            preferred,
          })),
        }),
      });
      if (!res.ok) {
        setError((await res.text().catch(() => "")) || "Something went wrong.");
        setStatus("error");
        return;
      }
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{initial.label}</h2>

      {/* Horizon */}
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-gray-700">
        <span className="font-semibold">Show booking</span>
        <input
          type="number"
          min={1}
          max={24}
          value={horizon}
          onChange={(e) => setHorizon(e.target.value)}
          className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        />
        <span className="font-semibold">months in advance</span>
      </div>

      {/* Schedule periods */}
      <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Availability periods
      </div>
      <div className="space-y-4">
        {periods.map((p) => (
          <div key={p.uid} className="rounded-xl border border-gray-200 p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap gap-4">
                <label className="text-xs font-semibold text-gray-500">
                  From
                  <input
                    type="date"
                    value={p.start ?? ""}
                    onChange={(e) => setPeriodDate(p.uid, "start", e.target.value)}
                    className="mt-1 block rounded-lg border border-gray-200 px-2 py-1 text-sm font-normal text-gray-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-500">
                  Until
                  <input
                    type="date"
                    value={p.end ?? ""}
                    onChange={(e) => setPeriodDate(p.uid, "end", e.target.value)}
                    className="mt-1 block rounded-lg border border-gray-200 px-2 py-1 text-sm font-normal text-gray-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <span className="self-center text-xs text-gray-400">Leave blank for open-ended</span>
              </div>
              {periods.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePeriod(p.uid)}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-500 hover:border-red-300 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove period
                </button>
              )}
            </div>

            {/* Day grid */}
            <div className="divide-y divide-gray-100">
              {WEEK.map(({ dow, label }) => {
                const blocks = p.days[String(dow)] ?? [];
                return (
                  <div key={dow} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-2">
                    <span className="w-24 shrink-0 pt-1 text-sm font-semibold text-gray-800">{label}</span>
                    <div className="flex flex-1 flex-col gap-2">
                      {blocks.length === 0 && (
                        <span className="pt-1 text-xs italic text-gray-400">Off</span>
                      )}
                      {blocks.map((b, idx) => {
                        const invalid = !isWholeHourBlock(b);
                        return (
                          <div key={idx} className="flex flex-wrap items-center gap-2">
                            <input
                              type="time"
                              step={1800}
                              value={b.start}
                              onChange={(e) => setBlockTime(p.uid, dow, idx, "start", e.target.value)}
                              className={`rounded-lg border px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-100 ${
                                invalid ? "border-red-300" : "border-gray-200 focus:border-emerald-400"
                              }`}
                            />
                            <span className="text-gray-400">–</span>
                            <input
                              type="time"
                              step={1800}
                              value={b.end}
                              onChange={(e) => setBlockTime(p.uid, dow, idx, "end", e.target.value)}
                              className={`rounded-lg border px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-100 ${
                                invalid ? "border-red-300" : "border-gray-200 focus:border-emerald-400"
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => removeBlock(p.uid, dow, idx)}
                              className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              title="Remove time"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            {invalid && (
                              <span className="text-xs font-medium text-red-600">
                                Must be a whole number of hours
                              </span>
                            )}
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => addBlock(p.uid, dow)}
                        className="flex w-fit items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add time
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addPeriod}
        className="mt-3 flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
      >
        <Plus className="h-4 w-4" /> Add schedule period
      </button>

      {/* Live preview */}
      <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
        <span className="font-semibold">Parents will see:</span>
        {preview.length === 0 ? (
          <span className="italic text-emerald-700"> No availability</span>
        ) : (
          <div className="mt-1 space-y-1">
            {preview.map((ph, i) => (
              <div key={i}>
                {ph.label && <span className="font-semibold">{ph.label}: </span>}
                {ph.lines.map((h, j) => (
                  <span key={j}>
                    {j > 0 && " · "}
                    <span className="font-semibold">{h.days}</span> {h.time}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Profile photo */}
      <div className="mb-4 mt-6">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-gray-500">
          Profile photo{" "}
          <span className="font-normal normal-case text-gray-400">
            (saved with the card &mdash; max 8MB)
          </span>
        </label>
        <div className="flex items-center gap-4">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={initial.label}
              width={96}
              height={96}
              unoptimized
              className="h-24 w-24 shrink-0 rounded-full object-cover ring-1 ring-emerald-100"
            />
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl font-bold text-emerald-700">
              {initialsOf(initial.label)}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadPhoto(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
            >
              <ImagePlus className="h-4 w-4" />
              {uploading ? "Uploading\u2026" : photoUrl ? "Replace photo" : "Upload photo"}
            </button>
            {photoUrl && !uploading && (
              <button
                type="button"
                onClick={() => setPhotoUrl(null)}
                title="Remove photo"
                className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Role badge (optional) */}
      <div className="mb-4 mt-6">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-gray-500">
          Role badge <span className="font-normal normal-case text-gray-400">(optional)</span>
        </label>
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. Head Coach — leave blank for none"
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      {/* Bio */}
      <div className="mb-5">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-gray-500">
          Bio <span className="font-normal normal-case text-gray-400">(leave blank for no bio card)</span>
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={6}
          placeholder="A short bio shown on this coach's booking tab. One blank line between paragraphs."
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      {/* Training locations */}
      <div className="mb-5">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-gray-500">
          Training locations{" "}
          <span className="font-normal normal-case text-gray-400">(star the preferred one)</span>
        </label>
        <div className="space-y-2">
          {locations.map((l) => (
            <div
              key={l.uid}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 p-2"
            >
              <button
                type="button"
                onClick={() => setPreferred(l.uid)}
                title={l.preferred ? "Preferred location" : "Make preferred"}
                className={
                  l.preferred
                    ? "rounded-lg p-1.5 text-amber-500"
                    : "rounded-lg p-1.5 text-gray-300 hover:text-amber-400"
                }
              >
                <Star className={l.preferred ? "h-4 w-4 fill-amber-400" : "h-4 w-4"} />
              </button>
              <input
                value={l.city}
                onChange={(e) => setLocationField(l.uid, "city", e.target.value)}
                placeholder="City"
                className="w-36 rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              <input
                value={l.address}
                onChange={(e) => setLocationField(l.uid, "address", e.target.value)}
                placeholder="Park / address (optional)"
                className="min-w-40 flex-1 rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              <button
                type="button"
                onClick={() => removeLocation(l.uid)}
                title="Remove location"
                className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {locations.length === 0 && (
            <p className="text-xs italic text-gray-400">No locations yet.</p>
          )}
        </div>
        <button
          type="button"
          onClick={addLocation}
          className="mt-2 flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
        >
          <Plus className="h-4 w-4" /> Add location
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={status === "saving" || uploading || hasErrors}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
        {hasErrors && (
          <span className="text-sm font-medium text-red-600">Fix the highlighted times to save.</span>
        )}
        {status === "saved" && <span className="text-sm font-medium text-emerald-700">✓ Saved</span>}
        {status === "error" && error && <span className="text-sm font-medium text-red-600">{error}</span>}
      </div>
    </div>
  );
}

export function CoachProfilesClient({ initialCoaches }: { initialCoaches: EditableCoach[] }) {
  const [active, setActive] = useState<CoachSlug>(initialCoaches[0]?.slug ?? "david");

  return (
    <div>
      <CoachSwitcher
        items={initialCoaches.map((c) => ({ slug: c.slug, label: c.label }))}
        active={active}
        onChange={setActive}
      />

      {/* Every card stays mounted so unsaved edits survive switching coaches;
          only the selected one is shown. */}
      {initialCoaches.map((c) => (
        <div key={c.slug} className={c.slug === active ? "" : "hidden"}>
          <CoachCard initial={c} />
        </div>
      ))}
    </div>
  );
}
