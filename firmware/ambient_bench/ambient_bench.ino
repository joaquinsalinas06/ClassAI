// Banco M-04/05: ESP32 + DHT11 (GPIO4) + PIR (GPIO27), sin WiFi/NFC/actuadores.
// Alimentación y pinout: docs/hardware/banco-ambiente.md. No cargar sin identificar placa y respaldo.
#include <Arduino.h>
#include <DHT.h>

constexpr uint8_t DHT_PIN = 4;
constexpr uint8_t PIR_PIN = 27;
constexpr uint32_t SAMPLE_MS = 2500;
constexpr uint32_t PIR_WARMUP_MS = 60000;
DHT dht(DHT_PIN, DHT11);
uint32_t sampledAt = 0;
int previousMotion = -1;

void setup() {
  Serial.begin(115200);
  pinMode(PIR_PIN, INPUT);
  dht.begin();
  Serial.println("Banco DHT11 + PIR: DATA GPIO4; OUT GPIO27; serial 115200. PIR en estabilizacion 60 s.");
}

void loop() {
  const uint32_t now = millis();
  const bool warmingUp = now < PIR_WARMUP_MS;
  const int motion = digitalRead(PIR_PIN);
  if (!warmingUp && motion != previousMotion) {
    previousMotion = motion;
    Serial.printf("PIR cambio: %s\n", motion == HIGH ? "movimiento" : "inactivo");
  }
  if (now - sampledAt < SAMPLE_MS) return;
  sampledAt = now;
  const float temperature = dht.readTemperature();
  const float humidity = dht.readHumidity();
  Serial.printf("{\"uptime_ms\":%lu,\"dht_valid\":%s,\"temp_c\":", static_cast<unsigned long>(now),
                isnan(temperature) || isnan(humidity) ? "false" : "true");
  if (isnan(temperature)) Serial.print("null"); else Serial.print(temperature, 1);
  Serial.print(",\"rh_pct\":");
  if (isnan(humidity)) Serial.print("null"); else Serial.print(humidity, 1);
  Serial.printf(",\"pir_warming_up\":%s,\"motion\":", warmingUp ? "true" : "false");
  if (warmingUp) Serial.print("null"); else Serial.print(motion == HIGH ? "true" : "false");
  Serial.println("}");
}
