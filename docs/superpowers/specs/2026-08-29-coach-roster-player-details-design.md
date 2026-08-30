# Coach roster player details — age, team, position, notes

## Purpose

A card on `/admin/coach-players` says who a player's parent is, how many
sessions they have left, and when they were last seen. It says nothing about
the player. A coach opening the roster before a session with a new player
cannot see how old they are, what team they play for, what position they play,
or anything anyone has written about them.

This adds those four facts to every card, and lets a coach fix them in place.

## What appears on the card

A meta line of chips under the parent contact row:

```
Age 11 · Rush SC 11B · Center Mid          [Edit]
```

A missing value renders as a muted `Add age` / `Add team` / `Add position`
chip, so blank new players are visible at a glance rather than silently
identical to filled-in ones.

Below the shirt/photo checkboxes, a notes block:

- **From the CRM** — `crm_players.notes`, greyed and read-only. Rendered only
  when one exists (16 players today).
- **Coach notes** — one editable multiline box.

`[Edit]` expands an inline form on the card (age / team / position / notes)
with Save and Cancel. It reuses the optimistic-save-and-roll-back behavior of
the existing shirt/photo boxes, including the red "Didn't save" marker.

## Where each value is read from

Each field resolves through a fallback chain, so the card shows the best
available truth rather than one table's blanks.

| Field | Read order |
|---|---|
| Age | computed from `players.birthdate` → `players.age` → `player_details.age` → `crm_players.age` |
| Team | `players.team_level` → `player_details.team` → `crm_players.team` |
| Position | `players.primary_position` (+ secondary if set) → `player_details.position` |
| Coach notes | `players.long_term_development_notes` → `player_details.notes` |
| CRM note | `crm_players.notes`, read-only |

`player_details` sits in the chain even for a linked player, so anything a
coach typed while the player had no account survives the account being created.

**A birthdate wins over a typed age.** When `players.birthdate` is set the chip
shows the age computed from it — always current — and the age input is
read-only, labelled as coming from the birthday, with the profile page named as
where to change it. A hand-typed number can never shadow a real birthday, and
no stale age silently contradicts the player's own profile.

## Where edits are written

`PATCH /api/admin/coach-players/[crmPlayerId]` — the route that already handles
the shirt/photo toggles, extended rather than duplicated. It resolves the
player once and branches:

- **Has an app account** → `UPDATE players` (`age`, `team_level`,
  `primary_position`, `long_term_development_notes`). These are the same
  columns the player admin page edits and the printed coaching sheet reads, so
  a fix made on the roster shows up on the profile and the next sheet.
- **No app account** (roughly 50 of 126 CRM players) → upsert into
  `player_details`, a new app-owned table keyed on `crm_player_id`. Same shape
  and same reasoning as `player_checklist` (migration 0053): plenty of players
  a coach has trained have no app login, and their details still have to live
  somewhere.

**Nothing writes to `crm_*`.** The CRM owns those tables; the training app
reads them. A coach editing a roster card never mutates CRM data.

## Schema

```sql
CREATE TABLE IF NOT EXISTS player_details (
  crm_player_id INTEGER PRIMARY KEY,
  age           INTEGER,
  team          TEXT,
  position      TEXT,
  notes         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Additive — one new table, no `ALTER`s — so it is safe to run against the
shared production database ahead of the deploy. Deployed code that has never
heard of the table is unaffected.

## Validation and error handling

On the route:

- `age` — integer 3–25, or null to clear. Anything else is a 400.
- `team`, `position`, `notes` — trimmed; an empty string stores null.
- Every field is optional. A key that is absent is left untouched (the same
  `COALESCE`/`CASE` pattern the shirt/photo upsert already uses), so the
  checkbox toggles and the detail form cannot clobber each other.
- Age sent for a player whose birthdate is on file is ignored rather than
  rejected — the UI already disables that input, and a stray value should not
  fail an otherwise good save.

In the UI, a failed save restores the previous values and shows the existing
red "Didn't save" marker.

## Query

`app/admin/coach-players/page.tsx` gains one `LEFT JOIN player_details` and
selects `pl.age`, `pl.team`, `pl.notes` from `crm_players` plus the profile
columns reachable through the `players` join it already has. The `GROUP BY`
grows to match. No new joins beyond the one table.

## Out of scope

- Gender, dominant foot, shirt size, secondary position — not asked for, and
  the card is already dense.
- The printed score card and coaching sheet keep their current fields.
- Writing any of this back into the CRM.

## Verification

No test framework in this repo.

- `npm run lint` and `npm run build` both clean.
- Dev server: load `/admin/coach-players`; edit a linked player and confirm the
  value appears on their `/admin/player/[id]` profile; edit a CRM-only player
  and confirm it survives a reload; confirm a player with a birthdate shows a
  read-only age.
