ALTER TABLE practice_drivers ADD COLUMN livery TEXT;
--> statement-breakpoint
ALTER TABLE practice_laps ADD COLUMN round_key TEXT NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
ALTER TABLE practice_laps ADD COLUMN phase TEXT NOT NULL DEFAULT 'practice';
--> statement-breakpoint
ALTER TABLE practice_laps ADD COLUMN setup_json TEXT;
--> statement-breakpoint
ALTER TABLE practice_laps ADD COLUMN next_lap_id TEXT;
--> statement-breakpoint
CREATE INDEX practice_laps_by_round ON practice_laps(round_key, phase, driver_id);
