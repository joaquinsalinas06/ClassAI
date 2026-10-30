#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
node_tmp=$(mktemp -d)
trap 'rm -rf "$node_tmp"' EXIT
mkdir -p "$node_tmp/classai_multinode" "$node_tmp/classai_node"
cp firmware/classai_multinode/{classai_multinode.ino,node_policy.h} "$node_tmp/classai_multinode/"
cp firmware/classai_multinode/secrets.example.h "$node_tmp/classai_multinode/secrets.h"
cp firmware/classai_node/{comfort.h,nfc_reader.h,nfc_protocol.h,nfc_reader.cpp} "$node_tmp/classai_node/"
python3 scripts/ci/prepare-pn532.py "$node_tmp/Adafruit_PN532"
for role in 1 2 3; do
 arduino-cli compile --library "$node_tmp/Adafruit_PN532" --libraries firmware/libraries \
  --fqbn esp32:esp32:esp32 --jobs 2 --build-property "compiler.cpp.extra_flags=-DCLASSAI_ROLE=$role" "$node_tmp/classai_multinode"
done
