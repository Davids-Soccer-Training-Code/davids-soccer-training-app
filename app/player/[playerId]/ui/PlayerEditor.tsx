"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { calculatePlayerBirthMeta } from "@/lib/playerAge";

type Player = {
  id: string;
  name: string;
  birthdate: string | null;
  team_level: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  dominant_foot: string | null;
  shirt_size: string | null;
  location: string | null;
  profile_photo_url: string | null;
};

function isBlank(value: string | null | undefined) {
  return !String(value ?? "").trim();
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
  helperText,
  requiredMissing = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  helperText?: string;
  requiredMissing?: boolean;
}) {
  const inputClass = requiredMissing
    ? "border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-red-50"
    : "border-emerald-200 bg-white focus:border-emerald-300 focus:ring-emerald-50";

  return (
    <div className="space-y-1.5">
      <label
        className={`text-sm font-medium ${
          requiredMissing ? "text-red-700" : "text-gray-700"
        }`}
      >
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        disabled={disabled}
        className={`w-full rounded-xl border px-3 py-2 text-gray-800 placeholder:text-gray-500 outline-none transition focus:ring-4 ${inputClass}`}
      />
      {helperText ? (
        <p className={`text-xs ${requiredMissing ? "text-red-700" : "text-gray-500"}`}>
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  helperText,
  requiredMissing = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  helperText?: string;
  requiredMissing?: boolean;
}) {
  const inputClass = requiredMissing
    ? "border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-red-50"
    : "border-emerald-200 bg-white focus:border-emerald-300 focus:ring-emerald-50";

  return (
    <div className="space-y-1.5 sm:col-span-2">
      <label
        className={`text-sm font-medium ${
          requiredMissing ? "text-red-700" : "text-gray-700"
        }`}
      >
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={`w-full resize-y rounded-xl border px-3 py-2 text-gray-800 placeholder:text-gray-500 outline-none transition focus:ring-4 ${inputClass}`}
      />
      {helperText ? (
        <p className={`text-xs ${requiredMissing ? "text-red-700" : "text-gray-500"}`}>
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

export function PlayerEditor(props: { player: Player }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [draft, setDraft] = useState<Player>(props.player);

  const changed = useMemo(() => {
    const a = props.player;
    const b = draft;
    return (
      a.name !== b.name ||
      a.birthdate !== b.birthdate ||
      a.team_level !== b.team_level ||
      a.primary_position !== b.primary_position ||
      a.secondary_position !== b.secondary_position ||
      a.dominant_foot !== b.dominant_foot ||
      a.shirt_size !== b.shirt_size ||
      a.location !== b.location ||
      a.profile_photo_url !== b.profile_photo_url
    );
  }, [draft, props.player]);

  const computed = useMemo(() => {
    return calculatePlayerBirthMeta(draft.birthdate);
  }, [draft.birthdate]);

  const missing = {
    name: isBlank(draft.name),
    teamLevel: isBlank(draft.team_level),
    birthdate: isBlank(draft.birthdate),
    dominantFoot: isBlank(draft.dominant_foot),
    shirtSize: isBlank(draft.shirt_size),
    location: isBlank(draft.location),
  };

  const hasAnyMissing = Object.values(missing).some(Boolean);

  return (
    <div>
      {hasAnyMissing && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          Some required fields are missing — fill them in below and save.
        </div>
      )}

      {/* Photo upload section */}
      <div className="mb-6 flex items-center gap-4">
        {/* Photo display */}
        {draft.profile_photo_url ? (
          <img
            src={draft.profile_photo_url}
            alt="Profile"
            className="h-20 w-20 rounded-2xl border-2 border-emerald-200 object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-emerald-200 bg-emerald-50 text-lg font-semibold text-emerald-700">
            {draft.name?.slice(0, 1).toUpperCase() || "P"}
          </div>
        )}

        {/* Upload controls */}
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;

              setSuccess(null);
              setError(null);

              if (!file.type.startsWith("image/")) {
                setError("Please choose an image file.");
                return;
              }

              const maxBytes = 8 * 1024 * 1024;
              if (file.size > maxBytes) {
                setError("Image too large (max 8MB).");
                return;
              }

              setIsUploading(true);
              try {
                const form = new FormData();
                form.append("file", file);

                const res = await fetch("/api/blob/upload", {
                  method: "POST",
                  body: form,
                });

                if (!res.ok) {
                  const text = await res.text().catch(() => "");
                  throw new Error(text || "Upload failed.");
                }

                const data = (await res.json()) as { url: string };
                setDraft((p) => ({ ...p, profile_photo_url: data.url }));
                setSuccess('Photo uploaded. Click "Save changes" to apply.');
              } catch (err) {
                setError(err instanceof Error ? err.message : "Upload failed.");
              } finally {
                setIsUploading(false);
                e.target.value = "";
              }
            }}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isPending}
              className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? "Uploading…" : "Upload photo"}
            </button>
            {draft.profile_photo_url && (
              <button
                type="button"
                onClick={() => {
                  setSuccess(null);
                  setError(null);
                  setDraft((p) => ({ ...p, profile_photo_url: null }));
                }}
                disabled={isUploading || isPending}
                className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {(error || success) && (
        <div
          className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error ?? success}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          value={draft.name}
          onChange={(v) => {
            setSuccess(null);
            setError(null);
            setDraft((p) => ({ ...p, name: v }));
          }}
          placeholder="Player name"
          requiredMissing={missing.name}
          helperText={missing.name ? "Needs to be put in." : undefined}
        />
        <Field
          label="Team / level"
          value={draft.team_level ?? ""}
          onChange={(v) => {
            setSuccess(null);
            setError(null);
            setDraft((p) => ({ ...p, team_level: v || null }));
          }}
          placeholder="Team / level"
          requiredMissing={missing.teamLevel}
          helperText={missing.teamLevel ? "Needs to be put in." : undefined}
        />
        <Field
          label="Birthday"
          value={draft.birthdate ?? ""}
          onChange={(v) => {
            setSuccess(null);
            setError(null);
            setDraft((p) => ({ ...p, birthdate: v || null }));
          }}
          type="date"
          placeholder="YYYY-MM-DD"
          requiredMissing={missing.birthdate}
          helperText={missing.birthdate ? "Needs to be put in." : undefined}
        />
        <Field
          label="Computed (age / birth year / age group)"
          value={[
            computed.age !== null ? `Age ${computed.age}` : "Age —",
            computed.birthYear !== null
              ? `Birth year ${computed.birthYear}`
              : "Birth year —",
            computed.ageGroup ?? "Age group —",
          ].join(" • ")}
          onChange={() => {}}
          type="text"
          disabled
        />
        <Field
          label="Primary position"
          value={draft.primary_position ?? ""}
          onChange={(v) => {
            setSuccess(null);
            setError(null);
            setDraft((p) => ({ ...p, primary_position: v || null }));
          }}
          placeholder="e.g. CM"
        />
        <Field
          label="Secondary position"
          value={draft.secondary_position ?? ""}
          onChange={(v) => {
            setSuccess(null);
            setError(null);
            setDraft((p) => ({ ...p, secondary_position: v || null }));
          }}
          placeholder="e.g. LB"
        />
        <Field
          label="Dominant foot"
          value={draft.dominant_foot ?? ""}
          onChange={(v) => {
            setSuccess(null);
            setError(null);
            setDraft((p) => ({ ...p, dominant_foot: v || null }));
          }}
          placeholder="Right / Left / Both"
          requiredMissing={missing.dominantFoot}
          helperText={missing.dominantFoot ? "Needs to be put in." : undefined}
        />
        <Field
          label="Shirt size"
          value={draft.shirt_size ?? ""}
          onChange={(v) => {
            setSuccess(null);
            setError(null);
            setDraft((p) => ({ ...p, shirt_size: v || null }));
          }}
          placeholder="e.g. Youth M"
          requiredMissing={missing.shirtSize}
          helperText={missing.shirtSize ? "Needs to be put in." : undefined}
        />
        <TextArea
          label="Location"
          value={draft.location ?? ""}
          onChange={(v) => {
            setSuccess(null);
            setError(null);
            setDraft((p) => ({ ...p, location: v || null }));
          }}
          placeholder="City, area, or general side of town"
          requiredMissing={missing.location}
          helperText={
            missing.location
              ? "Needs to be put in. General area is enough."
              : "Doesn’t have to be exact. Just enough to help the coach understand travel distance."
          }
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          disabled={!changed || isPending}
          onClick={() => {
            setDraft(props.player);
            setError(null);
            setSuccess(null);
          }}
          className="rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reset
        </button>
        <button
          type="button"
          disabled={!changed || isPending || isUploading}
          onClick={() => {
            setError(null);
            setSuccess(null);

            const name = String(draft.name ?? "").trim();
            if (!name) {
              setError("Name is required.");
              return;
            }

            startTransition(async () => {
              try {
                const res = await fetch(`/api/players/${draft.id}`, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    name,
                    birthdate: draft.birthdate,
                    team_level: draft.team_level,
                    primary_position: draft.primary_position,
                    secondary_position: draft.secondary_position,
                    dominant_foot: draft.dominant_foot,
                    shirt_size: draft.shirt_size,
                    location: draft.location,
                    profile_photo_url: draft.profile_photo_url,
                  }),
                });

                if (!res.ok) {
                  const text = await res.text().catch(() => "");
                  throw new Error(text || "Save failed.");
                }

                setSuccess("Saved.");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Save failed.");
              }
            });
          }}
          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
