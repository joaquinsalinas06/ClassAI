// Índice de confort ClassAI (docs/contracts.md, "Config de confort") — C++ puro, sin Arduino.
// Referencia idéntica en backend/tuner.py (comfort_index); ambos se prueban con
// test/comfort_cases.txt (test/test_comfort.cpp y backend/tests/test_tuner.py).
#pragma once
#include <math.h>

struct ComfortParams {
  float tempMin, tempMax, rhMin, rhMax, luxMin, luxMax, noiseRelMax;
  float wTemp, wRh, wLux, wNoise;
  int okMin, regularMin;
  int paramsVersion;
};

// Valores de fábrica del contrato (params_version 0).
inline ComfortParams comfortDefaults() {
  return ComfortParams{21, 24, 40, 60, 300, 500, 0.5f, 0.35f, 0.20f, 0.20f, 0.25f, 80, 60, 0};
}

const double COMFORT_TEMP_FALLOFF_C = 3.0;  // temperatura: 0 a ±3 °C fuera del rango
const double COMFORT_NOISE_FALLOFF = 0.3;   // ruido: 0 en noiseRelMax + 0.3

// 100 dentro de [lo, hi]; fuera cae linealmente a 0 a la distancia `falloff`.
inline double comfortScore(double v, double lo, double hi, double falloff) {
  if (v >= lo && v <= hi) return 100.0;
  double d = v < lo ? lo - v : v - hi;
  double s = 100.0 * (1.0 - d / falloff);
  return s > 0.0 ? s : 0.0;
}

// NaN = sensor inválido: su peso se reparte entre los válidos. -1 si no hay ninguno válido.
inline int comfortIndex(const ComfortParams& p, float tempC, float rhPct, float lux, float noiseRel) {
  double sum = 0, wsum = 0;
  if (!isnan(tempC)) {
    sum += p.wTemp * comfortScore(tempC, p.tempMin, p.tempMax, COMFORT_TEMP_FALLOFF_C);
    wsum += p.wTemp;
  }
  if (!isnan(rhPct)) {
    sum += p.wRh * comfortScore(rhPct, p.rhMin, p.rhMax, fmax((double)p.rhMax - p.rhMin, 1e-6));
    wsum += p.wRh;
  }
  if (!isnan(lux)) {
    sum += p.wLux * comfortScore(lux, p.luxMin, p.luxMax, fmax((double)p.luxMax - p.luxMin, 1e-6));
    wsum += p.wLux;
  }
  if (!isnan(noiseRel)) {
    sum += p.wNoise * comfortScore(noiseRel, -INFINITY, p.noiseRelMax, COMFORT_NOISE_FALLOFF);
    wsum += p.wNoise;
  }
  if (wsum <= 0) return -1;
  int c = (int)floor(sum / wsum + 0.5);
  return c < 0 ? 0 : (c > 100 ? 100 : c);
}

// Sin sensores válidos (-1) -> "REGULAR": no hay base para encender ventilador ni buzzer
// (en telemetría se envía comfort = null).
inline const char* comfortState(const ComfortParams& p, int comfort) {
  if (comfort < 0) return "REGULAR";
  if (comfort >= p.okMin) return "OK";
  return comfort >= p.regularMin ? "REGULAR" : "ALERT";
}
