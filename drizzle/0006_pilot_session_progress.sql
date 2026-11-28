CREATE TABLE practice_session_progress (
  driver_id TEXT NOT NULL REFERENCES practice_drivers(id),
  round_key TEXT NOT NULL,
  qualifying_started_at INTEGER NOT NULL,
  PRIMARY KEY (driver_id, round_key)
);
