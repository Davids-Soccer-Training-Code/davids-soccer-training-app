import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import {
  BarChart2,
  Target,
  MessageSquare,
  Upload,
  ChevronRight,
  AlertCircle,
  Trophy,
  Star,
  Flame,
  CheckCircle2,
  ArrowRight,
  Zap,
} from "lucide-react";

import { authOptions } from "@/lib/auth";
import { sql } from "@/db";
import { getPlayerRank } from "@/lib/getPlayerRank";
import { RANK_BY_KEY } from "@/lib/rankSystem";
import { DashboardGoalSteps } from "./ui/DashboardGoalSteps";
import { RankLadder, RankBadge } from "./ui/RankLadder";

type PlayerRow = {
  name: string;
  primary_position: string | null;
  team_level: string | null;
  profile_photo_url: string | null;
  team_level_null: boolean;
  primary_position_null: boolean;
  dominant_foot: string | null;
  shirt_size: string | null;
  location: string | null;
  birthdate: string | null;
};

type ActiveGoalRow = {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
};

type GoalStepRow = {
  id: string;
  period_goal_id: string;
  title: string;
  completed: boolean;
  target_date: string | null;
};

type CoachingReportRow = {
  id: string;
  type: string;
  title: string;
  report_date: string;
  content: Record<string, unknown>;
};

type ChallengeRow = {
  id: string;
  title: string;
};

type CountRow = { count: string };
type LastDateRow = { last_date: string | null };

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function reportTypeLabel(type: string) {
  if (type === "baseline") return "Baseline Snapshot";
  if (type === "progress") return "Progress Report";
  return "Coach Note";
}

function reportPreview(report: CoachingReportRow): string {
  const c = report.content;
  if (report.type === "blurb") return String(c.text ?? "").slice(0, 160);
  if (report.type === "baseline") {
    const strengths = (c.strengths as string[] | undefined) ?? [];
    return strengths.length > 0 ? `Strengths: ${strengths.slice(0, 2).join(", ")}` : report.title;
  }
  if (report.type === "progress") {
    const notes = String(c.overall_notes ?? "").trim();
    return notes.slice(0, 160) || report.title;
  }
  return report.title;
}

export default async function PlayerDashboardPage(props: {
  params: Promise<{ playerId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const { playerId } = await props.params;
  const isAdmin = session.user.isAdmin === true;
  const today = new Date().toISOString().slice(0, 10);

  const [
    playerRows,
    activeGoalRows,
    latestReportRows,
    activeChallengeRows,
    testCountRows,
    lastTestRows,
    sessionCountRows,
    lastSessionRows,
    reportCountRows,
    completedChallengeCountRows,
  ] = await Promise.all([
    sql`
      SELECT name, primary_position, team_level, profile_photo_url,
             dominant_foot, shirt_size, location, birthdate::text AS birthdate
      FROM players
      WHERE id = ${playerId} AND (${isAdmin} OR parent_id = ${session.user.id})
      LIMIT 1
    ` as unknown as Promise<PlayerRow[]>,

    sql`
      SELECT id, title, description, start_date::text AS start_date, end_date::text AS end_date
      FROM player_period_goals
      WHERE player_id = ${playerId}
        AND start_date <= ${today}::date
        AND end_date >= ${today}::date
      ORDER BY start_date DESC
      LIMIT 1
    ` as unknown as Promise<ActiveGoalRow[]>,

    sql`
      SELECT id, type, title, report_date::text AS report_date, content
      FROM player_coaching_reports
      WHERE player_id = ${playerId}
      ORDER BY report_date DESC, created_at DESC
      LIMIT 1
    ` as unknown as Promise<CoachingReportRow[]>,

    sql`
      SELECT c.id, c.title
      FROM challenges c
      LEFT JOIN challenge_submissions cs ON cs.challenge_id = c.id AND cs.player_id = ${playerId}
      WHERE c.active = true AND cs.id IS NULL
      LIMIT 1
    ` as unknown as Promise<ChallengeRow[]>,

    sql`
      SELECT COUNT(*)::text AS count FROM player_tests WHERE player_id = ${playerId}
    ` as unknown as Promise<CountRow[]>,

    sql`
      SELECT MAX(test_date)::text AS last_date FROM player_tests WHERE player_id = ${playerId}
    ` as unknown as Promise<LastDateRow[]>,

    sql`
      SELECT COUNT(*)::text AS count
      FROM crm_sessions cs
      JOIN crm_parents cp ON cp.id = cs.parent_id
      JOIN parents pa ON pa.crm_parent_id = cp.id
      WHERE pa.id = (SELECT parent_id FROM players WHERE id = ${playerId} LIMIT 1)
        AND cs.cancelled = false
    ` as unknown as Promise<CountRow[]>,

    sql`
      SELECT MAX(cs.session_date)::text AS last_date
      FROM crm_sessions cs
      JOIN crm_parents cp ON cp.id = cs.parent_id
      JOIN parents pa ON pa.crm_parent_id = cp.id
      WHERE pa.id = (SELECT parent_id FROM players WHERE id = ${playerId} LIMIT 1)
        AND cs.cancelled = false
    ` as unknown as Promise<LastDateRow[]>,

    sql`
      SELECT COUNT(*)::text AS count FROM player_coaching_reports WHERE player_id = ${playerId}
    ` as unknown as Promise<CountRow[]>,

    sql`
      SELECT COUNT(*)::text AS count
      FROM challenge_submissions
      WHERE player_id = ${playerId}
    ` as unknown as Promise<CountRow[]>,
  ]);

  if (!playerRows[0]) redirect("/players");

  const player = playerRows[0];
  const activeGoal = activeGoalRows[0] ?? null;
  const latestReport = latestReportRows[0] ?? null;
  const activeChallenge = activeChallengeRows[0] ?? null;

  // Fetch active goal steps if we have an active goal
  const goalSteps: GoalStepRow[] = activeGoal
    ? ((await sql`
        SELECT id, period_goal_id, title, completed, target_date::text AS target_date
        FROM player_goal_steps
        WHERE period_goal_id = ${activeGoal.id}
        ORDER BY sort_order ASC, created_at ASC
      `) as unknown as GoalStepRow[])
    : [];

  const testCount = parseInt(testCountRows[0]?.count ?? "0");
  const sessionCount = parseInt(sessionCountRows[0]?.count ?? "0");
  const reportCount = parseInt(reportCountRows[0]?.count ?? "0");
  const challengesDone = parseInt(completedChallengeCountRows[0]?.count ?? "0");
  const lastTest = lastTestRows[0]?.last_date;
  const lastSession = lastSessionRows[0]?.last_date?.slice(0, 10) ?? null;

  const missingFields = [
    player.team_level,
    player.dominant_foot,
    player.shirt_size,
    player.location,
    player.birthdate,
  ].filter((v) => !v).length;

  const base = `/player/${playerId}`;

  const rank = await getPlayerRank(playerId);
  const overallRankDef = RANK_BY_KEY[rank.overall.rank];
  const targetRankDef = rank.next_checklist.targetRank
    ? RANK_BY_KEY[rank.next_checklist.targetRank]
    : null;
  const testsAtTarget = rank.next_checklist.items.filter(
    (i) => i.kind === "test" && i.ok,
  ).length;
  const firstName = player.name.split(" ")[0];

  // Completed steps count for goal header
  const stepsCompleted = goalSteps.filter((s) => s.completed).length;
  const stepsTotal = goalSteps.length;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-center gap-3">
        {player.profile_photo_url ? (
          <Image
            src={player.profile_photo_url}
            alt={player.name}
            width={48}
            height={48}
            className="h-12 w-12 rounded-full object-cover ring-2 ring-emerald-200"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-lg font-bold text-white ring-2 ring-emerald-200">
            {getInitials(player.name)}
          </div>
        )}
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Hey, {firstName}!
          </h2>
          <p className="text-sm text-gray-500">Here&apos;s where you stand today.</p>
        </div>
      </div>

      {/* Profile incomplete banner */}
      {missingFields > 0 && (
        <Link
          href={`${base}/settings`}
          className="group flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 transition hover:border-amber-300 hover:bg-amber-100"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <span className="text-sm font-semibold text-amber-800">
              Profile incomplete —{" "}
              {missingFields === 1 ? "1 field" : `${missingFields} fields`} missing.{" "}
            </span>
            <span className="text-sm text-amber-700">Finish it in Settings.</span>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-amber-400 transition group-hover:translate-x-0.5 group-hover:text-amber-600" />
        </Link>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Tests", value: testCount, icon: BarChart2, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Sessions", value: sessionCount, icon: Flame, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Reports", value: reportCount, icon: MessageSquare, color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "Challenges", value: challengesDone, icon: Trophy, color: "text-violet-600", bg: "bg-violet-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-2xl border border-gray-100 bg-white p-3 text-center shadow-sm">
            <div className={`mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-xl ${bg}`}>
              <Icon className={`h-3.5 w-3.5 ${color}`} />
            </div>
            <div className="text-lg font-bold text-gray-900 leading-none">{value}</div>
            <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Rank card */}
      <Link
        href={`${base}/rank`}
        className="group block rounded-3xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
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
                {overallRankDef.name}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <RankBadge
              name={overallRankDef.shortName}
              color={overallRankDef.color}
              size="sm"
            />
            <ChevronRight className="h-4 w-4 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-500" />
          </div>
        </div>
        <div className="mt-4">
          <RankLadder currentIndex={rank.overall.index} />
        </div>
        <div className="mt-3 text-xs text-gray-500">
          {targetRankDef ? (
            <>
              Working toward{" "}
              <span className="font-semibold text-gray-700">
                {targetRankDef.name}
              </span>{" "}
              · {testsAtTarget}/8 tests ready · tap to see what&apos;s left
            </>
          ) : (
            <>Master Rank reached — the top of the ladder! 🏆</>
          )}
        </div>
      </Link>

      {/* Active goal card */}
      {activeGoal ? (
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-700 shadow-lg">
          <div className="px-5 pt-5 pb-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Star className="h-3.5 w-3.5 text-emerald-200" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-200">
                    This Week&apos;s Goal
                  </span>
                </div>
                <h3 className="mt-1 text-lg font-bold text-white leading-snug">
                  {activeGoal.title}
                </h3>
                <p className="mt-0.5 text-xs text-emerald-200">
                  {formatDate(activeGoal.start_date)} – {formatDate(activeGoal.end_date)}
                  {stepsTotal > 0 && (
                    <span className="ml-2 font-semibold">
                      · {stepsCompleted}/{stepsTotal} steps done
                    </span>
                  )}
                </p>
              </div>
              <Link
                href={`${base}/goals`}
                className="shrink-0 flex items-center gap-1 rounded-xl bg-white/15 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/25"
              >
                All goals <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {activeGoal.description && (
              <p className="mb-3 text-sm text-emerald-100 leading-relaxed">
                {activeGoal.description}
              </p>
            )}

            {goalSteps.length > 0 ? (
              <DashboardGoalSteps
                playerId={playerId}
                goalId={activeGoal.id}
                initialSteps={goalSteps}
              />
            ) : (
              <p className="text-sm text-emerald-200 italic">No steps added yet for this goal.</p>
            )}
          </div>

          {/* All complete celebration */}
          {stepsTotal > 0 && stepsCompleted === stepsTotal && (
            <div className="border-t border-white/20 bg-white/10 px-5 py-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-white" />
              <span className="text-sm font-semibold text-white">
                All steps complete — great week! 🎉
              </span>
            </div>
          )}
        </div>
      ) : (
        <Link
          href={`${base}/goals`}
          className="group flex items-center gap-4 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 transition hover:border-emerald-300 hover:bg-emerald-100"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
            <Target className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-emerald-800">No active goal this week</div>
            <div className="text-xs text-emerald-600 mt-0.5">Check back after your next session — Coach David will set one.</div>
          </div>
          <ChevronRight className="h-4 w-4 text-emerald-400 transition group-hover:translate-x-0.5 group-hover:text-emerald-600" />
        </Link>
      )}

      {/* Latest coach note + Challenge CTA — side by side on sm+ */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Latest coaching report */}
        {latestReport ? (
          <Link
            href={`${base}/reports`}
            className="group rounded-2xl border border-purple-100 bg-purple-50 p-4 transition hover:border-purple-200 hover:bg-purple-100 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-purple-500" />
                <span className="text-xs font-semibold uppercase tracking-wide text-purple-500">
                  Latest from Coach
                </span>
              </div>
              <span className="text-xs text-purple-400">{formatDate(latestReport.report_date)}</span>
            </div>
            <div>
              <div className="text-xs font-semibold text-purple-700 mb-0.5">
                {reportTypeLabel(latestReport.type)}
              </div>
              <p className="text-sm text-purple-800 line-clamp-3 leading-relaxed">
                {reportPreview(latestReport)}
              </p>
            </div>
            <div className="mt-auto flex items-center gap-1 text-xs font-semibold text-purple-600">
              Read full report <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
            </div>
          </Link>
        ) : (
          <Link
            href={`${base}/reports`}
            className="group rounded-2xl border border-purple-100 bg-purple-50 p-4 transition hover:border-purple-200 hover:bg-purple-100 flex flex-col gap-2"
          >
            <div className="flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-purple-400">
                Feedback &amp; Reports
              </span>
            </div>
            <p className="text-sm text-purple-700">No coach feedback yet — check back after your sessions.</p>
            <div className="mt-auto flex items-center gap-1 text-xs font-semibold text-purple-500">
              View reports <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
            </div>
          </Link>
        )}

        {/* Challenge CTA */}
        {activeChallenge ? (
          <Link
            href={`${base}/uploads`}
            className="group rounded-2xl border border-violet-100 bg-violet-50 p-4 transition hover:border-violet-200 hover:bg-violet-100 flex flex-col gap-2"
          >
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-xs font-semibold uppercase tracking-wide text-violet-500">
                New Challenge
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-violet-800 leading-snug">
                {activeChallenge.title}
              </p>
              <p className="mt-1 text-xs text-violet-600">
                Film your response and submit — Coach David will review it.
              </p>
            </div>
            <div className="mt-auto flex items-center gap-1 text-xs font-semibold text-violet-600">
              Accept challenge <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
            </div>
          </Link>
        ) : challengesDone > 0 ? (
          <Link
            href={`${base}/uploads`}
            className="group rounded-2xl border border-violet-100 bg-violet-50 p-4 transition hover:border-violet-200 hover:bg-violet-100 flex flex-col gap-2"
          >
            <div className="flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-violet-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-violet-400">
                Challenges
              </span>
            </div>
            <p className="text-sm text-violet-700">
              You&apos;ve completed {challengesDone} challenge{challengesDone !== 1 ? "s" : ""}. No new ones yet — stay sharp!
            </p>
            <div className="mt-auto flex items-center gap-1 text-xs font-semibold text-violet-500">
              View challenges <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
            </div>
          </Link>
        ) : (
          <Link
            href={`${base}/uploads`}
            className="group rounded-2xl border border-violet-100 bg-violet-50 p-4 transition hover:border-violet-200 hover:bg-violet-100 flex flex-col gap-2"
          >
            <div className="flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-violet-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-violet-400">
                Challenges
              </span>
            </div>
            <p className="text-sm text-violet-700">Challenges drop after sessions — Coach David will post one for you soon.</p>
            <div className="mt-auto flex items-center gap-1 text-xs font-semibold text-violet-500">
              Extra help <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
            </div>
          </Link>
        )}
      </div>

      {/* Bottom nav cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          {
            icon: BarChart2,
            href: `${base}/progress`,
            title: "My Progress",
            stat: testCount > 0 ? `${testCount} test${testCount !== 1 ? "s" : ""} recorded` : "No tests yet",
            sub: lastTest ? `Last test: ${formatDate(lastTest)}` : "Tests are added by Coach David",
            iconBg: "bg-blue-50",
            iconColor: "text-blue-600",
            border: "hover:border-blue-200",
          },
          {
            icon: Target,
            href: `${base}/goals`,
            title: "Goals",
            stat: activeGoal ? activeGoal.title : "No active goal",
            sub: activeGoal
              ? `${stepsCompleted} of ${stepsTotal} steps done this week`
              : "Coach sets new goals each week",
            iconBg: "bg-emerald-50",
            iconColor: "text-emerald-600",
            border: "hover:border-emerald-200",
          },
          {
            icon: MessageSquare,
            href: `${base}/reports`,
            title: "Feedback & Reports",
            stat: reportCount > 0 ? `${reportCount} report${reportCount !== 1 ? "s" : ""} from coach` : "No reports yet",
            sub: lastSession ? `Last session: ${formatDate(lastSession)}` : "Sessions added by Coach David",
            iconBg: "bg-purple-50",
            iconColor: "text-purple-600",
            border: "hover:border-purple-200",
          },
          {
            icon: Upload,
            href: `${base}/uploads`,
            title: "Extra Help",
            stat: "Video library, uploads & challenges",
            sub: "Send clips to Coach David for feedback",
            iconBg: "bg-orange-50",
            iconColor: "text-orange-600",
            border: "hover:border-orange-200",
          },
        ].map(({ icon: Icon, href, title, stat, sub, iconBg, iconColor, border }) => (
          <Link
            key={href}
            href={href}
            className={`group rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition ${border} hover:shadow-md`}
          >
            <div className="flex items-start justify-between">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${iconBg}`}>
                <Icon className={`h-4 w-4 ${iconColor}`} />
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-gray-500" />
            </div>
            <div className="mt-2.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</div>
              <div className="mt-0.5 text-sm font-semibold text-gray-900 line-clamp-1">{stat}</div>
              <div className="mt-0.5 text-xs text-gray-500 line-clamp-1">{sub}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
