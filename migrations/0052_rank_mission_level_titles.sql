-- 0052_rank_mission_level_titles.sql
--
-- Players now see ranks as "Level 1..7" instead of the color names, but the
-- auto-seeded coach missions still carried the old wording in their stored
-- title/description. Rewrite only the seeded placeholders — a mission a coach
-- actually wrote won't match these exact strings and is left alone.

UPDATE player_missions SET title = 'Level 2 coach mission'
  WHERE target_rank = 'green' AND title = 'Green coach mission';
UPDATE player_missions SET title = 'Level 3 coach mission'
  WHERE target_rank = 'red' AND title = 'Red coach mission';
UPDATE player_missions SET title = 'Level 4 coach mission'
  WHERE target_rank = 'blue' AND title = 'Blue coach mission';
UPDATE player_missions SET title = 'Level 5 coach mission'
  WHERE target_rank = 'platinum' AND title = 'Platinum coach mission';
UPDATE player_missions SET title = 'Level 6 coach mission'
  WHERE target_rank = 'diamond' AND title = 'Diamond coach mission';
UPDATE player_missions SET title = 'Level 7 coach mission'
  WHERE target_rank = 'master' AND title = 'Master coach mission';

UPDATE player_missions SET description = 'Auto-seeded Level 2 mission.'
  WHERE target_rank = 'green' AND description = 'Auto-seeded Green mission.';
UPDATE player_missions SET description = 'Auto-seeded Level 3 mission.'
  WHERE target_rank = 'red' AND description = 'Auto-seeded Red mission.';
UPDATE player_missions SET description = 'Auto-seeded Level 4 mission.'
  WHERE target_rank = 'blue' AND description = 'Auto-seeded Blue mission.';
UPDATE player_missions SET description = 'Auto-seeded Level 5 mission.'
  WHERE target_rank = 'platinum' AND description = 'Auto-seeded Platinum mission.';
UPDATE player_missions SET description = 'Auto-seeded Level 6 mission.'
  WHERE target_rank = 'diamond' AND description = 'Auto-seeded Diamond mission.';
UPDATE player_missions SET description = 'Auto-seeded Level 7 mission.'
  WHERE target_rank = 'master' AND description = 'Auto-seeded Master mission.';
