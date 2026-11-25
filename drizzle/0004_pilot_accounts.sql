ALTER TABLE practice_drivers ADD COLUMN login TEXT;
ALTER TABLE practice_drivers ADD COLUMN password_salt TEXT;
ALTER TABLE practice_drivers ADD COLUMN password_hash TEXT;
CREATE UNIQUE INDEX practice_drivers_login ON practice_drivers(event_id, login) WHERE login IS NOT NULL;

CREATE TABLE practice_sessions (
  token_hash TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL REFERENCES practice_drivers(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX practice_sessions_by_driver ON practice_sessions(driver_id, expires_at);

CREATE TABLE practice_login_limits (
  source TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);

CREATE TABLE practice_saved_setups (
  driver_id TEXT NOT NULL REFERENCES practice_drivers(id),
  name_key TEXT NOT NULL,
  name TEXT NOT NULL,
  setup_json TEXT NOT NULL,
  PRIMARY KEY (driver_id, name_key)
);

CREATE TABLE practice_checkpoints (
  driver_id TEXT NOT NULL REFERENCES practice_drivers(id),
  round_key TEXT NOT NULL,
  phase TEXT NOT NULL,
  attempt_id TEXT,
  opens_at TEXT,
  version INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  PRIMARY KEY (driver_id, round_key, phase)
);
