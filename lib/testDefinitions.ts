export type TestFieldType = "number" | "text";

export type TestField = {
  key: string;
  label: string;
  type: TestFieldType;
};

export type TestDefinition = {
  id: string; // stable key
  name: string; // display + stored name
  fields: TestField[];
};

const ONE_V_ONE_ROUNDS = 5;
const SKILL_MOVES_COUNT = 6;

export const TEST_DEFINITIONS: TestDefinition[] = [
  {
    id: "power",
    name: "Power",
    fields: [
      ...Array.from({ length: 4 }, (_, i) => ({
        key: `power_strong_${i + 1}`,
        label: `Strong attempt ${i + 1}`,
        type: "number" as const,
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        key: `power_weak_${i + 1}`,
        label: `Weak attempt ${i + 1}`,
        type: "number" as const,
      })),
    ],
  },
  {
    id: "serve_distance",
    name: "Serve Distance",
    fields: [
      ...Array.from({ length: 4 }, (_, i) => ({
        key: `serve_strong_${i + 1}`,
        label: `Strong attempt ${i + 1}`,
        type: "number" as const,
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        key: `serve_weak_${i + 1}`,
        label: `Weak attempt ${i + 1}`,
        type: "number" as const,
      })),
    ],
  },
  {
    id: "figure_8_loops",
    name: "Figure 8 Loops",
    fields: [
      { key: "figure8_strong", label: "Strong foot", type: "number" },
      { key: "figure8_weak", label: "Weak foot", type: "number" },
      { key: "figure8_both", label: "Both feet", type: "number" },
    ],
  },
  {
    id: "passing_gates",
    name: "Passing Gates",
    fields: [
      { key: "passing_strong", label: "Strong foot", type: "number" },
      { key: "passing_weak", label: "Weak foot", type: "number" },
    ],
  },
  {
    id: "one_v_one",
    name: "1v1",
    fields: Array.from({ length: ONE_V_ONE_ROUNDS }, (_, i) => ({
      key: `onevone_round_${i + 1}`,
      label: `Round ${i + 1} score`,
      type: "number" as const,
    })),
  },
  {
    id: "juggling",
    name: "Juggling",
    fields: Array.from({ length: 4 }, (_, i) => ({
      key: `juggling_${i + 1}`,
      label: `Attempt ${i + 1} touches`,
      type: "number" as const,
    })),
  },
  {
    id: "skill_moves",
    name: "Skill Moves",
    fields: Array.from({ length: SKILL_MOVES_COUNT }, (_, i) => ({
      key: `skillmove_${i + 1}`,
      label: `Move ${i + 1} rating`,
      type: "number" as const,
    })),
  },
  {
    id: "agility_5_10_5",
    name: "5-10-5 Agility",
    fields: Array.from({ length: 3 }, (_, i) => ({
      key: `agility_${i + 1}`,
      label: `Trial ${i + 1} time`,
      type: "number" as const,
    })),
  },
  {
    id: "reaction_sprint",
    name: "Reaction Sprint",
    fields: Array.from({ length: 3 }, (_, i) => [
      {
        key: `reaction_cue_${i + 1}`,
        label: `Reaction trial ${i + 1} time`,
        type: "number" as const,
      },
      {
        key: `reaction_total_${i + 1}`,
        label: `Reaction total trial ${i + 1} time`,
        type: "number" as const,
      },
    ]).flat(),
  },
  {
    id: "single_leg_hop",
    name: "Single-leg Hop",
    fields: [
      ...Array.from({ length: 3 }, (_, i) => ({
        key: `hop_left_${i + 1}`,
        label: `Left attempt ${i + 1} distance`,
        type: "number" as const,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        key: `hop_right_${i + 1}`,
        label: `Right attempt ${i + 1} distance`,
        type: "number" as const,
      })),
    ],
  },
  {
    id: "double_leg_jumps",
    name: "Double-leg Jumps",
    fields: [
      { key: "jump_1", label: "Attempt 1 distance", type: "number" },
      { key: "jump_2", label: "Attempt 2 distance", type: "number" },
      { key: "jump_3", label: "Attempt 3 distance", type: "number" },
    ],
  },
  {
    id: "ankle_dorsiflexion",
    name: "Ankle Dorsiflexion",
    fields: [
      { key: "ankle_left", label: "Left distance", type: "number" },
      { key: "ankle_right", label: "Right distance", type: "number" },
    ],
  },
  {
    id: "core_plank",
    name: "Core Plank",
    fields: [
      { key: "plank_time", label: "Hold time", type: "number" },
      { key: "plank_form", label: "Form flag", type: "number" },
    ],
  },
];

export function getTestDefinitionByName(name: string) {
  return TEST_DEFINITIONS.find((t) => t.name === name) ?? null;
}
