export type TestFieldType = "number" | "text";

export type TestField = {
  key: string;
  label: string;
  type: TestFieldType;
};

export type TestDefinition = {
  id: string; // stable key
  name: string; // display + stored name
  isRankTest?: boolean; // one of the 8 tests that drive the rank system
  fields: TestField[];
};

const numField = (key: string, label: string): TestField => ({
  key,
  label,
  type: "number",
});

export const TEST_DEFINITIONS: TestDefinition[] = [
  // ----- The 8 rank tests --------------------------------------------------
  {
    id: "juggling",
    name: "Juggling",
    isRankTest: true,
    fields: [
      numField("juggle_any", "Best juggles (any surface)"),
      numField("juggle_feet_only", "Best juggles (feet only)"),
      numField("juggle_bodypart", "Body-part challenge (parts completed)"),
      numField("juggle_speed_3min", "Speed touches in 3 minutes"),
      numField("juggle_14in14_reps", "14-in-14 reps in a row"),
      numField("juggle_weakfoot_ladder", "Weak-foot ladder touches (up & down)"),
    ],
  },
  {
    id: "dribbling",
    name: "Dribbling",
    isRankTest: true,
    fields: [
      numField("figure8_strong", "Figure-8 loops — strong foot"),
      numField("figure8_weak", "Figure-8 loops — weak foot"),
      numField("figure8_both", "Figure-8 loops — both feet"),
      numField("crossdribble_strong", "Cross-dribble loops — strong foot"),
      numField("crossdribble_weak", "Cross-dribble loops — weak foot"),
      numField("crossdribble_both", "Cross-dribble loops — both feet"),
      numField("obstacle_strong", "Obstacle shuttle score — strong foot"),
      numField("obstacle_weak", "Obstacle shuttle score — weak foot"),
      numField("obstacle_both", "Obstacle shuttle score — both feet"),
    ],
  },
  {
    id: "passing",
    name: "Passing",
    isRankTest: true,
    fields: [
      numField("passing_strong", "Gate passes — strong foot"),
      numField("passing_weak", "Gate passes — weak foot"),
      numField("passing_color_strong", "Color mini-goal passes — strong foot"),
      numField("passing_color_weak", "Color mini-goal passes — weak foot"),
      numField("passing_color_read_strong", "Read-color passes — strong foot"),
      numField("passing_color_read_weak", "Read-color passes — weak foot"),
      numField("passing_gate2yd_strong", "2-yd gate passes — strong foot"),
      numField("passing_gate2yd_weak", "2-yd gate passes — weak foot"),
    ],
  },
  {
    id: "power",
    name: "Power",
    isRankTest: true,
    fields: [
      ...Array.from({ length: 4 }, (_, i) =>
        numField(`power_strong_${i + 1}`, `Strong attempt ${i + 1}`)
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        numField(`power_weak_${i + 1}`, `Weak attempt ${i + 1}`)
      ),
    ],
  },
  {
    id: "distance",
    name: "Distance",
    isRankTest: true,
    fields: [
      ...Array.from({ length: 4 }, (_, i) =>
        numField(`serve_strong_${i + 1}`, `Strong attempt ${i + 1} (yards)`)
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        numField(`serve_weak_${i + 1}`, `Weak attempt ${i + 1} (yards)`)
      ),
    ],
  },
  {
    id: "skill_moves",
    name: "Skill Moves",
    isRankTest: true,
    fields: [
      numField("skill_moves_count", "Different moves executed"),
      numField("skill_combos_count", "Combos executed"),
      numField("skill_live_app_pct", "Live application %"),
      {
        key: "skill_move_names",
        label: "Move names (comma-separated)",
        type: "text",
      },
    ],
  },
  {
    id: "shooting_accuracy",
    name: "Shooting Accuracy",
    isRankTest: true,
    fields: [
      numField("shoot_bottom_pen", "Bottom corners — penalty/inside box (of 10)"),
      numField("shoot_bottom_top18", "Bottom corners — top of 18 (of 10)"),
      numField("shoot_bottom_moving", "Bottom corners — moving ball, top of 18 (of 15)"),
      numField("shoot_4corners_pen", "All-4 corners hit once — penalty spot (of 4)"),
      numField("shoot_4corners_top18", "All-4 corners hit once — top of 18 (of 4)"),
      numField("shoot_4corners_moving", "Corners hit twice — moving ball (of 4)"),
    ],
  },
  {
    id: "first_touch",
    name: "First Touch",
    isRankTest: true,
    fields: [
      numField("ft_ground_5x5_yards", "Ground, 5x5 box — max distance reached (yds)"),
      numField("ft_ground_3x3_1touch_yards", "Ground, 3x3, 1-touch — max distance (yds)"),
      numField("ft_aerial_3x3_yards", "Aerial, 3x3 box — max distance reached (yds)"),
      numField("ft_aerial_3x3_1touch_yards", "Aerial, 3x3, 1-touch — max distance (yds)"),
    ],
  },

  // ----- Small extra tests (not part of the rank system) -------------------
  {
    id: "agility_5_10_5",
    name: "5-10-5 Agility",
    fields: Array.from({ length: 3 }, (_, i) =>
      numField(`agility_${i + 1}`, `Trial ${i + 1} time`)
    ),
  },
  {
    id: "single_leg_hop",
    name: "Single-leg Hop",
    fields: [
      ...Array.from({ length: 3 }, (_, i) =>
        numField(`hop_left_${i + 1}`, `Left attempt ${i + 1} distance`)
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        numField(`hop_right_${i + 1}`, `Right attempt ${i + 1} distance`)
      ),
    ],
  },
  {
    id: "double_leg_jumps",
    name: "Double-leg Jumps",
    fields: [
      numField("jump_1", "Attempt 1 distance"),
      numField("jump_2", "Attempt 2 distance"),
      numField("jump_3", "Attempt 3 distance"),
    ],
  },
];

export function getTestDefinitionByName(name: string) {
  return TEST_DEFINITIONS.find((t) => t.name === name) ?? null;
}
