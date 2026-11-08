# เผยแพร่ SmokeWatch ออนไลน์

## 1. Deploy Backend บน Render

1. สร้าง GitHub repository แล้วอัปโหลดโฟลเดอร์โครงการนี้ขึ้น GitHub
2. ลงชื่อเข้าใช้ [Render](https://render.com) แล้วเลือก **New + → Blueprint**
3. เลือก GitHub repository นี้ Render จะอ่าน `render.yaml` อัตโนมัติ
4. กด Apply แล้วรอจนสถานะเป็น **Live**
5. คัดลอก URL ของบริการ เช่น `https://smokewatch-api.onrender.com`

> แผน Free ของ Render อาจหยุดเมื่อไม่มีการใช้งาน และไฟล์ SQLite อาจไม่ถาวรเมื่อมีการ redeploy. สำหรับข้อมูลจริงระยะยาว ควรเปลี่ยนเป็น PostgreSQL หรือใช้ Persistent Disk ของ Render.

## 2. ตั้งค่า Dashboard สำหรับ Netlify

1. เปิดไฟล์ `frontend/config.js`
2. แก้เป็น URL ของ Render ที่ได้จากขั้นตอนที่ 1:

```js
window.SMOKEWATCH_API_BASE = 'https://smokewatch-api.onrender.com';
```

3. ใน Netlify เลือก **Deploy manually** แล้วอัปโหลดทั้งโฟลเดอร์ `frontend` (ไม่ใช่เฉพาะ `index.html`)
4. เปิด URL ของ Netlify เพื่อตรวจสอบ Dashboard

## 3. ตั้งค่า ESP32

แก้ `API_URL` ใน `esp32/wildfire_monitor_http/wildfire_monitor_http.ino` ให้เป็น URL ของ Render:

```cpp
const char* API_URL = "https://smokewatch-api.onrender.com/api/v1/telemetry";
```

เมื่อ ESP32 ส่งข้อมูลสำเร็จ Dashboard จะอัปเดตทุก 5 วินาที
