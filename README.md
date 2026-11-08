# SmokeWatch — IoT Smoke Dashboard

Dashboard ต้นแบบสำหรับติดตามค่าควันแบบเรียลไทม์ รองรับหน้าจอคอมพิวเตอร์ แท็บเล็ต และโทรศัพท์มือถือ โดยมี Backend และฐานข้อมูล SQLite ที่ใช้งานได้จริงในเครื่อง ข้อมูลเริ่มต้นที่เห็นบนหน้าจอเป็น **ข้อมูลตัวอย่าง (Demo)** เท่านั้น จนกว่า ESP32 จะเริ่มส่งข้อมูลเข้ามา

## ภาพรวมการออกแบบ

### 1) การวิเคราะห์ความต้องการ

ระบบต้องสื่อสารสถานะสำคัญให้มองเห็นทันที: ค่าควันปัจจุบัน, ความเสี่ยง, การเชื่อมต่อ, การทำงานของปั๊มน้ำ/สัญญาณเตือน และแนวโน้มย้อนหลัง จึงจัดลำดับหน้าเป็น Header → ข้อมูลเครื่อง → การแจ้งเตือน → Summary cards → กราฟ → อุปกรณ์ → ตาราง ประสบการณ์แบบ responsive ปรับจาก 5 cards เป็น 2 columns บนมือถือ และตารางเลื่อนแนวนอนได้เมื่อจำเป็น

Threshold ที่ใช้ในต้นแบบ: ปกติ `< 50`, เฝ้าระวัง `50–74`, อันตราย `≥ 75` หน่วย สามารถย้ายไปเก็บในตาราง `device_settings` ในระยะถัดไปเพื่อปรับจากหน้า Admin ได้

### 2) เทคโนโลยีที่เลือก

- **Frontend:** HTML, CSS และ JavaScript ปกติ เพื่อให้โค้ดเล็กและแก้ไขง่าย; Chart.js ผ่าน CDN สำหรับกราฟ
- **Backend:** Node.js native `http` API — ไม่ต้องติดตั้ง package เพิ่ม เหมาะกับต้นแบบและการเริ่มใช้งาน
- **Database:** SQLite (ผ่าน `node:sqlite` ที่มากับ Node.js 22.5+) เหมาะกับการเก็บข้อมูลในเครื่อง/PoC และเปลี่ยนเป็น PostgreSQL ได้เมื่อเป็นระบบหลายเครื่องหรือข้อมูลมาก
- **การอัปเดต:** frontend poll API ทุก 5 วินาที ไม่มีการ reload หน้า; backend ถือว่า offline เมื่อ timestamp ล่าสุดเก่าเกิน 30 วินาที

### 3) โครงสร้างโครงการ

```
backend/             API server และ data access
database/schema.sql  โครงสร้าง SQLite
frontend/            หน้า Dashboard
esp32/                ตัวอย่าง firmware HTTP
data/                 ไฟล์ฐานข้อมูล (สร้างอัตโนมัติและไม่ commit)
```

### 4) โครงสร้างข้อมูล

Telemetry หนึ่งรายการรองรับฟิลด์หลักดังนี้:

```json
{
  "device_id": "SMOKE-ESP32-01",
  "device_name": "เครื่องตรวจวัดควัน หมายเลข 01",
  "location": "ห้องปฏิบัติการคอมพิวเตอร์ 1",
  "timestamp": "2026-09-06T10:35:42.000Z",
  "smoke_value": 42.6,
  "connection_status": "connected",
  "pump_status": "off",
  "alarm_status": "off"
}
```

`pump_status` และ `alarm_status` รับ `on`, `off`, `auto`, `abnormal` ส่วนอุปกรณ์ใหม่ควรเพิ่มตาราง `device_states(device_id, equipment_name, status, updated_at)` แทนการเพิ่มคอลัมน์ทุกครั้ง

### 5) ฐานข้อมูลเบื้องต้น

- `devices` เก็บข้อมูลประจำเครื่องและ `last_seen_at`
- `telemetry` เก็บค่าควัน, timestamp และสถานะอุปกรณ์แบบ append-only
- มี index `(device_id, timestamp DESC)` สำหรับกราฟและตารางย้อนหลัง

ดู DDL เต็มได้ที่ [database/schema.sql](database/schema.sql)

### 6) การทำงานของระบบ

```
ESP32 → POST /api/v1/telemetry → ตรวจสอบข้อมูล → SQLite
Dashboard → GET APIs ทุก 5 วินาที ← SQLite
```

เมื่อ ESP32 ส่งข้อมูล Backend จะ upsert เครื่อง (กรณีพบ `device_id` ใหม่), บันทึก telemetry และอัปเดต `last_seen_at` Dashboard ใช้ timestamp ล่าสุดประเมินการเชื่อมต่อ ไม่ได้อ้างว่าเชื่อมต่อ ESP32 จริงจนกว่าจะได้รับ POST จากอุปกรณ์

## เริ่มใช้งาน

ต้องมี Node.js 22.5 หรือใหม่กว่า (แนะนำ Node 24)

```powershell
node backend/server.js
```

หรือใช้ `npm start` ได้ในเครื่องที่ติดตั้ง npm คู่กับ Node.js

สำหรับ Windows สามารถดับเบิลคลิกไฟล์ `start-dashboard.cmd` ที่โฟลเดอร์โครงการได้เช่นกัน ต้องปล่อยหน้าต่าง Command Prompt ที่เปิดขึ้นไว้ขณะใช้งาน Dashboard

จากนั้นเปิด `http://localhost:3000` ฐานข้อมูลและข้อมูลตัวอย่าง 24 ชั่วโมงจะถูกสร้างที่ `data/smoke-dashboard.db` ในการเปิดครั้งแรก

> หมายเหตุ: Chart.js และ Google Font ถูกเรียกจาก CDN; ครั้งแรกที่เปิดหน้าเว็บต้องเชื่อมต่ออินเทอร์เน็ต หากใช้งานในเครือข่ายปิด ให้นำไฟล์เหล่านี้มาเก็บใน `frontend/` แทน

## API

| Method | Endpoint | หน้าที่ |
|---|---|---|
| POST | `/api/v1/telemetry` | รับข้อมูลจาก ESP32 |
| GET | `/api/v1/dashboard?device_id=SMOKE-ESP32-01&hours=24` | ค่าปัจจุบัน, สรุป และประวัติกราฟ |
| GET | `/api/v1/readings?page=1&page_size=10` | ตารางย้อนหลังแบบแบ่งหน้า |
| GET | `/api/v1/devices/status?device_id=SMOKE-ESP32-01` | สถานะปั๊มและสัญญาณเตือนล่าสุด |

ตัวอย่างส่งข้อมูลด้วย PowerShell:

```powershell
$body = @{ device_id='SMOKE-ESP32-01'; timestamp=(Get-Date).ToUniversalTime().ToString('o'); smoke_value=82.4; pump_status='auto'; alarm_status='on' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/v1/telemetry -ContentType 'application/json' -Body $body
```

## เชื่อมต่อ ESP32 จริง

1. เปิด server บนคอมพิวเตอร์และหา LAN IP เช่น `ipconfig` → IPv4 Address
2. เปลี่ยน `API_URL` ใน [esp32/esp32_http_example.ino](esp32/esp32_http_example.ino) เป็น `http://<LAN-IP>:3000/api/v1/telemetry`
3. ใส่ Wi-Fi, ติดตั้งไลบรารี ArduinoJson และปรับค่า NTP ใน `isoTimestamp()` ให้เป็นเวลาจริง
4. คาลิเบรต conversion ของ `analogRead()` ตามรุ่น Sensor, ค่าอ้างอิง และหน่วยที่ใช้งานจริง
5. อนุญาต port 3000 ใน Windows Firewall เฉพาะเครือข่ายที่เชื่อถือได้

## MQTT ในระยะถัดไป

สำหรับอุปกรณ์จำนวนมาก แนะนำให้ ESP32 publish JSON เดิมไปที่ topic เช่น `iot/smoke/{device_id}/telemetry` แล้วทำ MQTT consumer แยกเป็น service ซึ่ง subscribe topic และเรียกฟังก์ชันบันทึกเดียวกับ `insertTelemetry()` การทำเช่นนี้ช่วยให้ HTTP API ยังรองรับอุปกรณ์เดิม และแยก broker/retention ออกจาก Dashboard ได้ชัดเจน

## ก่อนนำขึ้นใช้งานจริง

- เพิ่ม API key หรือ mTLS ระหว่าง ESP32 กับ API, ใช้ HTTPS และจำกัด network access
- เปลี่ยน SQLite เป็น PostgreSQL เมื่อมีหลายอุปกรณ์/ผู้ใช้ และทำ retention/backup
- ย้าย thresholds ไปฐานข้อมูล พร้อมหน้า setting และบันทึก alert event
- ตั้ง NTP บน ESP32 และใช้ UTC ทุกระบบ
- พิจารณา WebSocket หรือ Server-Sent Events หากต้องการ update ต่ำกว่า 5 วินาที
