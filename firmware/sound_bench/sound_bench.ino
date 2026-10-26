// Historical physical capture profile; default remains cooperative 100 ms.
#if defined(BENCH_CAPTURE_500MS)
#include "capture_500ms.h"
#else
// B-08 AO/G/+/DO, exact variant/power unconfirmed. DO is intentionally unused.
// Only ADC34 is configured; no network or actuator initialization.
#include <Arduino.h>
constexpr uint8_t SOUND_PIN = 34;
constexpr uint32_t WINDOW_MS = 100;
constexpr uint32_t SAMPLE_US = 1000;
uint32_t windowAt = 0, sampleAt = 0;
uint16_t minimum = 4095, maximum = 0;
uint32_t samples = 0;
void setup() {
  Serial.begin(115200);
  pinMode(SOUND_PIN, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(SOUND_PIN, ADC_11db);
  Serial.println("B-08: AO GPIO34; DO libre. Confirmar variante/VCC/nivel antes de conectar. Ruido relativo, NO dB.");
  windowAt = millis(); sampleAt = micros();
}
void loop() {
  const uint32_t now = millis(), us = micros();
  if (us - sampleAt >= SAMPLE_US) {
    sampleAt = us;
    const uint16_t value = analogRead(SOUND_PIN);
    if(value < minimum) minimum = value;
    if(value > maximum) maximum = value;
    ++samples;
  }
  if (now - windowAt < WINDOW_MS) return;
  if (samples) Serial.printf("{\"samples\":%lu,\"min\":%u,\"max\":%u,\"peak_to_peak\":%u,\"noise_rel\":%.5f,\"clipped\":%s}\n",static_cast<unsigned long>(samples),minimum,maximum,maximum-minimum,(maximum-minimum)/4095.0,(minimum==0||maximum==4095)?"true":"false");
  else Serial.println("{\"samples\":0,\"noise_rel\":null}");
  windowAt = now; samples = 0; minimum = 4095; maximum = 0;
}

#endif
