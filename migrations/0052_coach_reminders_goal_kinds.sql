-- Goal reminders: one to set a period goal up when there isn't a live one, and
-- one to review it with the player every other session.
ALTER TABLE coach_reminders DROP CONSTRAINT coach_reminders_kind_check;
ALTER TABLE coach_reminders ADD CONSTRAINT coach_reminders_kind_check
  CHECK (kind IN (
    'mini_note', 'initial_report', 'progress_report',
    'parent_checkin', 'media', 'data_collection',
    'goal_setup', 'goal_checkin'
  ));
