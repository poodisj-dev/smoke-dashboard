-- SQLite schema. Created automatically by backend/database.js on first launch.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  organization TEXT NOT NULL,
  location TEXT NOT NULL,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL REFERENCES devices(id),
  timestamp TEXT NOT NULL,
  smoke_value REAL NOT NULL CHECK (smoke_value >= 0),
  temperature_c REAL,
  humidity_percent REAL,
  flame_detected INTEGER NOT NULL DEFAULT 0 CHECK (flame_detected IN (0, 1)),
  flame_channels TEXT,
  connection_status TEXT NOT NULL DEFAULT 'connected',
  pump_status TEXT NOT NULL DEFAULT 'off',
  alarm_status TEXT NOT NULL DEFAULT 'off',
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telemetry_device_timestamp
  ON telemetry(device_id, timestamp DESC);
