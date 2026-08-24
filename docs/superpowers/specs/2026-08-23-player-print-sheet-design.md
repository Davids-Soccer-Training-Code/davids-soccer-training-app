# Player Print Sheet — one-page A4 PDF

## Purpose

A coach-facing sheet, printed from the admin player page, that answers one
question at a glance: **what does this player need to work on next?**

It is a working sheet, not a trophy sheet. Gaps outrank achievements. Anything
the coach cannot act on at the field is cut.

## Hard constraint

**The sheet is always exactly one A4 page.** Never two. Every variable-length
field is clamped to a fixed line budget with an ellipsis; the layout never
reflows to a second page. A sheet that is sometimes two pages is worse than one
that is always one.

## Layout (A4, 210x297mm, 14mm margins -> 182x269mm usable)

| Band | Height | Content |
|---|---|---|
| Header | 44mm | Photo, name, all player info, parent contact |
| The 8 Tests + Goal panel | 76mm | Two columns, side by side |
| Test History | 56mm | First / previous / latest + delta |
| Latest Report | remainder (~85mm) | Ratings row + summary fields |

### Header

Photo (26mm square, left). Beside it: name, then a three-column info grid —
age / birth year / team level / location / shirt size / positions / dominant
foot — then a divider and the parent contact line (name, phone, email,
secondary parent).

### The 8 Tests (left, ~118mm)

One row per rank test: `TEST | NOW | BEST | NEEDS FOR LEVEL N | flag`.

- `NOW` is the player's current level for that test.
- `BEST` is the current reading of the weakest condition on the next-level
  requirement, so `BEST` and `NEEDS` are directly comparable numbers.
- `flag` is a single glyph: `!` never tested, `-N` numeric gap, `OK` passed.

Rows sort **never-tested -> closest-to-passing -> passed**, so the top row is
always the coach's next action. Passed rows still print (all 8 levels are
wanted) but greyed, so the eye lands on the gaps.

A never-recorded test is a distinct state from a failed one, and is the most
actionable thing on the sheet — hence its own glyph and top sort priority.

### Goal panel (right, ~56mm)

Current period goal: title, date window, and its steps with checkboxes. Footer
carries the other two rank gates, Coach Mission and Sessions, since they are
requirements too and the panel has room.

### Test History

Per rank test: first, previous, and latest score with dates, plus the delta
since the previous test. A raw number tells a coach nothing; a delta tells them
whether the plan is working. Flat or negative deltas are flagged.

### Latest Report

The most recent `progress` or `baseline` coaching report. Progress reports print
the six skill ratings as a compact dot row plus all three summary fields.
Baseline reports print their five fields. Each field is clamped.

## Explicitly cut

Overall rank badge (per-test levels replace it), coach eye-test ratings,
session notes box, raw score tables, video and mission links (dead on paper),
chat, uploads, blog, full report text beyond the clamp.

## Rank naming

Players and coaches only ever see "Level 1..7". The colour-word keys are
internal identifiers persisted in the DB and must never render.

## Components

- `lib/rankSystem.ts` — add `requirementReadings` / `weakestRequirementReading`
  so the sheet can show current-vs-needed numbers, not just a 0..1 ratio.
- `lib/playerPrintSheet.ts` — gathers and shapes the data (server-only).
- `lib/playerSheetPdf.ts` — pure renderer, data in, PDF bytes out.
- `app/api/admin/players/[playerId]/print/route.ts` — admin-gated GET.
- Print button on the admin player page.

The renderer is pure so the layout can be tested without a database.

## Print constraints

Grayscale-safe: rank colour is never the only signal, always paired with the
level number. Minimum 6.5pt type. Photo embedded as PNG or JPEG (pdf-lib
supports no other format); any other content type is skipped and the initials
placeholder is drawn instead.
