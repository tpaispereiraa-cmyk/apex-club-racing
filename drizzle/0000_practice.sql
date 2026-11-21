CREATE TABLE practice_drivers (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  color TEXT NOT NULL,
  UNIQUE (event_id, name_key)
);
--> statement-breakpoint
CREATE TABLE practice_laps (
  driver_id TEXT NOT NULL REFERENCES practice_drivers(id),
  lap_id TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  valid INTEGER NOT NULL,
  PRIMARY KEY (driver_id, lap_id)
);
