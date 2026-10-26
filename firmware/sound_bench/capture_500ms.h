#pragma once
// M-06: B-08 AO -> GPIO34 only after supply/output validation. DO stays disconnected.
#include <Arduino.h>

constexpr uint8_t SOUND_PIN = 34;
constexpr uint32_t WINDOW_MS = 500;

void setup() {
  Serial.begin(115200);
  pinMode(SOUND_PIN, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(SOUND_PIN, ADC_11db);
  Serial.println("M-06 sonido relativo: AO GPIO34, Serial 115200; ADC crudo, no dB. Validar niveles antes de conectar.");
}

void loop() {
  const uint32_t started = millis();
  uint16_t minimum = 4095, maximum = 0;
  uint32_t sum = 0, samples = 0, railSamples = 0;
  do {
    const uint16_t value = analogRead(SOUND_PIN);
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
    sum += value;
    ++samples;
    if (value == 0 || value == 4095) ++railSamples;
    // Diagnostic sampling only: Arduino conversion overhead makes the rate approximate.
    delayMicroseconds(250);
  } while (millis() - started < WINDOW_MS);
  Serial.printf("{\"uptime_ms\":%lu,\"samples\":%lu,\"min\":%u,\"max\":%u,\"mean\":%lu,\"peak_to_peak\":%u,\"rail_samples\":%lu}\n",
                static_cast<unsigned long>(millis()), static_cast<unsigned long>(samples),
                static_cast<unsigned>(minimum), static_cast<unsigned>(maximum),
                static_cast<unsigned long>(sum / samples), static_cast<unsigned>(maximum - minimum),
                static_cast<unsigned long>(railSamples));
}
