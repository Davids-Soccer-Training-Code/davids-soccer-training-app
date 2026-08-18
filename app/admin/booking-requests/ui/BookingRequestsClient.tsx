"use client";

import { useMemo, useState } from "react";
import { CheckCircle, XCircle, Trash2, ChevronDown, ChevronRight, CalendarCheck } from "lucide-react";
import { COACH_LABELS, COACH_SLUGS, parseCoachParam, type CoachSlug } from "@/lib/bookingSchedule";
import { COACH_ACCENT, DAVID_BADGE } from "@/lib/coachTheme";
import { CoachSwitcher } from "@/app/admin/ui/CoachSwitcher";
import { ScheduleModal } from "./ScheduleModal";

export type BookingRequest = {
  id: string;
  parent_name: string;
  player_name: string;
  phone: string | null;
  email: string | null;
  slot_date: string;
  slot_start: string;
  slot_end: string;
  notes: string | null;
  status: "pending" | "confirmed" | "cancelled" | "blocked";
  coach: string | null;
  created_at: string;
  crm_session_id: string | null;
  crm_session_kind: "first" | "session" | null;
};

function coachLabel(coach: string | null): string {
  return COACH_LABELS[coach ?? "david"] ?? "Coach David";
}

// Which coach tab a request belongs to. Requests stored before coaches existed
// have a null coach, and legacy slugs (e.g. "marcanthony") still live in the
// table — parseCoachParam maps both onto a current coach, defaulting to David.
function coachSlugOf(coach: string | null): CoachSlug {
  return parseCoachParam(coach) as CoachSlug;
}

// Match the booking calendar: each non-David coach has an accent badge, David is green.
function coachBadge(coach: string | null): string {
  return (coach && COACH_ACCENT[coach]?.badge) || DAVID_BADGE;
}

function fmt(t: string): string {
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

const statusBadge: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-gray-50 text-gray-500 border-gray-200",
  blocked: "bg-slate-100 text-slate-600 border-slate-200",
};

function RequestCard({
  r,
  busy,
  onConfirm,
  onPatch,
  onDelete,
}: {
  r: BookingRequest;
  busy: string | undefined;
  onConfirm: (r: BookingRequest) => void;
  onPatch: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-gray-900">{r.parent_name}</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${statusBadge[r.status] ?? ""}`}
            >
              {r.status}
            </span>
            <span className={coachBadge(r.coach)}>
              {coachLabel(r.coach)}
            </span>
            {r.crm_session_id && (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                <CalendarCheck className="h-3 w-3" />
                In CRM
              </span>
            )}
          </div>
          <div className="mt-0.5 text-sm text-gray-500">
            Player: <span className="font-medium text-gray-700">{r.player_name}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {r.status !== "confirmed" && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => onConfirm(r)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Confirm…
            </button>
          )}
          {r.status !== "cancelled" && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => onPatch(r.id, "cancelled")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-600 transition hover:bg-orange-50 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              {busy === "cancelled" ? "Cancelling…" : "Cancel"}
            </button>
          )}
          <button
            type="button"
            disabled={!!busy}
            onClick={() => onDelete(r.id)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {busy === "deleting" ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
        📅 {fmtDate(r.slot_date)} &middot; {fmt(r.slot_start)} – {fmt(r.slot_end)}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {r.phone && (
          <a href={`tel:${r.phone}`} className="text-emerald-700 hover:underline">
            {r.phone}
          </a>
        )}
        {r.email && (
          <a href={`mailto:${r.email}`} className="text-emerald-700 hover:underline">
            {r.email}
          </a>
        )}
      </div>

      {r.notes && (
        <div className="mt-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">
          {r.notes}
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        Submitted{" "}
        {new Date(r.created_at).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}{" "}
        at{" "}
        {new Date(r.created_at).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
}

export function BookingRequestsClient({
  initialRequests,
}: {
  initialRequests: BookingRequest[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [active, setActive] = useState<CoachSlug>("david");
  const [acting, setActing] = useState<Record<string, string>>({});
  const [confirmedOpen, setConfirmedOpen] = useState(false);
  const [cancelledOpen, setCancelledOpen] = useState(false);
  const [scheduling, setScheduling] = useState<BookingRequest | null>(null);

  // The CRM created the session, so the request is confirmed and linked.
  function onScheduled(id: string) {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "confirmed" as const } : r))
    );
    setScheduling(null);
  }

  function patch(id: string, status: string) {
    setActing((p) => ({ ...p, [id]: status }));
    void fetch(`/api/admin/booking-requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }).then((res) => {
      if (res.ok) {
        setRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: status as BookingRequest["status"] } : r))
        );
      }
      setActing((p) => { const n = { ...p }; delete n[id]; return n; });
    });
  }

  function del(id: string) {
    setActing((p) => ({ ...p, [id]: "deleting" }));
    void fetch(`/api/admin/booking-requests/${id}`, { method: "DELETE" }).then((res) => {
      if (res.ok || res.status === 204) {
        setRequests((prev) => prev.filter((r) => r.id !== id));
      }
      setActing((p) => { const n = { ...p }; delete n[id]; return n; });
    });
  }

  // One tab per coach. The badge counts pending requests — the ones that still
  // need a decision — rather than every request the coach has ever had.
  const items = useMemo(
    () =>
      COACH_SLUGS.map((slug) => ({
        slug,
        label: COACH_LABELS[slug],
        count: requests.filter((r) => r.status === "pending" && coachSlugOf(r.coach) === slug).length,
      })),
    [requests]
  );

  const mine = requests.filter((r) => coachSlugOf(r.coach) === active);
  const pending = mine.filter((r) => r.status === "pending");
  const confirmed = mine.filter((r) => r.status === "confirmed" || r.status === "blocked");
  const cancelled = mine.filter((r) => r.status === "cancelled");

  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
        No booking requests yet.
      </div>
    );
  }

  return (
    <div>
      {scheduling && (
        <ScheduleModal
          request={scheduling}
          onClose={() => setScheduling(null)}
          onScheduled={onScheduled}
        />
      )}

      <CoachSwitcher items={items} active={active} onChange={setActive} />

      {mine.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
          No booking requests for {COACH_LABELS[active]}.
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending — always visible at top */}
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Pending{pending.length > 0 ? ` (${pending.length})` : ""}
            </h2>
            {pending.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
                No pending requests.
              </div>
            ) : (
              <div className="space-y-4">
                {pending.map((r) => (
                  <RequestCard
                    key={r.id}
                    r={r}
                    busy={acting[r.id]}
                    onConfirm={setScheduling}
                    onPatch={patch}
                    onDelete={del}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Confirmed — collapsible */}
          {confirmed.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setConfirmedOpen((o) => !o)}
                className="flex w-full items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-left text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
              >
                {confirmedOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                Confirmed ({confirmed.length})
              </button>
              {confirmedOpen && (
                <div className="mt-3 space-y-4">
                  {confirmed.map((r) => (
                    <RequestCard
                      key={r.id}
                      r={r}
                      busy={acting[r.id]}
                      onConfirm={setScheduling}
                      onPatch={patch}
                      onDelete={del}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Cancelled — collapsible */}
          {cancelled.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setCancelledOpen((o) => !o)}
                className="flex w-full items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-3 text-left text-sm font-semibold text-gray-600 transition hover:bg-gray-100"
              >
                {cancelledOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                Cancelled ({cancelled.length})
              </button>
              {cancelledOpen && (
                <div className="mt-3 space-y-4">
                  {cancelled.map((r) => (
                    <RequestCard
                      key={r.id}
                      r={r}
                      busy={acting[r.id]}
                      onConfirm={setScheduling}
                      onPatch={patch}
                      onDelete={del}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
