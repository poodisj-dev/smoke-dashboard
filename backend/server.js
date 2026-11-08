const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DEMO_DEVICE, getDevice, insertTelemetry, getLatest, getHistory, getReadings, getSummary } = require('./database');

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, '..', 'frontend');
const DEVICE_TIMEOUT_MS = 30_000;
const VALID_STATUSES = new Set(['on', 'off', 'auto', 'abnormal']);

function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    // Allows a Netlify-hosted dashboard to read this API after deployment.
    'Access-Control-Allow-Origin': '*'
  });
  response.end(JSON.stringify(data));
}
function getConnectionStatus(latest) {
  if (!latest) return 'disconnected';
  return Date.now() - new Date(latest.timestamp).getTime() > DEVICE_TIMEOUT_MS ? 'disconnected' : 'connected';
}
function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => { body += chunk; if (body.length > 100_000) request.destroy(); });
    request.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('JSON ไม่ถูกต้อง')); } });
  });
}
function validPayload(value) {
  const required = ['device_id', 'timestamp', 'smoke_value', 'pump_status', 'alarm_status'];
  const missing = required.filter(key => value[key] === undefined || value[key] === '');
  if (missing.length) return `ขาดข้อมูล: ${missing.join(', ')}`;
  if (!Number.isFinite(Number(value.smoke_value)) || Number(value.smoke_value) < 0) return 'smoke_value ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป';
  if (Number.isNaN(new Date(value.timestamp).getTime())) return 'timestamp ต้องเป็น ISO 8601 ที่ถูกต้อง';
  if (!VALID_STATUSES.has(value.pump_status) || !VALID_STATUSES.has(value.alarm_status)) return 'pump_status และ alarm_status ต้องเป็น on, off, auto หรือ abnormal';
  for (const field of ['temperature_c', 'humidity_percent']) {
    if (value[field] !== undefined && value[field] !== null && !Number.isFinite(Number(value[field]))) return `${field} ต้องเป็นตัวเลข`;
  }
  if (value.flame_detected !== undefined && typeof value.flame_detected !== 'boolean') return 'flame_detected ต้องเป็น true หรือ false';
  if (value.flame_channels !== undefined && (!Array.isArray(value.flame_channels) || !value.flame_channels.every(channel => typeof channel === 'boolean'))) return 'flame_channels ต้องเป็นรายการ true/false';
  return null;
}
function apiData(url) {
  const deviceId = url.searchParams.get('device_id') || DEMO_DEVICE.id;
  const hours = Math.min(Math.max(Number(url.searchParams.get('hours') || 24), 0.1), 24 * 7);
  const from = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const latest = getLatest(deviceId);
  const device = getDevice(deviceId);
  if (!device) return { error: 'ไม่พบอุปกรณ์', deviceId };
  const summary = getSummary(deviceId, from);
  return { device, latest: latest && { ...latest, connection_status: getConnectionStatus(latest) }, summary, history: getHistory(deviceId, from) };
}
function serveFile(response, pathname) {
  const fileName = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const filePath = path.join(publicDir, fileName);
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath)) return sendJson(response, 404, { error: 'ไม่พบไฟล์' });
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };
  response.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      return sendJson(response, 200, { status: 'ok' });
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/telemetry') {
      const payload = await parseBody(request);
      const error = validPayload(payload);
      if (error) return sendJson(response, 400, { error });
      payload.smoke_value = Number(payload.smoke_value);
      if (payload.temperature_c !== undefined) payload.temperature_c = Number(payload.temperature_c);
      if (payload.humidity_percent !== undefined) payload.humidity_percent = Number(payload.humidity_percent);
      payload.connection_status = 'connected';
      return sendJson(response, 201, { message: 'บันทึกข้อมูลสำเร็จ', data: insertTelemetry(payload) });
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/dashboard') {
      const data = apiData(url);
      return sendJson(response, data.error ? 404 : 200, data);
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/readings') {
      const deviceId = url.searchParams.get('device_id') || DEMO_DEVICE.id;
      const page = Math.max(1, Number(url.searchParams.get('page') || 1));
      const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get('page_size') || 10)));
      const data = getReadings(deviceId, page, pageSize);
      return sendJson(response, 200, { ...data, page, pageSize, totalPages: Math.max(1, Math.ceil(data.total / pageSize)) });
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/devices/status') {
      const latest = getLatest(url.searchParams.get('device_id') || DEMO_DEVICE.id);
      return sendJson(response, latest ? 200 : 404, latest && { pump_status: latest.pump_status, alarm_status: latest.alarm_status, updated_at: latest.timestamp });
    }
    if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'ไม่พบ API endpoint' });
    serveFile(response, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});
server.listen(PORT, () => console.log(`Dashboard: http://localhost:${PORT}`));
