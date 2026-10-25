// Banco M-04/05: ESP32 + DHT11 (GPIO4) + PIR (GPIO27), sin WiFi/NFC/actuadores.
// Alimentación y pinout: docs/hardware/banco-ambiente.md. No cargar sin identificar placa y respaldo.
#include <Arduino.h>
#if defined(BENCH_DHT_ONLY) && defined(BENCH_PIR_ONLY)
#error Select only one isolated profile
#endif
#if !defined(BENCH_PIR_ONLY)
#include <DHT.h>
#endif

constexpr uint8_t DHT_PIN = 4;
constexpr uint8_t PIR_PIN = 27;
constexpr uint32_t SAMPLE_MS = 2500;
constexpr uint32_t PIR_WARMUP_MS = 60000;
#if !defined(BENCH_PIR_ONLY)
DHT dht(DHT_PIN, DHT11);
#endif
uint32_t sampledAt = 0;
int previousMotion = -1;

void setup() {
  Serial.begin(115200);
#if !defined(BENCH_DHT_ONLY)
  pinMode(PIR_PIN, INPUT);
#endif
#if !defined(BENCH_PIR_ONLY)
  dht.begin();
#endif
#if defined(BENCH_DHT_ONLY)
  Serial.println("DHT11 solo: DATA GPIO4, Serial 115200; PIR no inicializado.");
#elif defined(BENCH_PIR_ONLY)
  Serial.println("PIR solo: OUT GPIO27, calentamiento 60 s; DHT11 no inicializado.");
#else
  Serial.println("DHT11 GPIO4 + PIR GPIO27; calentamiento PIR 60 s; Serial 115200.");
#endif
}

void loop() {
  const uint32_t now = millis();
#if !defined(BENCH_DHT_ONLY)
  const bool warmingUp = now < PIR_WARMUP_MS;
  const int motion = digitalRead(PIR_PIN);
  if (!warmingUp && motion != previousMotion) {
    previousMotion = motion;
    Serial.printf("PIR cambio: %s\n", motion == HIGH ? "movimiento" : "inactivo");
  }
#endif
  if (now - sampledAt < SAMPLE_MS) return;
  sampledAt = now;
  Serial.printf("{\"uptime_ms\":%lu", static_cast<unsigned long>(now));
#if !defined(BENCH_PIR_ONLY)
  const float temperature = dht.readTemperature();
  const float humidity = dht.readHumidity();
  Serial.printf(",\"dht_valid\":%s,\"temp_c\":", isnan(temperature) || isnan(humidity) ? "false" : "true");
  if (isnan(temperature)) Serial.print("null"); else Serial.print(temperature, 1);
  Serial.print(",\"rh_pct\":");
  if (isnan(humidity)) Serial.print("null"); else Serial.print(humidity, 1);
#endif
#if !defined(BENCH_DHT_ONLY)
  Serial.printf(",\"pir_warming_up\":%s,\"motion\":", warmingUp ? "true" : "false");
  if (warmingUp) Serial.print("null"); else Serial.print(motion == HIGH ? "true" : "false");
#endif
  Serial.println("}");
}
