#!/usr/bin/env bash
set -euo pipefail
index=https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index --additional-urls "$index"
arduino-cli core install esp32:esp32@3.3.12 --additional-urls "$index"
arduino-cli lib install 'PubSubClient@2.8' 'ArduinoJson@7.4.3' \
  'Adafruit BusIO@1.17.4' 'Adafruit MLX90614 Library@2.1.7' 'Adafruit PN532@1.3.4' \
  'DHT sensor library@1.4.7' 'Adafruit Unified Sensor@1.1.15'
