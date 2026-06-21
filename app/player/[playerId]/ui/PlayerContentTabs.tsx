"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  BarChart2,
  Trophy,
  Target,
  FileText,
  Upload,
  LayoutDashboard,
  Settings,
  ChevronRight,
} from "lucide-react";
import { PlayerInsights } from "./PlayerInsights";
import { PlayerRank } from "./PlayerRank";
import { RankLadder, RankBadge } from "./RankLadder";
import { RANK_BY_KEY } from "@/lib/rankSystem";
import type { PlayerRankSummary } from "@/lib/getPlayerRank";
import { PlayerGoals } from "./PlayerGoals";
import { PlayerUploads } from "./PlayerUploads";
import { PlayerSessions } from "./PlayerSessions";
import {
  parsePlayerHash,
  scrollToPlayerSection,
  updatePlayerHash,
} from "./playerHashNavigation";

type TabType =
  | "rank"
  | "tests"
  | "goals"
  | "reports"
  | "uploads"
  | "dashboard"
  | "settings";

type TabTargets = {
  testId: string | null;
  goalId: string | null;
  uploadId: string | null;
};

interface PlayerContentTabsProps {
  playerId: string;
  isAdminMode?: boolean;
  settingsContent: ReactNode;
}

const SIDEBAR_ITEMS: {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "rank", label: "Rank Up", icon: Trophy },
  { id: "tests", label: "My Progress", icon: BarChart2 },
  { id: "goals", label: "Goals", icon: Target },
  { id: "reports", label: "Feedback & Reports", icon: FileText },
  { id: "uploads", label: "Extra Help", icon: Upload },
  { id: "settings", label: "Settings", icon: Settings },
];

function TabPageHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6 flex items-start gap-3 border-b border-gray-100 pb-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
        <Icon className="h-5 w-5 text-emerald-700" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        <p className="mt-0.5 text-sm text-gray-500">{description}</p>
      </div>
    </div>
  );
}

type GoalRow = { completed: boolean };
type SessionRow = { session_date: string };
type TestRow = { test_date: string };

function PlayerDashboard({
  playerId,
  onNavigate,
}: {
  playerId: string;
  onNavigate: (tab: TabType) => void;
}) {
  const [goalCounts, setGoalCounts] = useState<{
    done: number;
    remaining: number;
  } | null>(null);
  const [lastSession, setLastSession] = useState<string | null | undefined>(
    undefined
  );
  const [lastTest, setLastTest] = useState<string | null | undefined>(
    undefined
  );
  const [rank, setRank] = useState<PlayerRankSummary | null>(null);

  useEffect(() => {
    fetch(`/api/players/${playerId}/rank`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setRank(d.rank))
      .catch(() => {});
  }, [playerId]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/players/${playerId}/goals`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`/api/players/${playerId}/sessions`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`/api/players/${playerId}/tests`)
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([gls, sess, tsts]) => {
      if (Array.isArray(gls)) {
        setGoalCounts({
          done: gls.filter((g: GoalRow) => g.completed).length,
          remaining: gls.filter((g: GoalRow) => !g.completed).length,
        });
      }
      if (Array.isArray(sess) && sess.length > 0) {
        setLastSession(
          new Date((sess[0] as SessionRow).session_date).toLocaleDateString(
            "en-US",
            { month: "short", day: "numeric" }
          )
        );
      } else {
        setLastSession(null);
      }
      if (Array.isArray(tsts) && tsts.length > 0) {
        const sorted = [...(tsts as TestRow[])].sort(
          (a, b) =>
            new Date(b.test_date).getTime() - new Date(a.test_date).getTime()
        );
        setLastTest(
          new Date(sorted[0].test_date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        );
      } else {
        setLastTest(null);
      }
    });
  }, [playerId]);

  const cards: {
    icon: React.ComponentType<{ className?: string }>;
    tab: TabType;
    title: string;
    stat: string;
    sub: string;
    iconBg: string;
    iconColor: string;
  }[] = [
    {
      icon: BarChart2,
      tab: "tests",
      title: "My Progress",
      stat:
        lastTest !== undefined
          ? lastTest
            ? `Last test: ${lastTest}`
            : "No tests recorded yet"
          : "—",
      sub:
        lastTest !== undefined && !lastTest
          ? "Tests are added by Coach David"
          : "Track scores across all test types",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      icon: Target,
      tab: "goals",
      title: "Goals",
      stat: goalCounts
        ? `${goalCounts.done} complete · ${goalCounts.remaining} to go`
        : "—",
      sub:
        goalCounts?.remaining === 0 && (goalCounts?.done ?? 0) > 0
          ? "Great work — all goals complete!"
          : "Set and track your training goals",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
    {
      icon: FileText,
      tab: "reports",
      title: "Feedback & Reports",
      stat:
        lastSession !== undefined
          ? lastSession
            ? `Last session: ${lastSession}`
            : "No sessions yet"
          : "—",
      sub:
        lastSession !== undefined && !lastSession
          ? "Sessions are added by Coach David"
          : "Review notes from each training session",
      iconBg: "bg-purple-50",
      iconColor: "text-purple-600",
    },
    {
      icon: Upload,
      tab: "uploads",
      title: "Extra Help",
      stat: "Send clips to Coach David",
      sub: "Get personalized feedback on your game",
      iconBg: "bg-orange-50",
      iconColor: "text-orange-600",
    },
  ];

  return (
    <div>
      <TabPageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description="Your training hub — see everything at a glance."
      />
      {rank ? (
        <button
          type="button"
          onClick={() => onNavigate("rank")}
          className="group mb-4 block w-full rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition hover:border-emerald-200 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
                <Trophy className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Current Rank
                </div>
                <div className="text-base font-bold text-gray-900 leading-tight">
                  {RANK_BY_KEY[rank.overall.rank].name}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <RankBadge
                name={RANK_BY_KEY[rank.overall.rank].shortName}
                color={rank.overall.color}
                size="sm"
              />
              <ChevronRight className="h-4 w-4 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-500" />
            </div>
          </div>
          <div className="mt-4">
            <RankLadder currentIndex={rank.overall.index} />
          </div>
        </button>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ icon: Icon, tab, title, stat, sub, iconBg, iconColor }) => (
          <button
            key={tab}
            type="button"
            onClick={() => onNavigate(tab)}
            className="group rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition hover:border-emerald-200 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}
              >
                <Icon className={`h-4 w-4 ${iconColor}`} />
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-500" />
            </div>
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {title}
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {stat}
              </div>
              <div className="mt-0.5 text-xs text-gray-500">{sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PlayerContentTabs({
  playerId,
  isAdminMode,
  settingsContent,
}: PlayerContentTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [tabTargets, setTabTargets] = useState<TabTargets>({
    testId: null,
    goalId: null,
    uploadId: null,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyHash = () => {
      const hashState = parsePlayerHash(window.location.hash);
      if (hashState.tab) {
        setActiveTab(hashState.tab);
      }
      setTabTargets({
        testId: hashState.testId,
        goalId: hashState.goalId,
        uploadId: hashState.uploadId,
      });
      if (
        hashState.section === "tests" ||
        hashState.section === "workspace" ||
        hashState.tab
      ) {
        scrollToPlayerSection("player-section");
      }
    };

    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => {
      window.removeEventListener("hashchange", applyHash);
    };
  }, []);

  function handleTabClick(tab: TabType) {
    setActiveTab(tab);
    updatePlayerHash({ section: "workspace", tab });
  }

  return (
    <section
      id="player-section"
      className="rounded-3xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:border-r lg:border-emerald-100 lg:pr-4">
          <nav className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
            {SIDEBAR_ITEMS.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleTabClick(id)}
                  className={
                    isActive
                      ? "flex items-center gap-3 rounded-xl bg-emerald-600 px-4 py-3 text-left text-sm font-semibold text-white transition"
                      : "flex items-center gap-3 rounded-xl border border-emerald-100 bg-white px-4 py-3 text-left text-sm font-semibold text-emerald-800 transition hover:border-emerald-200 hover:bg-emerald-50"
                  }
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-emerald-500"}`}
                  />
                  {label}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          {activeTab === "dashboard" && (
            <PlayerDashboard playerId={playerId} onNavigate={handleTabClick} />
          )}
          {activeTab === "rank" && (
            <>
              <TabPageHeader
                icon={Trophy}
                title="Rank Up"
                description="Your rank, what each test is at, and how to reach the next level."
              />
              <PlayerRank playerId={playerId} isAdminMode={isAdminMode} />
            </>
          )}
          {activeTab === "tests" && (
            <>
              <TabPageHeader
                icon={BarChart2}
                title="My Progress"
                description="Test results and progressions tracked over time."
              />
              <PlayerInsights
                playerId={playerId}
                isAdminMode={isAdminMode}
                targetTestId={tabTargets.testId}
              />
            </>
          )}
          {activeTab === "goals" && (
            <>
              <TabPageHeader
                icon={Target}
                title="Goals"
                description="Your active training goals and milestones."
              />
              <PlayerGoals
                playerId={playerId}
                isAdminMode={isAdminMode}
                targetGoalId={tabTargets.goalId}
              />
            </>
          )}
          {activeTab === "reports" && (
            <>
              <TabPageHeader
                icon={FileText}
                title="Feedback & Reports"
                description="Training session notes added by Coach David."
              />
              <PlayerSessions playerId={playerId} />
            </>
          )}
          {activeTab === "uploads" && (
            <>
              <TabPageHeader
                icon={Upload}
                title="Extra Help"
                description="Send Coach David video clips for personalized feedback."
              />
              <PlayerUploads
                playerId={playerId}
                targetUploadId={tabTargets.uploadId}
              />
            </>
          )}
          {activeTab === "settings" && (
            <>
              <TabPageHeader
                icon={Settings}
                title="Settings"
                description="Update your player's profile and basic info."
              />
              {settingsContent}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
