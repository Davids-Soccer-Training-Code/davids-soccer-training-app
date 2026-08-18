-- The data-collection rule was added after 0049, so its kind has to join the
-- CHECK list.
ALTER TABLE coach_reminders DROP CONSTRAINT coach_reminders_kind_check;
ALTER TABLE coach_reminders ADD CONSTRAINT coach_reminders_kind_check
  CHECK (kind IN (
    'mini_note', 'initial_report', 'progress_report',
    'parent_checkin', 'media', 'data_collection'
  ));
