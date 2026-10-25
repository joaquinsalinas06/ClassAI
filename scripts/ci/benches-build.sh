#!/usr/bin/env bash
# Compile only. Never opens Serial, reads flash, uploads, or copies private headers.
set -euo pipefail
cd "$(dirname "$0")/../.."
fqbn=esp32:esp32:esp32doit-devkit-v1
for sketch in ambient_bench led_button_bench sound_bench inmp441_bench status_led_bench; do
  arduino-cli compile --fqbn "$fqbn" --jobs 2 "firmware/$sketch"
done
for profile in DHT PIR; do
  arduino-cli compile --fqbn "$fqbn" --jobs 2 --build-property "compiler.cpp.extra_flags=-DBENCH_${profile}_ONLY=1" firmware/ambient_bench
done
