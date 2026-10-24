#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# Compile a disposable copy so a developer's secrets.h can never enter CI artifacts.
build_dir=$(mktemp -d)
trap 'rm -rf "$build_dir"' EXIT
mkdir "$build_dir/classai_node"
cp firmware/classai_node/{classai_node.ino,comfort.h,nfc_protocol.h,nfc_reader.h,nfc_reader.cpp} "$build_dir/classai_node/"
cp firmware/classai_node/secrets.example.h "$build_dir/classai_node/secrets.h"
profile=${1:-all}
case "$profile" in
  all|normal|nfc-only) ;;
  *) echo 'Usage: firmware-build.sh [all|normal|nfc-only]' >&2; exit 2 ;;
esac
if [[ "$profile" != nfc-only ]]; then
  arduino-cli compile --fqbn esp32:esp32:esp32 --jobs 2 "$build_dir/classai_node"
fi
if [[ "$profile" != normal ]]; then
  nfc_command=(arduino-cli compile --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2
    --build-property 'compiler.cpp.extra_flags=-DNFC_ONLY=1')
  if [[ -n "${NFC_BUILD_OUTPUT:-}" ]]; then
    nfc_command+=(--output-dir "$NFC_BUILD_OUTPUT")
  fi
  "${nfc_command[@]}" "$build_dir/classai_node"
fi
