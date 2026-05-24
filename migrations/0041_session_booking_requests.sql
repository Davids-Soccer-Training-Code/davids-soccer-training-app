CREATE TABLE session_booking_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_name  TEXT NOT NULL,
  player_name  TEXT NOT NULL,
  phone        TEXT,
  email        TEXT,
  slot_date    DATE NOT NULL,
  slot_start   TIME NOT NULL,
  slot_end     TIME NOT NULL,
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON session_booking_requests(slot_date, slot_start);
CREATE INDEX ON session_booking_requests(status);
CREATE INDEX ON session_booking_requests(created_at DESC);

CREATE TRIGGER session_booking_requests_set_updated_at
  BEFORE UPDATE ON session_booking_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
