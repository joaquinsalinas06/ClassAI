// kirbyFinal: kirbyOriginal + palabra de activacion "hey kirby" + Wi-Fi/MQTT (nodo a101-assistant).
// Flujo: REPOSO --"hey kirby"--> ESCUCHANDO (video hey_kirby, LISTEN_MS) --"ventilador"--> video ventilador
//                                                     --"sixseven"---> video + audio sixseven
//                                                     --(sin orden)---> REPOSO
// "ventilador" ademas publica la orden de encendido en nodes/a101-environment/fan/set (mismo
// formato que la API). Requiere que la ACL del broker permita a a101-assistant escribir ese topico
// y que el nodo de ambiente tenga RELAY_VALIDATED 1 y este armado ("arm").
// En reposo muestra los avisos del servidor: ASISTENCIA OK / HACE CALOR / MUCHO RUIDO.
// Modelo: sixseven_inferencing 1.0.2 (hey_kirby, noise, sixseven, unknown, ventilador).
// Placa: ESP32 Dev Module, Partition Scheme "Huge APP (3MB No OTA/1MB SPIFFS)".
// Solo driver I2S legado (driver/i2s.h); no mezclar con driver/i2s_std.h ni ESP_I2S.h.
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <TJpg_Decoder.h>
#include <driver/i2s.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include <sixseven_inferencing.h>
#include "secrets.h"       // Wi-Fi, MQTT y CA (privado, no versionar)
#include "node_policy.h"   // histeresis de calor, ruido sostenido, lecturas antiguas
#include "audio_data.h"    //este es el audio que se reproduce junto al video del sixseven
#include "src/video_data.h"  //este es el video del main en bucle
#include "src/alert_data.h"  //este es el video de alerta de sixseven
#include "src/ventilador_data.h"  //este es el video de kirby con el ventilador (FAN_FRAMES, fanOffsets, fanData)
#include "src/hey_kirby_data.h"   //este es el video de kirby escuchando tras "hey kirby" (HEY_FRAMES, heyOffsets, heyData)

#ifndef MQTT_TLS
#error "Define MQTT_TLS 1 en secrets.h"
#endif
#if !MQTT_TLS
#error "Este nodo solo admite MQTT con TLS (puerto 8883 y CA del servidor)"
#endif

#define TFT_CS   5
#define TFT_DC   27
#define TFT_RST  26
#define TFT_MOSI 23
#define TFT_SCLK 14

#define MIC_SCK  18
#define MIC_WS   19
#define MIC_SD   34
#define MIC_PORT I2S_NUM_0

#define I2S_BCLK 33
#define I2S_LRC  25
#define I2S_DIN  22
#define AMP_SD   21
#define AMP_PORT I2S_NUM_1

#define MIC_SHIFT     15    // 12 = más sensible, 16 = menos
#define VOLUME        100     // volumen del audio, 0 a 100
#define AUDIO_SECONDS 10      // duración del audio (y del clip en pantalla)
#define COOLDOWN_MS   1500    // pausa tras una accion antes de volver a detectar
#define VIDEO_FPS     12
#define MIN_PEAK 800          // volumen minimo para aceptar una palabra

// --- Palabra de activacion y ordenes ---
#define UMBRAL_HEY      0.85f // probabilidad minima de "hey kirby"
#define HITS_HEY        2     // ventanas seguidas (cada 250 ms) que deben superar el umbral
#define UMBRAL_67       0.80f // probabilidad minima de "sixseven" (solo tras "hey kirby")
#define UMBRAL_FAN      0.80f // probabilidad minima de "ventilador" (solo tras "hey kirby")
#define HITS_ORDEN      1     // ventanas seguidas para aceptar una orden
#define LISTEN_MS       10000 // tiempo que Kirby espera la orden tras "hey kirby" (= video hey_kirby, 120 fotogramas a 12 fps)
#define LISTEN_IGNORE_MS 1000 // la ventana de 1 s aun contiene "hey kirby": se ignora al inicio
#define FAN_PLAYS       1     // veces que se reproduce el video del ventilador
#define SIXSEVEN_DIRECTO 0    // 1 = "sixseven" tambien funciona sin decir "hey kirby"

// --- Red ---
#define FAN_ORDEN_REMOTA 1    // 1 = "ventilador" envia la orden al nodo de ambiente por MQTT
#define FAN_CONFIRM_MS   15000 // espera de confirmacion en el snapshot del nodo de ambiente
#define TELEMETRY_MS     5000
#define FRESH_S          15   // lectura ambiental mas antigua que esto se descarta
#define SPEAKER_GUARD_S  5    // ruido medido hasta 5 s despues de sonar la bocina se ignora
#define BANNER_H 48           // franja inferior de avisos en reposo (multiplo de 16)
#define BANNER_Y (240 - BANNER_H)

SPIClass spiTFT(VSPI);
Adafruit_ST7789 tft(&spiTFT, TFT_CS, TFT_DC, TFT_RST);

static int16_t *sampleBuf[2];
static volatile uint8_t bufSel = 0;
static volatile bool bufReady = false;
static uint32_t bufCount = 0;
static uint8_t readBuf = 0;
static volatile bool playing = false;
static volatile uint32_t alertFrame = 0;

enum Mode : uint8_t { MODE_IDLE, MODE_LISTEN, MODE_ALERT, MODE_FAN };
static volatile uint8_t mode = MODE_IDLE;     // lo cambia loop(); videoTask solo lo lee
static volatile uint32_t listenStart = 0;
static volatile bool fanDone = false;         // videoTask avisa cuando termina el ventilador
static int16_t clipY = 240;                   // filas >= clipY del video no se dibujan (franja)

// --- Estado de red (compartido entre tareas: proteger con stateLock) ---
static SemaphoreHandle_t stateLock;
static void lock() { xSemaphoreTake(stateLock, portMAX_DELAY); }
static void unlock() { xSemaphoreGive(stateLock); }

WiFiClientSecure transport;
PubSubClient mqtt(transport);
static char device[65], prefix[64], nodePrefix[150];
static char sessionId[96] = "";
static uint32_t sessionRevision = 0;
static volatile bool networkUp = false;
static multinode::Reactions reactions;
static char environmentAt[40] = "";
static float maxTemp = 24.0f;              // valores de fabrica del contrato (params_version 0)
static float maxNoise = 0.5f;
static int paramsVersion = 0;
static char seenAttendance[8][121] = {};   // event_id ya mostrados (QoS1 puede repetir)
static unsigned nextSeen = 0;
static volatile bool attendancePending = false;
static volatile time_t lastSpeakEpoch = 0;
static volatile bool fanRequested = false; // loop() lo pide; networkTask publica
static char fanPendingId[33] = "";         // orden enviada que espera confirmacion
static uint32_t fanSentAt = 0;

bool tftOutput(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t* bitmap) {
  if (y >= tft.height() || y >= clipY) return false;
  if (y + h > clipY) h = clipY - y;
  tft.drawRGBBitmap(x, y, bitmap, w, h);
  return true;
}

void initMic() {
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  cfg.sample_rate = EI_CLASSIFIER_FREQUENCY;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 8;
  cfg.dma_buf_len = 256;

  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = MIC_SCK;
  pins.ws_io_num = MIC_WS;
  pins.data_out_num = I2S_PIN_NO_CHANGE;
  pins.data_in_num = MIC_SD;

  i2s_driver_install(MIC_PORT, &cfg, 0, NULL);
  i2s_set_pin(MIC_PORT, &pins);
}

void initAmp() {
  pinMode(AMP_SD, OUTPUT);
  digitalWrite(AMP_SD, HIGH);

  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX);
  cfg.sample_rate = AUDIO_RATE;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 8;
  cfg.dma_buf_len = 512;
  cfg.tx_desc_auto_clear = true;

  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = I2S_BCLK;
  pins.ws_io_num = I2S_LRC;
  pins.data_out_num = I2S_DIN;
  pins.data_in_num = I2S_PIN_NO_CHANGE;

  i2s_driver_install(AMP_PORT, &cfg, 0, NULL);
  i2s_set_pin(AMP_PORT, &pins);
}

void captureTask(void*) {
  int32_t raw[256];
  size_t bytes;
  while (true) {
    i2s_read(MIC_PORT, raw, sizeof(raw), &bytes, portMAX_DELAY);
    int n = bytes / 4;
    for (int i = 0; i < n; i++) {
      int32_t s = raw[i] >> MIC_SHIFT;
      if (s > 32767) s = 32767;
      if (s < -32768) s = -32768;
      sampleBuf[bufSel][bufCount++] = (int16_t)s;
      if (bufCount >= EI_CLASSIFIER_SLICE_SIZE) {
        bufCount = 0;
        bufSel ^= 1;
        bufReady = true;
      }
    }
  }
}

void audioTask(void*) {
  int16_t out[512];
  size_t w;
  uint32_t total = (uint32_t)AUDIO_RATE * AUDIO_SECONDS;
  if (total > AUDIO_LEN) total = AUDIO_LEN;
  for (uint32_t i = 0; i < total; ) {
    uint32_t left = total - i;
    int cnt = left < 256 ? left : 256;
    for (int k = 0; k < cnt; k++) {
      int16_t s = (int32_t)audioData[i + k] * VOLUME / 100;
      out[2 * k] = s;
      out[2 * k + 1] = s;
    }
    i2s_write(AMP_PORT, out, cnt * 4, &w, portMAX_DELAY);
    i += cnt;
  }
  memset(out, 0, sizeof(out));
  for (int j = 0; j < 16; j++) i2s_write(AMP_PORT, out, 1024, &w, portMAX_DELAY);
  playing = false;
  vTaskDelete(NULL);
}

// Franja de avisos del servidor (solo en reposo; solo la dibuja videoTask).
static void drawBanner(multinode::Reactions::View view) {
  const char* text;
  uint16_t bg, fg;
  switch (view) {
    case multinode::Reactions::Attendance: text = "ASISTENCIA OK"; bg = ST77XX_GREEN; fg = ST77XX_BLACK; break;
    case multinode::Reactions::Heat:       text = "HACE CALOR";    bg = 0xFD20;       fg = ST77XX_BLACK; break;
    case multinode::Reactions::Noise:      text = "MUCHO RUIDO";   bg = ST77XX_RED;   fg = ST77XX_WHITE; break;
    default: return;
  }
  tft.fillRect(0, BANNER_Y, 240, BANNER_H, bg);
  tft.setTextSize(3);
  tft.setTextColor(fg);
  tft.setTextWrap(false);
  tft.setCursor((240 - (int)strlen(text) * 18) / 2, BANNER_Y + (BANNER_H - 24) / 2);
  tft.print(text);
}

void videoTask(void*) {
  uint32_t frame = 0, fanFrame = 0, heyFrame = 0;
  uint8_t lastMode = 0xFF;
  int shown = -1;                             // aviso dibujado en la franja; -1 = ninguno
  const uint32_t period = 1000 / VIDEO_FPS;
  while (true) {
    uint32_t t0 = millis();
    const uint8_t m = mode;
    if (m != lastMode) {                      // cambio de estado: los videos empiezan desde 0
      if (m == MODE_FAN) fanFrame = 0;
      if (m == MODE_LISTEN) heyFrame = 0;
      lastMode = m;
    }

    // Avisos del servidor: se calculan siempre, pero solo se muestran en reposo.
    lock();
    reactions.setSpeaking(playing, t0);       // la bocina no cuenta como ruido del aula
    if (playing) lastSpeakEpoch = time(nullptr);
    if (attendancePending && m == MODE_IDLE) { reactions.attendance(t0); attendancePending = false; }
    const auto view = reactions.visible(t0, networkUp);
    unlock();
    if (m != MODE_IDLE || view == multinode::Reactions::Idle) {
      clipY = 240; shown = -1;
    } else if ((int)view != shown) {
      clipY = BANNER_Y; drawBanner(view); shown = view;
    }

    if (m == MODE_ALERT) {
      uint32_t f = alertFrame;
      TJpgDec.drawJpg(0, 0, alertData + alertOffsets[f],
                      alertOffsets[f + 1] - alertOffsets[f]);
      alertFrame = (f + 1) % ALERT_FRAMES;
    } else if (m == MODE_FAN) {
      if (!fanDone) {
        uint32_t f = fanFrame % FAN_FRAMES;
        TJpgDec.drawJpg(0, 0, fanData + fanOffsets[f],
                        fanOffsets[f + 1] - fanOffsets[f]);
        if (++fanFrame >= (uint32_t)FAN_FRAMES * FAN_PLAYS) fanDone = true;
      }
    } else if (m == MODE_LISTEN) {
      // Video de "escuchando"; si terminara antes de LISTEN_MS se queda en el ultimo fotograma.
      if (heyFrame < HEY_FRAMES) {
        TJpgDec.drawJpg(0, 0, heyData + heyOffsets[heyFrame],
                        heyOffsets[heyFrame + 1] - heyOffsets[heyFrame]);
        ++heyFrame;
      }
    } else {
      TJpgDec.drawJpg(0, 0, videoData + videoOffsets[frame],
                      videoOffsets[frame + 1] - videoOffsets[frame]);
      frame = (frame + 1) % VIDEO_FRAMES;
    }
    uint32_t dt = millis() - t0;
    delay(dt < period ? period - dt : 1);
  }
}

// ---------------------------------------------------------------------------
// MQTT: contrato classai/v1, extension multinodo (docs/contracts.md)
// ---------------------------------------------------------------------------
static void common(JsonDocument& doc) {
  doc["v"] = 1; doc["room"] = ROOM_ID; doc["device"] = device; doc["role"] = "assistant";
  doc["uptime_ms"] = millis();
  time_t now = time(nullptr);
  if (now > 1700000000) {
    char ts[24]; struct tm tm; gmtime_r(&now, &tm);
    strftime(ts, sizeof(ts), "%Y-%m-%dT%H:%M:%SZ", &tm);
    doc["ts"] = ts;
  } else doc["ts"] = nullptr;
  doc["session_id"] = sessionId[0] ? sessionId : nullptr;
}

static void publishTo(const char* topic, JsonDocument& doc, bool retained) {
  char body[700];
  size_t n = serializeJson(doc, body, sizeof(body));
  if (n < sizeof(body)) mqtt.publish(topic, reinterpret_cast<uint8_t*>(body), n, retained);
}

static void publishOwn(const char* suffix, JsonDocument& doc, bool retained) {
  char topic[190];
  snprintf(topic, sizeof(topic), "%s/%s", nodePrefix, suffix);
  publishTo(topic, doc, retained);
}

static void publishTelemetry() {
  JsonDocument doc;
  lock();
  common(doc);
  doc["params_version"] = paramsVersion;
  unlock();
  doc["lux"] = nullptr;
  doc["comfort"] = nullptr;       // el asistente nunca es autoridad de confort
  doc["state"] = "REGULAR";
  doc["light_rel"] = nullptr;     // este Kirby no tiene fotoresistencia
  doc["agent_online"] = false;    // sin agente USB de voz: el reconocimiento es local
  doc["voice_state"] = mode == MODE_LISTEN ? "listening" : playing ? "speaking" : "idle";
  doc["audio_error"] = false;
  publishOwn("telemetry", doc, false);
}

// Orden al nodo de ambiente, mismo formato que set_room_fan() de la API.
static void publishFanOn() {
  const time_t now = time(nullptr);
  if (now < 1700000000) { Serial.println("[FAN] sin hora NTP: orden no enviada"); return; }
  char id[33];
  for (int i = 0; i < 4; i++) snprintf(id + 8 * i, 9, "%08lx", (unsigned long)esp_random());
  JsonDocument cmd;
  cmd["v"] = 1; cmd["room"] = ROOM_ID;
  char env[80]; snprintf(env, sizeof(env), "%s-environment", ROOM_ID);
  cmd["device"] = env;
  cmd["mode"] = "on";
  cmd["command_id"] = id;
  cmd["expires_at"] = (long long)now + 10;   // el nodo rechaza ordenes caducadas
  char topic[190];
  snprintf(topic, sizeof(topic), "%s/nodes/%s/fan/set", prefix, env);
  publishTo(topic, cmd, false);
  lock(); strlcpy(fanPendingId, id, sizeof(fanPendingId)); fanSentAt = millis(); unlock();
  Serial.printf("[FAN] orden de encendido enviada (command_id %s)\n", id);
}

static void onSnapshot(JsonDocument& doc) {
  if (doc.isNull() || doc["v"] != 1 || strcmp(doc["room"] | "", ROOM_ID)) return;
  auto reading = doc["telemetry"];
  // Confirmacion de la orden del ventilador: el nodo devuelve el command_id aplicado.
  // Si no esta armado o RELAY_VALIDATED=0, el nodo devuelve el id pero con fan_mode "auto".
  if (fanPendingId[0] && !strcmp(reading["fan_command_id"] | "", fanPendingId)) {
    const char* fanMode = reading["fan_mode"] | "?";
    if (!strcmp(fanMode, "on") && reading["fan_on"] == true)
      Serial.println("[FAN] ventilador ENCENDIDO (confirmado por el nodo de ambiente, 5 min)");
    else
      Serial.printf("[FAN] orden recibida pero NO aplicada (fan_mode=%s fan_enabled=%s): "
                    "nodo sin 'arm', RELAY_VALIDATED 0 o DHT11 sin lectura\n",
                    fanMode, reading["fan_enabled"] == true ? "true" : "false");
    fanPendingId[0] = 0;
  }
  if (doc["status"] != "online") { reactions.reset(); return; }
  const char* at = doc["received_at"] | "";
  if (!*at || !strcmp(at, environmentAt)) return;          // lectura repetida
  struct tm utc = {};
  const char* end = strptime(at, "%Y-%m-%dT%H:%M:%S", &utc);
  const time_t now = time(nullptr);
  const time_t measured = end ? mktime(&utc) : 0;           // TZ = UTC (configTime 0,0)
  if (now < 1700000000 || measured <= 0 || now < measured || now - measured > FRESH_S) return;
  strlcpy(environmentAt, at, sizeof(environmentAt));
  float noise = reading["noise_rel"] | NAN;
  // Ruido medido mientras (o poco despues de que) sonaba esta bocina: no cuenta.
  if (lastSpeakEpoch && measured <= lastSpeakEpoch + SPEAKER_GUARD_S) noise = NAN;
  reactions.sample(millis(), reading["temp_c"] | NAN, noise, maxTemp, maxNoise);
}

static void onAttendance(JsonDocument& doc) {
  if (doc["v"] != 1 || strcmp(doc["room"] | "", ROOM_ID)) return;
  const char* id = doc["event_id"] | "";
  if (!*id || strlen(id) >= sizeof(seenAttendance[0])) return;
  for (const auto& seen : seenAttendance) if (!strcmp(seen, id)) return;   // una vez por event_id
  strlcpy(seenAttendance[nextSeen++ % 8], id, sizeof(seenAttendance[0]));
  attendancePending = true;
}

static void onConfig(JsonDocument& doc) {
  if (doc["v"] != 1 || strcmp(doc["room"] | "", ROOM_ID) || !doc["params_version"].is<int>()) return;
  const int version = doc["params_version"];
  auto temp = doc["temp_c"].as<JsonArray>();
  if (version < paramsVersion || temp.size() != 2 || !temp[1].is<float>() || !doc["noise_rel_max"].is<float>()) return;
  const float t = temp[1], n = doc["noise_rel_max"];
  if (!isfinite(t) || !isfinite(n) || n <= 0 || n > 1) return;
  maxTemp = t; maxNoise = n; paramsVersion = version;
}

static void onSession(JsonDocument& doc) {
  if (doc["v"] != 1 || strcmp(doc["room"] | "", ROOM_ID) || !doc["revision"].is<uint32_t>()) return;
  const uint32_t revision = doc["revision"];
  const char* sid = doc["session_id"] | "";
  if (revision >= sessionRevision && strlen(sid) < sizeof(sessionId)) {
    sessionRevision = revision; strlcpy(sessionId, sid, sizeof(sessionId));
  }
}

void receive(char* topic, byte* payload, unsigned int length) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, length)) return;
  char expected[190];
  lock();
  snprintf(expected, sizeof(expected), "%s/nodes/%s-environment/snapshot", prefix, ROOM_ID);
  if (!strcmp(topic, expected)) onSnapshot(doc);
  snprintf(expected, sizeof(expected), "%s/display/attendance", prefix);
  if (!strcmp(topic, expected)) onAttendance(doc);
  snprintf(expected, sizeof(expected), "%s/config", prefix);
  if (!strcmp(topic, expected)) onConfig(doc);
  snprintf(expected, sizeof(expected), "%s/session", prefix);
  if (!strcmp(topic, expected)) onSession(doc);
  unlock();
}

void networkTask(void*) {
  uint32_t nextAttempt = 0, lastTelemetry = 0;
  unsigned backoff = 1000;
  bool wifiLogged = false;
  for (;;) {
    const uint32_t now = millis();
    if (WiFi.status() != WL_CONNECTED) {
      networkUp = false;
      if (wifiLogged) { Serial.println("[NET] WiFi desconectado"); wifiLogged = false; }
      if (multinode::elapsed(now, nextAttempt, 10000)) { WiFi.disconnect(); WiFi.begin(WIFI_SSID, WIFI_PASSWORD); nextAttempt = now; }
    } else {
      if (!wifiLogged) { Serial.printf("[NET] WiFi conectado, IP %s\n", WiFi.localIP().toString().c_str()); wifiLogged = true; }
      if (!mqtt.connected()) {
        networkUp = false;
        if (multinode::elapsed(now, nextAttempt, backoff)) {
          nextAttempt = now;
          char willTopic[180], will[200];
          snprintf(willTopic, sizeof(willTopic), "%s/status", nodePrefix);
          snprintf(will, sizeof(will), "{\"v\":1,\"room\":\"%s\",\"device\":\"%s\",\"role\":\"assistant\",\"status\":\"offline\"}", ROOM_ID, device);
          if (!mqtt.connect(device, MQTT_USER, MQTT_PASSWORD, willTopic, 1, true, will)) {
            Serial.printf("[NET] MQTT sin conexion (estado %d), reintento en %u ms\n", mqtt.state(), backoff);
            backoff = min(backoff * 2, 60000u);
          } else {
            backoff = 1000;
            char topic[190];   // solo los topicos que la ACL de a101-assistant permite leer
            snprintf(topic, sizeof(topic), "%s/session", prefix); mqtt.subscribe(topic, 1);
            snprintf(topic, sizeof(topic), "%s/config", prefix); mqtt.subscribe(topic, 1);
            snprintf(topic, sizeof(topic), "%s/nodes/%s-environment/snapshot", prefix, ROOM_ID); mqtt.subscribe(topic, 1);
            snprintf(topic, sizeof(topic), "%s/display/attendance", prefix); mqtt.subscribe(topic, 1);
            JsonDocument status;
            lock(); common(status); unlock();
            status["status"] = "online";
            publishOwn("status", status, true);
            Serial.printf("[NET] MQTT conectado como %s\n", device);
            lastTelemetry = now - TELEMETRY_MS;
          }
        }
      } else {
        networkUp = true;
        mqtt.loop();
        if (multinode::elapsed(now, lastTelemetry, TELEMETRY_MS)) { lastTelemetry = now; publishTelemetry(); }
      }
    }

    if (fanRequested) {                       // orden de voz "ventilador"
      fanRequested = false;
      if (networkUp) publishFanOn();
      else Serial.println("[FAN] sin conexion MQTT: orden no enviada (solo animacion)");
    }
    lock();
    if (fanPendingId[0] && multinode::elapsed(now, fanSentAt, FAN_CONFIRM_MS)) {
      Serial.println("[FAN] sin confirmacion: revisar ACL de fan/set, RELAY_VALIDATED y 'arm' en el nodo de ambiente");
      fanPendingId[0] = 0;
    }
    unlock();
    vTaskDelay(pdMS_TO_TICKS(networkUp ? 5 : 50));
  }
}

// ---------------------------------------------------------------------------
// Reconocimiento de voz (sin cambios respecto a la version sin red)
// ---------------------------------------------------------------------------
static int getData(size_t offset, size_t length, float *out) {
  numpy::int16_to_float(&sampleBuf[readBuf][offset], out, length);
  return 0;
}

static float labelValue(const ei_impulse_result_t& result, const char* name) {
  for (size_t i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
    if (strcmp(result.classification[i].label, name) == 0) return result.classification[i].value;
  }
  return 0;
}

static void startSixseven() {
  playing = true;
  alertFrame = 0;
  mode = MODE_ALERT;
  xTaskCreatePinnedToCore(audioTask, "audio", 4096, NULL, 1, NULL, 0);
}

static void startFan() {
  fanDone = false;
  mode = MODE_FAN;
#if FAN_ORDEN_REMOTA
  fanRequested = true;                        // networkTask envia la orden por MQTT
#endif
}

void setup() {
  Serial.begin(115200);
  stateLock = xSemaphoreCreateMutex();
  snprintf(device, sizeof(device), "%s-assistant", ROOM_ID);
  snprintf(prefix, sizeof(prefix), "classai/v1/%s", ROOM_ID);
  snprintf(nodePrefix, sizeof(nodePrefix), "%s/nodes/%s", prefix, device);

  spiTFT.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);
  tft.init(240, 240);
  tft.setRotation(0);
  tft.fillScreen(ST77XX_BLACK);

  TJpgDec.setJpgScale(1);
  TJpgDec.setSwapBytes(false);
  TJpgDec.setCallback(tftOutput);

  sampleBuf[0] = (int16_t*)malloc(EI_CLASSIFIER_SLICE_SIZE * sizeof(int16_t));
  sampleBuf[1] = (int16_t*)malloc(EI_CLASSIFIER_SLICE_SIZE * sizeof(int16_t));
  if (!sampleBuf[0] || !sampleBuf[1]) {
    Serial.println("Sin memoria para buffers");
    while (true) delay(1000);
  }

  initAmp();
  run_classifier_init();
  initMic();
  xTaskCreatePinnedToCore(captureTask, "capture", 4096, NULL, 2, NULL, 0);
  xTaskCreatePinnedToCore(videoTask, "video", 8192, NULL, 1, NULL, 0);

  // Red: valida la CA y el hostname del broker (WiFiClientSecure); nunca setInsecure().
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  transport.setCACert(MQTT_ROOT_CA);
  transport.setTimeout(5);
  transport.setHandshakeTimeout(5);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(receive);
  mqtt.setBufferSize(1536);
  mqtt.setSocketTimeout(2);
  xTaskCreatePinnedToCore(networkTask, "mqtt", 10240, NULL, 1, NULL, 0);
  Serial.printf("Escuchando... di \"hey kirby\" (heap libre %u)\n", (unsigned)ESP.getFreeHeap());
}

void loop() {
  static int heyHits = 0, hits67 = 0, hitsFan = 0;
  static uint32_t blockUntil = 0;

  while (!bufReady) delay(1);
  bufReady = false;
  readBuf = bufSel ^ 1;

  int peak = 0;
  for (size_t i = 0; i < EI_CLASSIFIER_SLICE_SIZE; i++) {
    int a = abs(sampleBuf[readBuf][i]);
    if (a > peak) peak = a;
  }

  signal_t signal;
  signal.total_length = EI_CLASSIFIER_SLICE_SIZE;
  signal.get_data = &getData;
  ei_impulse_result_t result = {};
  if (run_classifier_continuous(&signal, &result, false) != EI_IMPULSE_OK) return;

  const float pHey = labelValue(result, "hey_kirby");
  const float p67 = labelValue(result, "sixseven");
  const float pFan = labelValue(result, "ventilador");
  const uint32_t now = millis();
  Serial.printf("hey: %.2f  67: %.2f  fan: %.2f  pico: %d  (dsp %d ms, red %d ms)\n",
                pHey, p67, pFan, peak, result.timing.dsp, result.timing.classification);

  switch (mode) {
    case MODE_ALERT:                                   // sixseven: espera a que acabe el audio
      if (!playing) {
        Serial.println("Fin de sixseven, vuelta a reposo");
        mode = MODE_IDLE; blockUntil = now + COOLDOWN_MS; heyHits = 0;
      }
      return;

    case MODE_FAN:                                     // ventilador: espera a que acabe el video
      if (fanDone) {
        Serial.println("Fin del video del ventilador, vuelta a reposo");
        mode = MODE_IDLE; blockUntil = now + COOLDOWN_MS; heyHits = 0;
      }
      return;

    case MODE_LISTEN: {
      const uint32_t elapsed = now - listenStart;
      if (elapsed >= LISTEN_MS) {
        Serial.println("Sin orden, vuelta a reposo");
        mode = MODE_IDLE; blockUntil = now + 500; heyHits = 0;
        return;
      }
      if (elapsed < LISTEN_IGNORE_MS || peak <= MIN_PEAK) { hits67 = hitsFan = 0; return; }
      hitsFan = (pFan > UMBRAL_FAN && pFan >= p67) ? hitsFan + 1 : 0;
      hits67 = (p67 > UMBRAL_67 && p67 > pFan) ? hits67 + 1 : 0;
      if (hitsFan >= HITS_ORDEN) {
        Serial.printf("ORDEN: ventilador p=%.2f pico=%d\n", pFan, peak);
        startFan();
      } else if (hits67 >= HITS_ORDEN) {
        Serial.printf("ORDEN: sixseven p=%.2f pico=%d\n", p67, peak);
        startSixseven();
      }
      return;
    }

    default:                                           // MODE_IDLE
      if (now < blockUntil) { heyHits = 0; return; }
#if SIXSEVEN_DIRECTO
      if (p67 > 0.98f && peak > MIN_PEAK) {
        Serial.printf("DETECTADO sixseven directo p=%.2f pico=%d\n", p67, peak);
        startSixseven();
        return;
      }
#endif
      heyHits = (pHey > UMBRAL_HEY && peak > MIN_PEAK) ? heyHits + 1 : 0;
      if (heyHits >= HITS_HEY) {
        Serial.printf("HEY KIRBY detectado p=%.2f -> escuchando %d s\n", pHey, LISTEN_MS / 1000);
        heyHits = hits67 = hitsFan = 0;
        listenStart = now;
        mode = MODE_LISTEN;
      }
      return;
  }
}
