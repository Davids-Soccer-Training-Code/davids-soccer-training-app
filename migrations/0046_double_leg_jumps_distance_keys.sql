-- 0046_double_leg_jumps_distance_keys.sql
-- Double-leg Jumps changed from time-based counts (jumps_10s/20s/30s) to
-- distance attempts (jump_1/2/3). Rename the keys on existing records.

UPDATE player_tests
SET scores = (scores
    - 'jumps_10s' - 'jumps_20s' - 'jumps_30s')
  || jsonb_strip_nulls(jsonb_build_object(
       'jump_1', scores -> 'jumps_10s',
       'jump_2', scores -> 'jumps_20s',
       'jump_3', scores -> 'jumps_30s'
     ))
WHERE test_name = 'Double-leg Jumps'
  AND (scores ? 'jumps_10s' OR scores ? 'jumps_20s' OR scores ? 'jumps_30s');
