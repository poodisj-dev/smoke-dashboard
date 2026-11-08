const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const projectRoot = path.join(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'smoke-dashboard.db'));
db.exec(fs.readFileSync(path.join(projectRoot, 'database', 'schema.sql'), 'utf8'));

// Older installations already have a telemetry table. Add new sensor columns safely.
function ensureColumn(name, definition) {
  const columns = db.prepare('PRAGMA table_info(telemetry)').all().map(column => column.name);
  if (!columns.includes(name)) db.exec(`ALTER TABLE telemetry ADD COLUMN ${name} ${definition}`);
}
ensureColumn('temperature_c', 'REAL');
ensureColumn('humidity_percent', 'REAL');
ensureColumn('flame_detected', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('flame_channels', 'TEXT');

const DEMO_DEVICE = {
  id: 'SMOKE-ESP32-01',
  name: 'เครื่องตรวจวัดควัน หมายเลข 01',
  organization: 'อาคารปฏิบัติการคอมพิวเตอร์',
  location: 'ห้องปฏิบัติการคอมพิวเตอร์ 1'
};

function getDevice(deviceId) {
  return db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
}

function upsertDevice(payload) {
  const existing = getDevice(payload.device_id);
  if (existing) return existing;
  db.prepare(`INSERT INTO devices (id, name, organization, location, last_seen_at)
    VALUES (?, ?, ?, ?, ?)`)
    .run(payload.device_id, payload.device_name || payload.device_id,
      payload.organization || 'ข้อมูลจากอุปกรณ์', payload.location || 'ยังไม่ระบุตำแหน่ง', payload.timestamp);
  return getDevice(payload.device_id);
}

function insertTelemetry(payload) {
  upsertDevice(payload);
  db.prepare(`INSERT INTO telemetry
    (device_id, timestamp, smoke_value, temperature_c, humidity_percent, flame_detected, flame_channels,
     connection_status, pump_status, alarm_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(payload.device_id, payload.timestamp, payload.smoke_value,
      payload.temperature_c ?? null, payload.humidity_percent ?? null,
      payload.flame_detected ? 1 : 0,
      JSON.stringify(payload.flame_channels ?? []),
      payload.connection_status || 'connected', payload.pump_status, payload.alarm_status);
  db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(payload.timestamp, payload.device_id);
  return getLatest(payload.device_id);
}

function getLatest(deviceId) {
  return db.prepare(`SELECT t.*, d.name AS device_name, d.organization, d.location
    FROM telemetry t JOIN devices d ON d.id = t.device_id
    WHERE t.device_id = ? ORDER BY t.timestamp DESC LIMIT 1`).get(deviceId);
}

function getHistory(deviceId, from, limit = 500) {
  return db.prepare(`SELECT * FROM telemetry WHERE device_id = ? AND timestamp >= ?
    ORDER BY timestamp ASC LIMIT ?`).all(deviceId, from, limit);
}

function getReadings(deviceId, page, pageSize) {
  const offset = (page - 1) * pageSize;
  const items = db.prepare(`SELECT * FROM telemetry WHERE device_id = ?
    ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(deviceId, pageSize, offset);
  const total = db.prepare('SELECT COUNT(*) AS total FROM telemetry WHERE device_id = ?').get(deviceId).total;
  return { items, total };
}

function getSummary(deviceId, from) {
  return db.prepare(`SELECT COUNT(*) AS readings, ROUND(MAX(smoke_value), 1) AS max,
    ROUND(MIN(smoke_value), 1) AS min, ROUND(AVG(smoke_value), 1) AS average
    FROM telemetry WHERE device_id = ? AND timestamp >= ?`).get(deviceId, from);
}

module.exports = { DEMO_DEVICE, getDevice, insertTelemetry, getLatest, getHistory, getReadings, getSummary };
