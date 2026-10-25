#pragma once
#include <cstdint>
#include <cmath>
struct SampleStats {
  uint32_t count = 0;
  double squareSum = 0;
  int32_t minimum = 8388607, maximum = -8388608;
  void add(int32_t word) {
    // INMP441 signed 24-bit sample is MSB-aligned in a 32-bit I2S slot.
    const int32_t sample = word >> 8;
    if(sample < minimum) minimum = sample;
    if(sample > maximum) maximum = sample;
    squareSum += static_cast<double>(sample)*sample;
    ++count;
  }
  double rms() const { return count ? std::sqrt(squareSum/count)/8388608.0 : 0; }
  double peakToPeak() const { return count ? (static_cast<double>(maximum)-minimum)/16777215.0 : 0; }
};
