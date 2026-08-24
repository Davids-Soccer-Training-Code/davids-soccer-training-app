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

One row per rank test: `TEST | LEVEL | BEST | TO REACH IT | GAP`.

**Each test is measured against its own next level, not against one shared
target.** A single overall target makes any test that is already ahead read
"OK", which tells the coach nothing — a test at Level 3 still has a Level 4 to
chase, and that is the actionable fact. So `LEVEL` reads `3 > 4`, and the
requirement shown is the one for that test's next step.

- `BEST` shows **one reading per condition**, in the order the requirement
  names them — `39/27` against "28 yds strong, 28 yds weak". Collapsing these to
  the single weakest number hides the foot that is already passing, which is
  exactly what the coach needs to know.
- `GAP` is `NOT TESTED` (never run), `NO DATA` (run, but never for the metric
  the next level measures), `-N` (numeric shortfall), or `MAX` (Level 7).

Rows sort **never-tested -> closest-to-its-next-level -> maxed**, so the top row
is always the coach's next action. Only maxed rows recede; every other row has
something to do.

A never-recorded test is a distinct state from a shortfall, and is the most
actionable thing on the sheet — hence its own label and top sort priority.

### Goal panel (right, ~56mm)

Current period goal: title, date window, and its steps with checkboxes. Footer
carries the Coach Mission gate, plus the session count as a plain number —
deliberately without its minimum, so it reads as information rather than as
another bar to clear.

### Test History

Per rank test: first, previous, and latest reading, with dates and the delta
since the previous reading.

Different levels of the same test are measured on **entirely different fields**
(Dribbling green/red read figure-8 loops, blue reads cross-dribble). So the row
tracks the next level's metric where it has been recorded, and otherwise walks
back down the ladder to the highest level that does have readings — a coach who
entered figure-8 scores must still see them, even once the next level is
measured on something else. Each row is marked with which level's metric it is
showing, so the number is never ambiguous.

With only two readings the PREVIOUS column stays empty rather than repeating
FIRST, and the delta measures against FIRST instead. A raw number tells a coach nothing; a delta tells them
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
