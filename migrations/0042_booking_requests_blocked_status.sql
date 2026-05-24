ALTER TABLE session_booking_requests
  DROP CONSTRAINT IF EXISTS session_booking_requests_status_check;

ALTER TABLE session_booking_requests
  ADD CONSTRAINT session_booking_requests_status_check
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'blocked'));
