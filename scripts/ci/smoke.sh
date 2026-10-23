#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
export CLASSAI_MQTT_SMOKE=1
exec "${PYTHON:-python3}" -m pytest backend/tests/test_mqtt_integration.py -v -s "$@"
