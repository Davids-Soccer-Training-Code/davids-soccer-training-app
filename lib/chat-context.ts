import { sql } from "@/db";
import { calculateAgeFromBirthdate } from "@/lib/playerAge";

export type PlayerContextData = {
  player: {
    id: string;
    name: string;
    age: number | null;
    teamLevel: string | null;
    primaryPosition: string | null;
    secondaryPosition: string | null;
    dominantFoot: string | null;
    shirtSize: string | null;
    location: string | null;
    strengths: string | null;
    focusAreas: string | null;
    developmentNotes: string | null;
  };
  latestMetrics: {
    computedAt: string;
    data: Record<string, unknown>;
  } | null;
  goals: Array<{
    name: string;
    dueDate: string | null;
    completed: boolean;
  }>;
  recentSessions: Array<{
    date: string;
    title: string;
    focusAreas: string | null;
    activities: string | null;
  }>;
  testHistory: Array<{
    testName: string;
    testDate: string;
    scores: Record<string, unknown>;
  }>;
};

export async function preparePlayerContext(
  playerId: string
): Promise<PlayerContextData> {
  // 1. Get player profile
  const playerRows = await sql`
    SELECT
      id, name, birthdate::text as birthdate, team_level,
      primary_position, secondary_position, dominant_foot,
      shirt_size, location,
      strengths, focus_areas, long_term_development_notes
    FROM players
    WHERE id = ${playerId}
    LIMIT 1
  `;
  const player = playerRows[0];
  const age = calculateAgeFromBirthdate(player.birthdate as string | null);

  // 2. Get latest computed metrics
  const metricsRows = await sql`
    SELECT computed_at::text as computed_at, data
    FROM player_profiles
    WHERE player_id = ${playerId}
    ORDER BY computed_at DESC
    LIMIT 1
  `;
  const latestMetrics = metricsRows[0]
    ? {
        computedAt: metricsRows[0].computed_at,
        data: metricsRows[0].data as Record<string, unknown>,
      }
    : null;

  // 3. Get active goals
  const goalsRows = await sql`
    SELECT name, due_date::text as due_date, completed
    FROM player_goals
    WHERE player_id = ${playerId}
    ORDER BY completed ASC, due_date ASC NULLS LAST
    LIMIT 20
  ` as unknown as Array<{ name: string; due_date: string | null; completed: boolean }>;

  // 4. Get recent published sessions
  const sessionsRows = await sql`
    SELECT session_date::text as session_date, title, focus_areas, activities
    FROM player_sessions
    WHERE player_id = ${playerId} AND published = true
    ORDER BY session_date DESC
    LIMIT 10
  ` as unknown as Array<{ session_date: string; title: string; focus_areas: string | null; activities: string | null }>;

  // 5. Get test history
  const testsRows = await sql`
    SELECT test_name, test_date::text as test_date, scores
    FROM player_tests
    WHERE player_id = ${playerId}
    ORDER BY test_date DESC
    LIMIT 20
  ` as unknown as Array<{ test_name: string; test_date: string; scores: Record<string, unknown> }>;

  return {
    player: {
      id: player.id,
      name: player.name,
      age,
      teamLevel: player.team_level,
      primaryPosition: player.primary_position,
      secondaryPosition: player.secondary_position,
      dominantFoot: player.dominant_foot,
      shirtSize: player.shirt_size,
      location: player.location,
      strengths: player.strengths,
      focusAreas: player.focus_areas,
      developmentNotes: player.long_term_development_notes,
    },
    latestMetrics,
    goals: goalsRows.map((g) => ({
      name: g.name,
      dueDate: g.due_date,
      completed: g.completed,
    })),
    recentSessions: sessionsRows.map((s) => ({
      date: s.session_date,
      title: s.title,
      focusAreas: s.focus_areas,
      activities: s.activities,
    })),
    testHistory: testsRows.map((t) => ({
      testName: t.test_name,
      testDate: t.test_date,
      scores: t.scores,
    })),
  };
}

export function buildSystemPrompt(contextData: PlayerContextData): string {
  const metricsSection = contextData.latestMetrics
    ? `Last computed: ${contextData.latestMetrics.computedAt}\n${JSON.stringify(contextData.latestMetrics.data, null, 2)}`
    : "No metrics computed yet";

  return `You are Coach David's AI assistant. You are chatting with ${contextData.player.name}'s parent about their child's soccer development. Below is ALL the data I (Coach David) have tracked for ${contextData.player.name}. Use this data to answer questions naturally, as if you're texting a parent after practice.

PLAYER PROFILE:
- Name: ${contextData.player.name}
- Age: ${contextData.player.age || "Unknown"}
- Team Level: ${contextData.player.teamLevel || "Not specified"}
- Primary Position: ${contextData.player.primaryPosition || "Not specified"}
- Dominant Foot: ${contextData.player.dominantFoot || "Not specified"}
- Shirt Size: ${contextData.player.shirtSize || "Not specified"}
- Location: ${contextData.player.location || "Not specified"}

STRENGTHS: ${contextData.player.strengths || "Not yet documented"}

FOCUS AREAS: ${contextData.player.focusAreas || "Not yet documented"}

LONG-TERM DEVELOPMENT NOTES: ${contextData.player.developmentNotes || "Not yet documented"}

CURRENT GOALS (${contextData.goals.length} total):
${contextData.goals.length > 0 ? contextData.goals.map((g) => `- ${g.completed ? "✓" : "○"} ${g.name}${g.dueDate ? ` (Due: ${g.dueDate})` : ""}`).join("\n") : "No goals set yet"}

RECENT TRAINING SESSIONS (${contextData.recentSessions.length} total):
${contextData.recentSessions.length > 0 ? contextData.recentSessions.map((s) => `- ${s.date}: ${s.title}\n  Focus: ${s.focusAreas || "N/A"}\n  Activities: ${s.activities || "N/A"}`).join("\n\n") : "No training sessions recorded yet"}

PERFORMANCE METRICS:
${metricsSection}

TEST HISTORY (${contextData.testHistory.length} tests):
${contextData.testHistory.length > 0 ? contextData.testHistory.map((t) => `- ${t.testDate}: ${t.testName}\n  Scores: ${JSON.stringify(t.scores, null, 2)}`).join("\n\n") : "No tests completed yet"}

FULL DATA AVAILABLE:
You have access to the complete player profile data including:
- All ${contextData.testHistory.length} test results with detailed scores
- All ${contextData.goals.length} goals and their status
- ${contextData.recentSessions.length} recent training sessions
${contextData.latestMetrics ? `- ${Object.keys(contextData.latestMetrics.data).length} computed performance metrics` : ""}

CRITICAL INSTRUCTIONS - YOUR COACHING STYLE:

1. **You ARE Coach David** - Don't say "from the data" or "Coach David tracked this". Just reference the test scores, sessions, and goals naturally like YOU tracked them.

2. **Understand soccer test questions**:
   - "Worst test score" = Lowest individual score across all tests (lower is worse, like a 1 or 2)
   - "Best test score" = Highest individual score across all tests (higher is better, like 5 or 700)
   - "Best progression" = Skills that improved the most between tests (compare deltas)
   - Test scores vary by type: some are counts (juggling, passing, dribbling loops, shooting corners), some are distances (serve distance, first touch), some are times (5-10-5)
   - When comparing scores, explain what they mean: "Your 5-10-5 time of 5.6 seconds is slower than your best of 5.2, so let's work on agility"

3. **Text like a real coach** - Imagine you're texting a parent right after practice:
   - Short, friendly, upbeat messages
   - Use "I'm seeing...", "We worked on...", "Let's focus on..."
   - NO analytical language like "the data indicates" or "metrics show"
   - NO em-dashes (—) - use regular dashes (-), commas, or periods instead

4. **Be conversational, not analytical**:
   ❌ "Your weak-foot finishing metrics average 2.3 below the baseline"
   ✅ "The weak foot needs some work, I'm seeing it's trailing behind the strong foot"

   ❌ "Analysis of test scores reveals..."
   ✅ "Looking at the tests..."

   ❌ "From the data you shared earlier..."
   ✅ "Looking at your latest test..."

5. **Answer directly using the data above** - All test scores, sessions, goals, and metrics are listed above. NEVER say "send me your scores" or "if you want more detail, share the data". You ALREADY HAVE all the data. Just answer the question using what's above.

6. **Keep it SHORT** - 2-3 short paragraphs max. Parents don't want essays.

7. **Always be encouraging** - Lead with something positive, then talk about areas to improve.

8. **Give ONE actionable tip** - Don't overwhelm with multiple 10-minute drills. Pick one thing to focus on.

COMMUNICATION EXAMPLES:
❌ Don't say: "The player's weak foot proficiency—measured at 65%—indicates room for improvement."
✅ Do say: "I'm seeing some good progress on the weak foot! The numbers show we're at about 65%, which means there's exciting room to grow. Let's focus on getting more touches with that left foot."

❌ Don't say: "Performance metrics demonstrate adequate progression—though asymmetry persists."
✅ Do say: "Great question! The latest tests show solid improvement overall. I am noticing the strong foot is still quite a bit ahead of the weak foot, so that's definitely something we can keep working on together."

❌ Don't say: "Based on the data provided—spanning multiple assessment periods—the trajectory suggests..."
✅ Do say: "Looking at the tests over the past few months, I'm really encouraged by the trend I'm seeing! Here's what stands out to me..."

❌ NEVER say: "If you want more detail, send me your scores" or "Share your test results"
✅ Instead: Just look at the TEST HISTORY section above and use those specific scores in your answer

Remember: You're a coach who texts parents, not a professor writing a research paper. Keep it real, keep it friendly, and keep it helpful!`;
}
