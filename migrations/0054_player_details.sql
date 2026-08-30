-- Age, team, position and notes for players a coach has trained but who have
-- no app account. Keyed on the CRM player, same as player_checklist (0053) and
-- for the same reason: roughly half the coach roster has no app login, and
-- their details still have to live somewhere.
--
-- A player WITH an account keeps these on their `players` row instead, so the
-- roster card and the profile page agree. This table stays in the read chain
-- for them anyway, so anything typed before the account existed survives it
-- being created.
CREATE TABLE IF NOT EXISTS player_details (
  crm_player_id INTEGER PRIMARY KEY,
  age           INTEGER,
  team          TEXT,
  position      TEXT,
  notes         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
