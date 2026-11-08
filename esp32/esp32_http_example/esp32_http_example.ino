/*
  ตัวอย่าง ESP32 ส่งข้อมูลไป Backend ผ่าน HTTP ทุก 5 วินาที
  เปลี่ยน WIFI_SSID, WIFI_PASSWORD และ API_URL ให้ตรงกับเครือข่ายของคุณ
  ต้องใช้ URL ของคอมพิวเตอร์ใน LAN เช่น http://192.168.1.10:3000/api/v1/telemetry
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASSWORD = "YOUR_PASSWORD";
const char* API_URL = "http://192.168.1.10:3000/api/v1/telemetry";
const char* DEVICE_ID = "SMOKE-ESP32-01";
const int SMOKE_PIN = 34;

String isoTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return ""; // ไม่ส่งข้อมูลหากเวลายังไม่พร้อม
  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S.000Z", &timeinfo);
  return String(buffer);
}

void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(500); }
}

void setup() {
  Serial.begin(115200);
  connectWiFi();
  configTime(0, 0, "pool.ntp.org", "time.nist.gov"); // ใช้ UTC ตลอดทั้งระบบ
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  String timestamp = isoTimestamp();
  if (timestamp.isEmpty()) { delay(1000); return; }
  int rawSensor = analogRead(SMOKE_PIN);
  float smokeValue = rawSensor * 100.0 / 4095.0; // ต้องคาลิเบรตให้ตรงกับ Sensor จริง
  bool danger = smokeValue >= 75;

  JsonDocument body;
  body["device_id"] = DEVICE_ID;
  body["device_name"] = "เครื่องตรวจวัดควัน หมายเลข 01";
  body["location"] = "ห้องปฏิบัติการคอมพิวเตอร์ 1";
  body["timestamp"] = timestamp;
  body["smoke_value"] = smokeValue;
  body["pump_status"] = danger ? "auto" : "off";
  body["alarm_status"] = danger ? "on" : "off";

  String json; serializeJson(body, json);
  HTTPClient http;
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(json);
  Serial.printf("POST result: %d\n", code);
  http.end();
  delay(5000);
}
