"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminVideos } from "@/app/admin/ui/AdminVideos";
import { calculatePlayerBirthMeta } from "@/lib/playerAge";

type Parent = {
  id: string;
  email: string | null;
  phone: string | null;
  crm_parent_id: number | null;
  created_at: string;
  updated_at: string;
};

type Player = {
  id: string;
  parent_id: string;
  crm_player_id: number | null;
  name: string;
  age: number | null;
  birthdate: string | null;
  birth_year: number | null;
  team_level: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  dominant_foot: string | null;
  profile_photo_url: string | null;
  strengths: string | null;
  focus_areas: string | null;
  long_term_development_notes: string | null;
  created_at: string;
  updated_at: string;
};

async function api<T>(
  path: string,
  opts: RequestInit & { securityCode?: string }
): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(opts.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        disabled={disabled}
        className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-gray-800 placeholder:text-gray-500 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
      />
    </div>
  );
}

export default function AdminClient() {
  const [securityCode, setSecurityCode] = useState("");
  const [authorized, setAuthorized] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [parents, setParents] = useState<Parent[]>([]);
  const [playersByParent, setPlayersByParent] = useState<
    Record<string, Player[]>
  >({});
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Create parent
  const [newParentEmail, setNewParentEmail] = useState("");
  const [newParentPhone, setNewParentPhone] = useState("");
  const [newParentCrmId, setNewParentCrmId] = useState("");
  const [createParentNotice, setCreateParentNotice] = useState<string | null>(null);

  // Create player
  const [selectedParentId, setSelectedParentId] = useState<string>("");
  const [newPlayer, setNewPlayer] = useState<Partial<Player>>({ name: "" });
  const [newPlayerCrmId, setNewPlayerCrmId] = useState("");

  // Edit player (handled on /admin/player/[id])

  const selectedParent = useMemo(
    () => parents.find((p) => p.id === selectedParentId) ?? null,
    [parents, selectedParentId]
  );

  async function verify(code: string) {
    setAuthError(null);
    await api<{ ok: true }>("/api/admin/verify", {
      method: "GET",
      securityCode: code,
    });
    setAuthorized(true);
  }

  async function loadParents(code: string) {
    const data = await api<{ parents: Parent[] }>("/api/admin/parents", {
      method: "GET",
      securityCode: code,
      cache: "no-store",
    });
    setParents(data.parents);
  }

  async function loadPlayersForParent(code: string, parentId: string) {
    const data = await api<{ players: Player[] }>(
      `/api/admin/parents/${parentId}/players`,
      { method: "GET", securityCode: code, cache: "no-store" }
    );
    setPlayersByParent((prev) => ({ ...prev, [parentId]: data.players }));
  }

  useEffect(() => {
    setParents([]);
    setPlayersByParent({});
    setSelectedParentId("");
    void refreshAll(securityCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshAll(code: string) {
    setLoading(true);
    setErrMsg(null);
    try {
      await loadParents(code);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-emerald-50">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-emerald-50 via-white to-white" />

      <header className="relative border-b border-emerald-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Image
              src="/icon.png"
              alt="Admin"
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl"
            />
            <div>
              <div className="text-sm font-semibold text-gray-900">Admin</div>
              <div className="text-sm text-gray-600">
                Create parents & players, edit player profiles
              </div>
            </div>
          </div>

        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 py-10">
        {!authorized ? (
          <div className="mx-auto max-w-md rounded-3xl border border-emerald-200 bg-white/90 p-6 shadow-sm backdrop-blur">
            <h1 className="text-xl font-semibold text-gray-900">
              Enter security code
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              This is required every time you refresh the admin page.
            </p>

            {authError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {authError}
              </div>
            )}

            <div className="mt-6 space-y-3">
              <Field
                label="SECURITY_CODE"
                value={securityCode}
                onChange={setSecurityCode}
                type="password"
                placeholder="Enter code"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await verify(securityCode);
                    await refreshAll(securityCode);
                  } catch (e) {
                    setAuthError(
                      e instanceof Error ? e.message : "Unauthorized"
                    );
                  }
                }}
                className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Enter admin
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Parents</h2>
                <button
                  type="button"
                  onClick={() => refreshAll(securityCode)}
                  disabled={loading}
                  className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 disabled:opacity-60"
                >
                  {loading ? "Refreshing…" : "Refresh"}
                </button>
              </div>

              {errMsg && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {errMsg}
                </div>
              )}

              <div className="mt-6 grid gap-3">
                {parents.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={async () => {
                      setSelectedParentId(p.id);
                      if (!playersByParent[p.id]) {
                        setLoading(true);
                        try {
                          await loadPlayersForParent(securityCode, p.id);
                        } catch (e) {
                          setErrMsg(
                            e instanceof Error
                              ? e.message
                              : "Failed to load players"
                          );
                        } finally {
                          setLoading(false);
                        }
                      }
                    }}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      selectedParentId === p.id
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-emerald-200 bg-white hover:border-emerald-300"
                    }`}
                  >
                    <div className="text-sm font-semibold text-gray-900">
                      {p.email ?? p.phone ?? p.id}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {p.email ? `Email: ${p.email}` : "Email: —"} •{" "}
                      {p.phone ? `Phone: ${p.phone}` : "Phone: —"} •{" "}
                      {p.crm_parent_id
                        ? `CRM parent: ${p.crm_parent_id}`
                        : "CRM parent: —"}
                    </div>
                  </button>
                ))}

                {parents.length === 0 && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-gray-700">
                    No parents yet. Create one on the right.
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-6">
              <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">
                  Create parent
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Phone is required. A setup link will be texted to the parent
                  so they can create their own password.
                </p>

                <div className="mt-6 grid gap-4">
                  <Field
                    label="Phone (required)"
                    value={newParentPhone}
                    onChange={setNewParentPhone}
                    placeholder="+15555555555"
                  />
                  <Field
                    label="Email (optional)"
                    value={newParentEmail}
                    onChange={setNewParentEmail}
                    placeholder="parent@example.com"
                  />
                  <Field
                    label="CRM Parent ID (optional)"
                    value={newParentCrmId}
                    onChange={setNewParentCrmId}
                    placeholder="e.g. 14"
                  />
                  {createParentNotice && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      {createParentNotice}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      setErrMsg(null);
                      setCreateParentNotice(null);
                      try {
                        const result = await api<{
                          parent: Parent;
                          smsSent: boolean;
                          smsError: string | null;
                        }>("/api/admin/parents", {
                          method: "POST",
                          securityCode,
                          body: JSON.stringify({
                            email: newParentEmail || undefined,
                            phone: newParentPhone || undefined,
                            crm_parent_id: newParentCrmId || undefined,
                          }),
                        });
                        setNewParentEmail("");
                        setNewParentPhone("");
                        setNewParentCrmId("");
                        if (result.smsSent) {
                          setCreateParentNotice(
                            "Parent created — setup link sent via SMS."
                          );
                        } else {
                          setCreateParentNotice(
                            `Parent created — SMS failed: ${result.smsError ?? "unknown error"}`
                          );
                        }
                        await refreshAll(securityCode);
                      } catch (e) {
                        setErrMsg(
                          e instanceof Error
                            ? e.message
                            : "Failed to create parent"
                        );
                      }
                    }}
                    className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  >
                    Create parent & send setup link
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedParent
                    ? "Players for selected parent"
                    : "Create player"}
                </h2>

                {!selectedParent ? (
                  <p className="mt-2 text-sm text-gray-600">
                    Select a parent on the left first.
                  </p>
                ) : (
                  <>
                    <div className="mt-3 text-sm text-gray-600">
                      Parent:{" "}
                      <span className="font-semibold text-gray-900">
                        {selectedParent.email ??
                          selectedParent.phone ??
                          selectedParent.id}
                      </span>
                      <span className="ml-2">
                        {selectedParent.crm_parent_id
                          ? `(CRM parent ${selectedParent.crm_parent_id})`
                          : "(No CRM parent link)"}
                      </span>
                    </div>

                    <div className="mt-6 grid gap-4">
                      <Field
                        label="CRM Player ID (optional)"
                        value={newPlayerCrmId}
                        onChange={setNewPlayerCrmId}
                        placeholder="e.g. 18"
                      />
                      <Field
                        label="Player name"
                        value={String(newPlayer.name ?? "")}
                        onChange={(v) =>
                          setNewPlayer((p) => ({ ...p, name: v }))
                        }
                        placeholder="Player name"
                      />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          label="Birthday"
                          value={String(newPlayer.birthdate ?? "")}
                          onChange={(v) =>
                            setNewPlayer((p) => ({
                              ...p,
                              birthdate: v || null,
                            }))
                          }
                          placeholder="YYYY-MM-DD"
                          type="date"
                        />
                        <Field
                          label="Computed (age / birth year / age group)"
                          value={(() => {
                            const meta = calculatePlayerBirthMeta(
                              (newPlayer.birthdate as
                                | string
                                | null
                                | undefined) ?? null
                            );
                            const parts = [
                              meta.age !== null ? `Age ${meta.age}` : "Age —",
                              meta.birthYear !== null
                                ? `Birth year ${meta.birthYear}`
                                : "Birth year —",
                              meta.ageGroup ?? "Age group —",
                            ];
                            return parts.join(" • ");
                          })()}
                          onChange={() => {}}
                          placeholder=""
                          type="text"
                          disabled
                        />
                      </div>

                      <Field
                        label="Team / level"
                        value={String(newPlayer.team_level ?? "")}
                        onChange={(v) =>
                          setNewPlayer((p) => ({ ...p, team_level: v }))
                        }
                        placeholder="Team / level"
                      />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          label="Primary position"
                          value={String(newPlayer.primary_position ?? "")}
                          onChange={(v) =>
                            setNewPlayer((p) => ({ ...p, primary_position: v }))
                          }
                          placeholder="e.g. CM"
                        />
                        <Field
                          label="Secondary position"
                          value={String(newPlayer.secondary_position ?? "")}
                          onChange={(v) =>
                            setNewPlayer((p) => ({
                              ...p,
                              secondary_position: v,
                            }))
                          }
                          placeholder="e.g. LB"
                        />
                      </div>
                      <Field
                        label="Dominant foot"
                        value={String(newPlayer.dominant_foot ?? "")}
                        onChange={(v) =>
                          setNewPlayer((p) => ({ ...p, dominant_foot: v }))
                        }
                        placeholder="Right / Left / Both"
                      />
                      <Field
                        label="Profile photo URL (optional)"
                        value={String(newPlayer.profile_photo_url ?? "")}
                        onChange={(v) =>
                          setNewPlayer((p) => ({ ...p, profile_photo_url: v }))
                        }
                        placeholder="https://..."
                      />
                      <Field
                        label="Strengths (coach-defined)"
                        value={String(newPlayer.strengths ?? "")}
                        onChange={(v) =>
                          setNewPlayer((p) => ({ ...p, strengths: v }))
                        }
                        placeholder="Strengths"
                      />
                      <Field
                        label="Focus areas (coach-defined)"
                        value={String(newPlayer.focus_areas ?? "")}
                        onChange={(v) =>
                          setNewPlayer((p) => ({ ...p, focus_areas: v }))
                        }
                        placeholder="Focus areas"
                      />
                      <Field
                        label="Long-term development notes (coach-only)"
                        value={String(
                          newPlayer.long_term_development_notes ?? ""
                        )}
                        onChange={(v) =>
                          setNewPlayer((p) => ({
                            ...p,
                            long_term_development_notes: v,
                          }))
                        }
                        placeholder="Notes"
                      />

                      <button
                        type="button"
                        onClick={async () => {
                          setErrMsg(null);
                          try {
                            await api<{ player: Player }>(
                              `/api/admin/parents/${selectedParent.id}/players`,
                              {
                                method: "POST",
                                securityCode,
                                body: JSON.stringify({
                                  ...newPlayer,
                                  crm_player_id: newPlayerCrmId || undefined,
                                  name:
                                    String(newPlayer.name ?? "").trim() ||
                                    undefined,
                                }),
                              }
                            );
                            setNewPlayer({ name: "" });
                            setNewPlayerCrmId("");
                            await loadPlayersForParent(
                              securityCode,
                              selectedParent.id
                            );
                          } catch (e) {
                            setErrMsg(
                              e instanceof Error
                                ? e.message
                                : "Failed to create player"
                            );
                          }
                        }}
                        className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      >
                        Create player
                      </button>
                    </div>

                    <div className="mt-8">
                      <div className="text-sm font-semibold text-gray-900">
                        Existing players
                      </div>
                      <div className="mt-3 grid gap-3">
                        {(playersByParent[selectedParent.id] ?? []).map(
                          (pl) => (
                            <Link
                              key={pl.id}
                              href={`/admin/player/${pl.id}`}
                              className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-left transition hover:border-emerald-300"
                            >
                              <div className="text-sm font-semibold text-gray-900">
                                {pl.name}
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                {pl.team_level ?? "—"} •{" "}
                                {pl.primary_position ?? "—"}{" "}
                                {pl.secondary_position
                                  ? `/ ${pl.secondary_position}`
                                  : ""}{" "}
                                • {pl.birth_year ?? "—"} •{" "}
                                {pl.crm_player_id
                                  ? `CRM player ${pl.crm_player_id}`
                                  : "CRM player —"}
                              </div>
                            </Link>
                          )
                        )}

                        {(playersByParent[selectedParent.id] ?? []).length ===
                          0 && (
                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-gray-700">
                            No players for this parent yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        )}

        {/* Video Management Section */}
        {authorized && (
          <div className="mt-6">
            <AdminVideos />
          </div>
        )}
      </main>

      {/* Player editing moved to /admin/player/[id] */}
    </div>
  );
}
