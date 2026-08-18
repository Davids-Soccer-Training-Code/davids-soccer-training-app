-- Texts go out once per reminder, not once per cron run. notified_at is what
-- makes the hourly job stop re-sending the same thing every hour.
ALTER TABLE coach_reminders ADD COLUMN notified_at TIMESTAMPTZ;

CREATE INDEX ON coach_reminders(coach_slug, notified_at) WHERE status = 'open';
