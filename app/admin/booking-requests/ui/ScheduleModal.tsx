"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";

import type { BookingRequest } from "./BookingRequestsClient";

/**
 * Confirm dialog for a booking request.
 *
 * Requests come off the public /book page as free text, so nothing links them
 * to a CRM family. This shows the ranked matches, lets the admin pick one (or
 * declare it a new family), and only then hands off to the CRM — which is what
 * actually creates the calendar invite, reminders and coach text.
 */

type PackageState = {
  id: number;
  packageType: string;
  totalSessions: number;
  used: number;
  booked: number;
  remaining: number;
};

type Candidate = {
  parentId: number;
  parentName: string;
  secondaryParentName: string | null;
  email: string | null;
  phone: string | null;
  isDead: boolean;
  players: { id: number; name: string }[];
  activePackage: PackageState | null;
  lastSessionDate: string | null;
  tier: "strong" | "likely" | "possible";
  reasons: string[];
  suggestedPlayerId: number | null;
};

type MatchResponse = {
  candidates: Candidate[];
  suggestedParentId: number | null;
  suggestedType: "first" | "session";
  suggestedPackageId: number | null;
  locations: { id: string; label: string; address: string }[];
  alreadyScheduled: boolean;
  crmSessionId: string | null;
  crmSessionKind: string | null;
};

const NEW_FAMILY = "new" as const;
const OTHER_LOCATION = "__other__";

const tierStyle: Record<Candidate["tier"], string> = {
  strong: "bg-emerald-100 text-emerald-800 border-emerald-300",
  likely: "bg-amber-100 text-amber-800 border-amber-300",
  possible: "bg-gray-100 text-gray-600 border-gray-300",
};

const tierLabel: Record<Candidate["tier"], string> = {
  strong: "Strong match",
  likely: "Likely — check this",
  possible: "Possible",
};

function fmtTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${ampm}`;
}

function fmtDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ScheduleModal({
  request,
  onClose,
  onScheduled,
}: {
  request: BookingRequest;
  onClose: () => void;
  onScheduled: (id: string) => void;
}) {
  const [data, setData] = useState<MatchResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [parentChoice, setParentChoice] = useState<number | typeof NEW_FAMILY | null>(null);
  const [playerChoice, setPlayerChoice] = useState<number | typeof NEW_FAMILY>(NEW_FAMILY);
  const [kind, setKind] = useState<"first" | "session">("first");
  const [usePackage, setUsePackage] = useState(false);
  const [price, setPrice] = useState("");
  const [title, setTitle] = useState("");
  const [locationId, setLocationId] = useState<string>("");
  const [customAddress, setCustomAddress] = useState("");
  const [saveLabel, setSaveLabel] = useState("");
  const [sendEmailInvites, setSendEmailInvites] = useState(true);

  // Load matches once, and seed every control from what the matcher suggests.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/booking-requests/${request.id}/match`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return (await res.json()) as MatchResponse;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setParentChoice(json.suggestedParentId ?? NEW_FAMILY);
        setKind(json.suggestedType);
        setUsePackage(json.suggestedPackageId != null);
        const top = json.candidates.find((c) => c.parentId === json.suggestedParentId);
        setPlayerChoice(top?.suggestedPlayerId ?? NEW_FAMILY);
        setLocationId(json.locations[0]?.id ?? OTHER_LOCATION);
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadError(error.message || "Could not load matches.");
      });
    return () => {
      cancelled = true;
    };
  }, [request.id]);

  const selected = useMemo(
    () =>
      typeof parentChoice === "number"
        ? data?.candidates.find((c) => c.parentId === parentChoice) ?? null
        : null,
    [data, parentChoice]
  );

  const availablePackage =
    selected?.activePackage && selected.activePackage.remaining > 0 ? selected.activePackage : null;
  const packageApplies = kind === "session" && availablePackage != null && usePackage;

  function selectParent(choice: number | typeof NEW_FAMILY) {
    setParentChoice(choice);
    const next = typeof choice === "number" ? data?.candidates.find((c) => c.parentId === choice) : null;
    setPlayerChoice(next?.suggestedPlayerId ?? NEW_FAMILY);
    // A new family has no history and no package — that's a first session.
    if (choice === NEW_FAMILY) {
      setKind("first");
      setUsePackage(false);
    } else if (next) {
      const hasRoom = next.activePackage != null && next.activePackage.remaining > 0;
      setKind(hasRoom || next.lastSessionDate ? "session" : "first");
      setUsePackage(hasRoom);
    }
  }

  function submit() {
    if (!data) return;
    setSubmitting(true);
    setSubmitError(null);

    const address =
      locationId === OTHER_LOCATION
        ? customAddress.trim()
        : data.locations.find((l) => l.id === locationId)?.address ?? "";

    const parsedPrice = price.trim() === "" ? null : Number(price);
    if (parsedPrice != null && !Number.isFinite(parsedPrice)) {
      setSubmitError("Price must be a number.");
      setSubmitting(false);
      return;
    }

    void fetch(`/api/admin/booking-requests/${request.id}/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        parentId: typeof parentChoice === "number" ? parentChoice : null,
        playerId: typeof playerChoice === "number" ? playerChoice : null,
        kind,
        packageId: packageApplies ? availablePackage?.id ?? null : null,
        price: packageApplies ? null : parsedPrice,
        title: title.trim() || null,
        location: address || null,
        saveLocationAs: locationId === OTHER_LOCATION ? saveLabel.trim() || null : null,
        sendEmailInvites,
      }),
    })
      .then(async (res) => {
        if (res.ok) {
          onScheduled(request.id);
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSubmitError(body.error || `Failed (${res.status}).`);
      })
      .catch((error: Error) => setSubmitError(error.message))
      .finally(() => setSubmitting(false));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Confirm &amp; add to CRM</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {request.parent_name} · {request.player_name} · {fmtDate(request.slot_date)},{" "}
              {fmtTime(request.slot_start)}–{fmtTime(request.slot_end)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loadError && (
          <div className="px-6 py-8 text-sm text-red-600">Could not load matches: {loadError}</div>
        )}

        {!data && !loadError && (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Matching against the CRM…
          </div>
        )}

        {data?.alreadyScheduled && (
          <div className="mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This request is already in the CRM (session #{data.crmSessionId}). Creating it again
            would send the parent a duplicate calendar invite.
          </div>
        )}

        {data && !data.alreadyScheduled && (
          <div className="space-y-6 px-6 py-5">
            {/* 1 — which family */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Family
              </h3>
              <div className="space-y-2">
                {data.candidates.map((c) => (
                  <label
                    key={c.parentId}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
                      parentChoice === c.parentId
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="parent"
                      className="mt-1"
                      checked={parentChoice === c.parentId}
                      onChange={() => selectParent(c.parentId)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">{c.parentName}</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tierStyle[c.tier]}`}
                        >
                          {tierLabel[c.tier]}
                        </span>
                        {c.isDead && (
                          <span className="rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                            Dead lead
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{c.reasons.join(" · ")}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {c.players.length > 0
                          ? `Players: ${c.players.map((p) => p.name).join(", ")}`
                          : "No players on file"}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-gray-500">
                        {c.activePackage ? (
                          <span>
                            {c.activePackage.packageType}: {c.activePackage.remaining} of{" "}
                            {c.activePackage.totalSessions} left
                            {c.activePackage.booked > 0 && ` (${c.activePackage.booked} booked)`}
                          </span>
                        ) : (
                          <span>No active package</span>
                        )}
                        <span>
                          {c.lastSessionDate ? `Last session ${c.lastSessionDate}` : "No sessions yet"}
                        </span>
                      </div>
                    </div>
                  </label>
                ))}

                <label
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
                    parentChoice === NEW_FAMILY
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-dashed border-gray-300 bg-white hover:border-gray-400"
                  }`}
                >
                  <input
                    type="radio"
                    name="parent"
                    className="mt-1"
                    checked={parentChoice === NEW_FAMILY}
                    onChange={() => selectParent(NEW_FAMILY)}
                  />
                  <div>
                    <div className="font-semibold text-gray-900">New family</div>
                    <div className="mt-1 text-xs text-gray-500">
                      Creates {request.parent_name}
                      {request.phone ? ` · ${request.phone}` : ""}
                      {request.email ? ` · ${request.email}` : ""} and {request.player_name} in the CRM.
                    </div>
                  </div>
                </label>
              </div>
            </section>

            {/* 2 — which kid */}
            {selected && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Player
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selected.players.map((p) => (
                    <label
                      key={p.id}
                      className={`cursor-pointer rounded-xl border px-3 py-2 text-sm transition ${
                        playerChoice === p.id
                          ? "border-emerald-400 bg-emerald-50 font-semibold text-emerald-800"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="player"
                        className="sr-only"
                        checked={playerChoice === p.id}
                        onChange={() => setPlayerChoice(p.id)}
                      />
                      {p.name}
                    </label>
                  ))}
                  <label
                    className={`cursor-pointer rounded-xl border px-3 py-2 text-sm transition ${
                      playerChoice === NEW_FAMILY
                        ? "border-emerald-400 bg-emerald-50 font-semibold text-emerald-800"
                        : "border-dashed border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                    }`}
                  >
                    <input
                      type="radio"
                      name="player"
                      className="sr-only"
                      checked={playerChoice === NEW_FAMILY}
                      onChange={() => setPlayerChoice(NEW_FAMILY)}
                    />
                    + Add {request.player_name}
                  </label>
                </div>
              </section>
            )}

            {/* 3 — what kind of session */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Session
              </h3>
              <div className="flex flex-wrap gap-2">
                {(["first", "session"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`rounded-xl border px-3 py-2 text-sm transition ${
                      kind === k
                        ? "border-emerald-400 bg-emerald-50 font-semibold text-emerald-800"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {k === "first" ? "First session" : "Regular session"}
                  </button>
                ))}
              </div>

              {kind === "session" && availablePackage && (
                <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={usePackage}
                    onChange={(e) => setUsePackage(e.target.checked)}
                  />
                  Use their {availablePackage.packageType} package ({availablePackage.remaining} left)
                </label>
              )}

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-gray-600">
                    Title <span className="text-gray-400">(optional)</span>
                  </span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Leave blank for the default"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  />
                </label>

                {/* A package session is already paid for, so no price on it. */}
                {!packageApplies && (
                  <label className="text-sm">
                    <span className="mb-1 block text-xs font-medium text-gray-600">
                      Cost <span className="text-gray-400">(optional)</span>
                    </span>
                    <input
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      inputMode="decimal"
                      placeholder="Leave blank to fill in later"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    />
                  </label>
                )}
              </div>
            </section>

            {/* 4 — where */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Location
              </h3>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              >
                {data.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label} — {l.address}
                  </option>
                ))}
                <option value={OTHER_LOCATION}>Other…</option>
              </select>

              {locationId === OTHER_LOCATION && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input
                    value={customAddress}
                    onChange={(e) => setCustomAddress(e.target.value)}
                    placeholder="Full address"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  />
                  <input
                    value={saveLabel}
                    onChange={(e) => setSaveLabel(e.target.value)}
                    placeholder="Save as… (optional name)"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  />
                </div>
              )}

              <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={sendEmailInvites}
                  onChange={(e) => setSendEmailInvites(e.target.checked)}
                />
                Email the Google Calendar invite to the parent
              </label>
            </section>

            {submitError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {submitError}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!data || data.alreadyScheduled || submitting || parentChoice == null}
            onClick={submit}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Creating…" : "Confirm & create in CRM"}
          </button>
        </div>
      </div>
    </div>
  );
}
