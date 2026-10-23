#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# Compile a disposable copy so a developer's secrets.h can never enter CI artifacts.
build_dir=$(mktemp -d)
trap 'rm -rf "$build_dir"' EXIT
mkdir "$build_dir/classai_node"
cp firmware/classai_node/{classai_node.ino,comfort.h,nfc_protocol.h,nfc_reader.h,nfc_reader.cpp} "$build_dir/classai_node/"
cp firmware/classai_node/secrets.example.h "$build_dir/classai_node/secrets.h"
arduino-cli compile --fqbn esp32:esp32:esp32 --jobs 2 "$build_dir/classai_node"
