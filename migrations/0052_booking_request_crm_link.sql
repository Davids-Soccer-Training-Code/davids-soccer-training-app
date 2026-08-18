-- Confirming a booking request now creates a real CRM session. Record which one,
-- so a double-click can't book the same slot twice (and so the admin list can
-- show what a request turned into).
ALTER TABLE session_booking_requests
  ADD COLUMN IF NOT EXISTS crm_session_id   BIGINT,
  ADD COLUMN IF NOT EXISTS crm_session_kind TEXT
    CHECK (crm_session_kind IS NULL OR crm_session_kind IN ('first', 'session')),
  ADD COLUMN IF NOT EXISTS scheduled_at     TIMESTAMPTZ;

-- Addresses offered in the confirm dialog. Seeded with the usual spot; anything
-- typed into "Other…" can be saved back here for next time.
CREATE TABLE IF NOT EXISTS booking_locations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label      TEXT NOT NULL,
  address    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO booking_locations (label, address)
SELECT 'Gilbert Regional Park', '3005 E Queen Creek Rd, Gilbert, AZ 85298'
WHERE NOT EXISTS (SELECT 1 FROM booking_locations);
