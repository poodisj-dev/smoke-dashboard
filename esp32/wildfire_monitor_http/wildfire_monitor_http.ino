/*
  Wildfire Monitoring System -> SmokeWatch HTTP API
  ไลบรารีที่ต้องติดตั้งใน Arduino IDE: DHT sensor library และ ArduinoJson
  เปลี่ยน Wi-Fi และ API_URL ก่อนอัปโหลด
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <time.h>

#define MQ2_PIN 34
#define FLAME_D1 13
#define FLAME_D2 12
#define FLAME_D3 14
#define FLAME_D4 27
#define FLAME_D5 26
#define DHT_PIN 33
#define DHT_TYPE DHT22

const char* WIFI_SSID = "Nokchuda_5G";
const char* WIFI_PASSWORD = "0943598244";
// ใช้ IP ของคอมพิวเตอร์ใน LAN ขณะทดสอบ เช่น 192.168.1.10
const char* API_URL = "http://192.168.1.10:3000/api/v1/telemetry";
const char* DEVICE_ID = "WILDFIRE-ESP32-01";
const int SMOKE_THRESHOLD = 800;
// คงค่า HIGH ตามโค้ดเดิมของคุณ; ถ้าทดสอบแล้วสถานะกลับด้าน ให้เปลี่ยนเป็น LOW
const int FLAME_ACTIVE = HIGH;
const unsigned long SEND_INTERVAL_MS = 5000;

DHT dht(DHT_PIN, DHT_TYPE);
unsigned long lastSentAt = 0;

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(300);
}

String getUtcTimestamp() {
  struct tm timeInfo;
  if (!getLocalTime(&timeInfo, 1000)) return "";
  char value[25];
  strftime(value, sizeof(value), "%Y-%m-%dT%H:%M:%S.000Z", &timeInfo);
  return String(value);
}

void setup() {
  Serial.begin(115200);
  pinMode(MQ2_PIN, INPUT);
  for (int pin : {FLAME_D1, FLAME_D2, FLAME_D3, FLAME_D4, FLAME_D5}) pinMode(pin, INPUT);
  dht.begin();
  connectWiFi();
  configTime(0, 0, "pool.ntp.org", "time.nist.gov"); // ใช้ UTC
}

void sendTelemetry() {
  int smokeValue = analogRead(MQ2_PIN);
  bool flameChannels[] = {
    digitalRead(FLAME_D1) == FLAME_ACTIVE, digitalRead(FLAME_D2) == FLAME_ACTIVE,
    digitalRead(FLAME_D3) == FLAME_ACTIVE, digitalRead(FLAME_D4) == FLAME_ACTIVE,
    digitalRead(FLAME_D5) == FLAME_ACTIVE
  };
  bool flameDetected = false;
  for (bool isActive : flameChannels) flameDetected |= isActive;

  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();
  String timestamp = getUtcTimestamp();
  if (timestamp.isEmpty()) { Serial.println("NTP time is not ready"); return; }

  JsonDocument body;
  body["device_id"] = DEVICE_ID;
  body["device_name"] = "Wildfire Monitoring ESP32";
  body["location"] = "ยังไม่ได้ระบุตำแหน่ง";
  body["timestamp"] = timestamp;
  body["smoke_value"] = smokeValue;
  if (!isnan(temperature)) body["temperature_c"] = temperature;
  if (!isnan(humidity)) body["humidity_percent"] = humidity;
  body["flame_detected"] = flameDetected;
  JsonArray channels = body["flame_channels"].to<JsonArray>();
  for (bool isActive : flameChannels) channels.add(isActive);

  // ไม่มีวงจรรีเลย์ในโค้ดเดิม จึงรายงานสถานะปั๊มเป็น off
  body["pump_status"] = "off";
  body["alarm_status"] = (smokeValue > SMOKE_THRESHOLD || flameDetected) ? "on" : "off";

  String payload;
  serializeJson(body, payload);
  HTTPClient http;
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  int statusCode = http.POST(payload);
  Serial.printf("API response: %d\n", statusCode);
  http.end();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (millis() - lastSentAt >= SEND_INTERVAL_MS) {
    lastSentAt = millis();
    sendTelemetry();
  }
}
