// Nodo ClassAI: confort del aula + asistencia NFC (contratos en docs/contracts.md).
// Nunca se bloquea esperando red: sensores, índice de confort y actuadores siguen sin WiFi/MQTT.

#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <time.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Falta secrets.h: copia secrets.example.h a secrets.h y completa tus datos"
#endif

#include "comfort.h"
#include "nfc_reader.h"

// =====================================================
// SENSORES (1 = conectado, 0 = se envía null)
// =====================================================

#define USE_MLX90614 1
#define USE_DHT22 0
#define USE_BH1750 0
#define USE_PIR 0
#define USE_KY038 0
#define USE_NFC 1

#if USE_MLX90614
#include <Adafruit_MLX90614.h>
#endif
#if USE_DHT22
#include <DHT.h>
#endif
#if USE_BH1750
#include <BH1750.h>
#endif

// =====================================================
// PINES (único lugar)
// =====================================================
// I2C (MLX90614, BH1750): SDA 21, SCL 22.
// PN532 SPI (nfc_reader.cpp): SCK 18, MISO 19, MOSI 23, SS 5. No reutilizar.
// MAX7219 (reservado): 13, 14, 15.

const int PIN_SDA = 21;
const int PIN_SCL = 22;
const int PIN_DHT = 4;
const int PIN_PIR = 27;
const int PIN_KY038 = 34;   // ADC1: funciona con WiFi activo
const int PIN_BUTTON = 32;  // a GND, INPUT_PULLUP
const int PIN_RELAY = 26;   // ventilador
const int PIN_BUZZER = 17;  // buzzer activo

// =====================================================
// TIEMPOS Y CALIBRACION
// =====================================================

const unsigned long TELEMETRY_INTERVAL_MS = 5000;
const unsigned long DEBOUNCE_MS = 50;
const unsigned long RELAY_MIN_HOLD_MS = 60000;  // evita encender/apagar el ventilador a cada lectura
const unsigned long WIFI_RETRY_MIN_MS = 10000;
const unsigned long MQTT_RETRY_MIN_MS = 1000;
const unsigned long RETRY_MAX_MS = 60000;
const unsigned long KY038_WINDOW_MS = 20;
// Pico a pico del ADC (0-4095) que se considera noise_rel = 1. Calibrar en el aula.
const float KY038_FULL_SCALE = 4095.0f;

// =====================================================
// MQTT
// =====================================================
// PubSubClient solo publica con QoS 0 (el contrato pide QoS 1 en eventos).
// Mitigación: los eventos pasan por una cola en RAM y solo salen con MQTT conectado;
// el backend deduplica por event_id. Un corte justo después de publicar aún puede perder uno.

char deviceId[40];
char telemetryTopic[64], eventsTopic[64], configTopic[64], statusTopic[64];

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
Preferences prefs;

#if USE_MLX90614
Adafruit_MLX90614 mlx;
bool mlxOk = false;
#endif
#if USE_DHT22
DHT dht(PIN_DHT, DHT22);
#endif
#if USE_BH1750
BH1750 lightMeter;
bool bh1750Ok = false;
#endif
bool nfcOk = false;

ComfortParams params = comfortDefaults();
uint32_t bootCount = 0;

// =====================================================
// ESTADO
// =====================================================

bool sessionActive = false;
char sessionId[48] = "";

unsigned long lastTelemetry = 0;
unsigned long nextWifiAttempt = 0, wifiBackoff = WIFI_RETRY_MIN_MS;
unsigned long nextMqttAttempt = 0, mqttBackoff = MQTT_RETRY_MIN_MS;
bool wifiWasConnected = false;

int buttonReading = HIGH, buttonStable = HIGH;
unsigned long buttonChangedAt = 0;

bool relayOn = false;
unsigned long relayChangedAt = 0;
const char* lastState = "REGULAR";
unsigned long buzzerOffAt = 0;

bool motionSeen = false;
float noiseP2pSum = 0;
int noiseWindows = 0;

// Cola circular de eventos pendientes (FIFO).
const int EVENT_QUEUE_SIZE = 32;
const int EVENT_MAX_LEN = 384;
char eventQueue[EVENT_QUEUE_SIZE][EVENT_MAX_LEN];
int eventHead = 0, eventCount = 0;

// =====================================================
// UTILIDADES
// =====================================================

bool timeReached(unsigned long now, unsigned long target) {
  return (long)(now - target) >= 0;  // tolera el desborde de millis()
}

bool hasNtp() {
  return time(nullptr) > 1700000000;
}

// ISO 8601 UTC; false si aún no hay NTP.
bool utcNow(char* out, size_t size, const char* format) {
  if (!hasNtp()) return false;
  time_t now = time(nullptr);
  struct tm t;
  gmtime_r(&now, &t);
  strftime(out, size, format, &t);
  return true;
}

void putTs(JsonDocument& doc) {
  char ts[24];
  if (utcNow(ts, sizeof(ts), "%Y-%m-%dT%H:%M:%SZ")) doc["ts"] = ts;
  else doc["ts"] = nullptr;
}

// NaN = sensor inválido -> null (el contrato prohíbe NaN en JSON).
void putFloat(JsonDocument& doc, const char* key, float value, int decimals) {
  if (isnan(value)) doc[key] = nullptr;
  else doc[key] = serialized(String(value, decimals));
}

float inRange(float value, float low, float high) {
  return (isnan(value) || value < low || value > high) ? NAN : value;
}

void beep(unsigned long ms) {
  digitalWrite(PIN_BUZZER, HIGH);
  buzzerOffAt = millis() + ms;
}

// =====================================================
// CONFIG DE CONFORT (retenido + NVS)
// =====================================================

bool readRange(JsonDocument& doc, const char* key, float& low, float& high) {
  JsonArray range = doc[key];
  if (range.size() != 2 || !range[0].is<float>() || !range[1].is<float>()) return false;
  low = range[0];
  high = range[1];
  return low < high;
}

// Un config con v distinto, de otra aula o con campos faltantes se ignora.
bool parseConfig(const char* json, size_t length, ComfortParams& out) {
  JsonDocument doc;
  if (deserializeJson(doc, json, length)) return false;
  if (!doc["v"].is<int>() || doc["v"].as<int>() != 1) return false;
  if (!doc["params_version"].is<int>() || doc["params_version"].as<int>() < 0) return false;
  if (doc["room"].is<const char*>() && strcmp(doc["room"], ROOM_ID) != 0) return false;

  ComfortParams p = comfortDefaults();
  if (!readRange(doc, "temp_c", p.tempMin, p.tempMax)) return false;
  if (!readRange(doc, "rh_pct", p.rhMin, p.rhMax)) return false;
  if (!readRange(doc, "lux", p.luxMin, p.luxMax)) return false;

  JsonObject w = doc["weights"];
  if (!doc["noise_rel_max"].is<float>() || !w["temp"].is<float>() || !w["rh"].is<float>() ||
      !w["lux"].is<float>() || !w["noise"].is<float>()) return false;
  p.noiseRelMax = doc["noise_rel_max"];
  p.wTemp = w["temp"];
  p.wRh = w["rh"];
  p.wLux = w["lux"];
  p.wNoise = w["noise"];
  float sum = p.wTemp + p.wRh + p.wLux + p.wNoise;
  if (p.wTemp < 0 || p.wRh < 0 || p.wLux < 0 || p.wNoise < 0 || fabsf(sum - 1.0f) > 0.02f) return false;
  if (p.noiseRelMax <= 0 || p.noiseRelMax > 1) return false;

  if (!doc["ok_min"].is<int>() || !doc["regular_min"].is<int>()) return false;
  p.okMin = doc["ok_min"];
  p.regularMin = doc["regular_min"];
  if (p.regularMin < 0 || p.regularMin > p.okMin || p.okMin > 100) return false;

  p.paramsVersion = doc["params_version"];
  out = p;
  return true;
}

void loadSavedConfig() {
  String saved = prefs.getString("config", "");
  ComfortParams p;
  if (saved.length() > 0 && parseConfig(saved.c_str(), saved.length(), p)) {
    params = p;
    Serial.printf("Config guardado cargado: params_version=%d\n", params.paramsVersion);
  } else {
    Serial.println("Sin config guardado: valores de fábrica (params_version=0)");
  }
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  if (strcmp(topic, configTopic) != 0) return;
  ComfortParams p;
  if (!parseConfig((const char*)payload, length, p)) {
    Serial.println("Config MQTT inválido: ignorado");
    return;
  }
  if (p.paramsVersion != params.paramsVersion) {
    prefs.putString("config", String((const char*)payload, length));
  }
  params = p;
  Serial.printf("Config aplicado: params_version=%d\n", params.paramsVersion);
}

// =====================================================
// EVENTOS
// =====================================================

void enqueueEvent(const char* json) {
  if (eventCount == EVENT_QUEUE_SIZE) {
    Serial.println("Cola de eventos llena: se descarta el más antiguo");
    eventHead = (eventHead + 1) % EVENT_QUEUE_SIZE;
    eventCount--;
  }
  strlcpy(eventQueue[(eventHead + eventCount) % EVENT_QUEUE_SIZE], json, EVENT_MAX_LEN);
  eventCount++;
}

void flushEvents() {
  while (eventCount > 0 && mqttClient.connected()) {
    if (!mqttClient.publish(eventsTopic, eventQueue[eventHead])) return;
    Serial.print("Evento enviado: ");
    Serial.println(eventQueue[eventHead]);
    eventHead = (eventHead + 1) % EVENT_QUEUE_SIZE;
    eventCount--;
  }
}

void queueEvent(const char* event, const NfcCredential* credential) {
  unsigned long uptime = millis();
  char eventId[64];
  // bootCount evita repetir event_id tras un reinicio (uptime vuelve a 0).
  snprintf(eventId, sizeof(eventId), "%s-%lu-%lu", deviceId, (unsigned long)bootCount, uptime);

  JsonDocument doc;
  doc["v"] = 1;
  doc["event"] = event;
  doc["event_id"] = eventId;
  doc["device"] = deviceId;
  doc["room"] = ROOM_ID;
  doc["session_id"] = sessionId;
  putTs(doc);
  doc["uptime_ms"] = uptime;
  if (credential != nullptr) {
    doc["credential"]["type"] = credential->type;
    doc["credential"]["token"] = credential->token;
  }

  char json[EVENT_MAX_LEN];
  if (measureJson(doc) >= sizeof(json)) {
    Serial.println("Evento demasiado grande: descartado");
    return;
  }
  serializeJson(doc, json, sizeof(json));
  enqueueEvent(json);
}

void toggleSession() {
  if (!sessionActive) {
    char stamp[20];
    if (utcNow(stamp, sizeof(stamp), "%Y%m%dT%H%M%SZ")) snprintf(sessionId, sizeof(sessionId), "%s-%s", ROOM_ID, stamp);
    else snprintf(sessionId, sizeof(sessionId), "%s-u%lu", ROOM_ID, millis());
    sessionActive = true;
    queueEvent("SESSION_STARTED", nullptr);
    Serial.printf("Sesión iniciada: %s\n", sessionId);
  } else {
    queueEvent("SESSION_ENDED", nullptr);
    Serial.printf("Sesión finalizada: %s\n", sessionId);
    sessionActive = false;
    sessionId[0] = '\0';
  }
  beep(150);
}

// =====================================================
// RED (sin bucles bloqueantes)
// =====================================================

void maintainWiFi(unsigned long now) {
  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiWasConnected) {
      wifiWasConnected = true;
      wifiBackoff = WIFI_RETRY_MIN_MS;
      Serial.print("WiFi conectado. IP: ");
      Serial.print(WiFi.localIP());
      Serial.printf(" RSSI: %d dBm\n", WiFi.RSSI());
      configTime(0, 0, "pool.ntp.org", "time.google.com");  // UTC
    }
    return;
  }
  if (wifiWasConnected) {
    wifiWasConnected = false;
    Serial.println("WiFi perdido");
    nextWifiAttempt = now + wifiBackoff;
  }
  if (!timeReached(now, nextWifiAttempt)) return;
  Serial.printf("Reintentando WiFi (%s)...\n", WIFI_SSID);
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  nextWifiAttempt = now + wifiBackoff;
  wifiBackoff = min(wifiBackoff * 2, RETRY_MAX_MS);
}

void maintainMqtt(unsigned long now) {
  if (mqttClient.connected()) {
    mqttClient.loop();
    return;
  }
  if (WiFi.status() != WL_CONNECTED || !timeReached(now, nextMqttAttempt)) return;

  Serial.print("Conectando a MQTT...");
  // connect() puede tardar unos segundos si el broker no responde; los intentos se espacian con backoff.
  bool connected = mqttClient.connect(
    deviceId,
    strlen(MQTT_USER) ? MQTT_USER : nullptr,
    strlen(MQTT_USER) ? MQTT_PASSWORD : nullptr,
    statusTopic, 1, true, "offline");
  if (!connected) {
    Serial.printf(" ERROR, codigo=%d. Nuevo intento en %lu ms\n", mqttClient.state(), mqttBackoff);
    nextMqttAttempt = now + mqttBackoff;
    mqttBackoff = min(mqttBackoff * 2, RETRY_MAX_MS);
    return;
  }
  mqttBackoff = MQTT_RETRY_MIN_MS;
  Serial.printf(" OK (%s:%d)\n", MQTT_HOST, MQTT_PORT);
  mqttClient.publish(statusTopic, "online", true);
  mqttClient.subscribe(configTopic, 1);
}

// =====================================================
// SENSORES Y ACTUADORES
// =====================================================

void readButton(unsigned long now) {
  int reading = digitalRead(PIN_BUTTON);
  if (reading != buttonReading) {
    buttonReading = reading;
    buttonChangedAt = now;
  }
  if (now - buttonChangedAt >= DEBOUNCE_MS && reading != buttonStable) {
    buttonStable = reading;
    if (buttonStable == LOW) toggleSession();
  }
}

// Muestras rápidas entre telemetrías: PIR se "retiene" y el ruido se promedia por ventanas.
void sampleFastSensors() {
#if USE_PIR
  if (digitalRead(PIN_PIR) == HIGH) motionSeen = true;
#endif
#if USE_KY038
  int low = 4095, high = 0;
  unsigned long start = millis();
  while (millis() - start < KY038_WINDOW_MS) {  // ventana corta y acotada
    int value = analogRead(PIN_KY038);
    low = min(low, value);
    high = max(high, value);
  }
  noiseP2pSum += high - low;
  noiseWindows++;
#endif
}

// Ventilador solo si hay ALERTA por calor; REGULAR mantiene el estado actual (histéresis).
void applyComfortState(const char* state, float tempC) {
  unsigned long now = millis();
  bool wantRelay = relayOn;
  if (strcmp(state, "ALERT") == 0 && !isnan(tempC) && tempC > params.tempMax) wantRelay = true;
  if (strcmp(state, "OK") == 0) wantRelay = false;
  if (wantRelay != relayOn && now - relayChangedAt >= RELAY_MIN_HOLD_MS) {
    relayOn = wantRelay;
    relayChangedAt = now;
    digitalWrite(PIN_RELAY, relayOn ? HIGH : LOW);
    Serial.printf("Ventilador %s\n", relayOn ? "ENCENDIDO" : "APAGADO");
  }
  if (strcmp(state, "ALERT") == 0 && strcmp(lastState, "ALERT") != 0) beep(400);
  lastState = state;
}

void publishTelemetry() {
  float tempC = NAN, rhPct = NAN, lux = NAN, noiseRel = NAN, irObjectC = NAN;
#if USE_MLX90614
  if (mlxOk) {
    tempC = inRange(mlx.readAmbientTempC(), -40, 125);
    irObjectC = inRange(mlx.readObjectTempC(), -70, 380);
  }
#endif
#if USE_DHT22
  tempC = inRange(dht.readTemperature(), -40, 80);  // DHT22 tiene prioridad para temp_c
  rhPct = inRange(dht.readHumidity(), 0, 100);
#endif
#if USE_BH1750
  if (bh1750Ok) lux = inRange(lightMeter.readLightLevel(), 0, 65535);
#endif
#if USE_KY038
  if (noiseWindows > 0) noiseRel = min(1.0f, noiseP2pSum / noiseWindows / KY038_FULL_SCALE);
  noiseP2pSum = 0;
  noiseWindows = 0;
#endif

  int comfort = comfortIndex(params, tempC, rhPct, lux, noiseRel);
  const char* state = comfortState(params, comfort);
  applyComfortState(state, tempC);

  JsonDocument doc;
  doc["v"] = 1;
  doc["device"] = deviceId;
  doc["room"] = ROOM_ID;
  if (sessionActive) doc["session_id"] = sessionId;
  else doc["session_id"] = nullptr;
  putTs(doc);
  doc["uptime_ms"] = millis();
  putFloat(doc, "temp_c", tempC, 2);
  putFloat(doc, "rh_pct", rhPct, 1);
  putFloat(doc, "lux", lux, 1);
  putFloat(doc, "noise_rel", noiseRel, 3);
#if USE_PIR
  doc["presence"] = motionSeen;
  motionSeen = false;
#else
  doc["presence"] = nullptr;
#endif
  putFloat(doc, "ir_object_c", irObjectC, 2);
  if (comfort < 0) doc["comfort"] = nullptr;
  else doc["comfort"] = comfort;
  doc["state"] = state;
  doc["params_version"] = params.paramsVersion;

  char json[512];
  size_t length = serializeJson(doc, json, sizeof(json));
  bool sent = mqttClient.connected() && mqttClient.publish(telemetryTopic, (const uint8_t*)json, length, false);
  Serial.printf("%s %s\n", sent ? "ENVIADO" : "SIN RED", json);
}

// =====================================================
// SETUP
// =====================================================

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n============================");
  Serial.println("CLASSAI NODE");
  Serial.println("============================");

  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_RELAY, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_RELAY, LOW);
  digitalWrite(PIN_BUZZER, LOW);
#if USE_PIR
  pinMode(PIN_PIR, INPUT);
#endif

  snprintf(deviceId, sizeof(deviceId), "esp32-%s", ROOM_ID);
  snprintf(telemetryTopic, sizeof(telemetryTopic), "classai/v1/%s/telemetry", ROOM_ID);
  snprintf(eventsTopic, sizeof(eventsTopic), "classai/v1/%s/events", ROOM_ID);
  snprintf(configTopic, sizeof(configTopic), "classai/v1/%s/config", ROOM_ID);
  snprintf(statusTopic, sizeof(statusTopic), "classai/v1/%s/status", ROOM_ID);

  prefs.begin("classai", false);
  bootCount = prefs.getUInt("boots", 0) + 1;
  prefs.putUInt("boots", bootCount);
  loadSavedConfig();

  Wire.begin(PIN_SDA, PIN_SCL);
#if USE_MLX90614
  mlxOk = mlx.begin();
  Serial.println(mlxOk ? "MLX90614 encontrado" : "ERROR: MLX90614 no encontrado (se envía null)");
#endif
#if USE_DHT22
  dht.begin();
#endif
#if USE_BH1750
  bh1750Ok = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
  Serial.println(bh1750Ok ? "BH1750 encontrado" : "ERROR: BH1750 no encontrado (se envía null)");
#endif
#if USE_NFC
  nfcOk = nfcBegin();
#endif

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  nextWifiAttempt = millis() + WIFI_RETRY_MIN_MS;
  Serial.printf("Conectando a WiFi: %s (sin bloquear)\n", WIFI_SSID);

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setBufferSize(1024);
  mqttClient.setSocketTimeout(5);
  mqttClient.setCallback(onMqttMessage);
}

// =====================================================
// LOOP
// =====================================================

void loop() {
  unsigned long now = millis();

  maintainWiFi(now);
  maintainMqtt(now);
  flushEvents();

  readButton(now);
  sampleFastSensors();

  NfcCredential credential;
  if (nfcOk && sessionActive && nfcPoll(credential)) {
    Serial.printf("Credencial leída: %s\n", credential.type);
    queueEvent("ATTENDANCE_RECORDED", &credential);
    beep(80);
  }

  if (now - lastTelemetry >= TELEMETRY_INTERVAL_MS) {
    lastTelemetry = now;
    publishTelemetry();
  }

  if (buzzerOffAt != 0 && timeReached(millis(), buzzerOffAt)) {
    digitalWrite(PIN_BUZZER, LOW);
    buzzerOffAt = 0;
  }
}
