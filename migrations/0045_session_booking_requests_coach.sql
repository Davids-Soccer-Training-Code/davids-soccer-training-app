ALTER TABLE session_booking_requests
  ADD COLUMN IF NOT EXISTS coach TEXT NOT NULL DEFAULT 'david';

CREATE INDEX IF NOT EXISTS session_booking_requests_coach_idx
  ON session_booking_requests(coach);
