-- Per-player kit/photo tracking for the coach roster. Keyed on the CRM player
-- rather than an app account, because plenty of players a coach has trained
-- have no app login. One row per player, not per coach: a shirt is a shirt
-- whoever handed it over, and the photo only has to happen with one coach.
CREATE TABLE IF NOT EXISTS player_checklist (
  crm_player_id INTEGER PRIMARY KEY,
  has_shirt     BOOLEAN NOT NULL DEFAULT false,
  has_photo     BOOLEAN NOT NULL DEFAULT false,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
