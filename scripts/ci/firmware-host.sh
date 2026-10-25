#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
build_dir=$(mktemp -d)
trap 'rm -rf "$build_dir"' EXIT
for name in comfort nfc_protocol; do
  "${CXX:-g++}" -std=c++17 -Wall -Wextra -Werror -I firmware/classai_node \
    "firmware/classai_node/test/test_${name}.cpp" -o "$build_dir/$name"
  "$build_dir/$name"
done

python3 scripts/ci/nfc-profile-host.py

bash scripts/ci/bench-host.sh
bash scripts/ci/sensor-benches-host.sh
