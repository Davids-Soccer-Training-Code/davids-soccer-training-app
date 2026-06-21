-- 0047_rank_system_missions.sql
-- Rank system revamp:
--   * Remove tests that are no longer used (and their data).
--   * Rename data-compatible tests to the new rank-system names.
--   * Drop old-format data for tests whose score schema fundamentally changed.
--   * Add the per-player Coach Mission table that gates rank-ups.

-- 1. Delete data for removed tests + tests whose score schema changed shape.
--    (Juggling and Skill Moves move from old fields/arrays to brand-new fields.)
DELETE FROM player_tests
WHERE test_name IN (
  '1v1',
  'Reaction Sprint',
  'Ankle Dorsiflexion',
  'Core Plank',
  'Juggling',
  'Skill Moves'
);

-- 2. Rename data-compatible tests to the new names used by the rank system.
UPDATE player_tests SET test_name = 'Distance'  WHERE test_name = 'Serve Distance';
UPDATE player_tests SET test_name = 'Dribbling' WHERE test_name = 'Figure 8 Loops';
UPDATE player_tests SET test_name = 'Passing'   WHERE test_name = 'Passing Gates';

-- 3. Per-player Coach Mission ("missions"). One required mission per rank gates the
--    rank-up; completing it ticks that box on the rank checklist.
CREATE TABLE IF NOT EXISTS player_missions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  target_rank   TEXT NOT NULL CHECK (target_rank IN ('green','red','blue','platinum','diamond','master')),
  test_category TEXT,
  title         TEXT NOT NULL,
  description   TEXT,
  video_url     TEXT,
  is_youtube    BOOLEAN NOT NULL DEFAULT false,
  status        TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','completed')),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_missions_player_rank_idx
  ON player_missions(player_id, target_rank);

DROP TRIGGER IF EXISTS player_missions_set_updated_at ON player_missions;
CREATE TRIGGER player_missions_set_updated_at
  BEFORE UPDATE ON player_missions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
