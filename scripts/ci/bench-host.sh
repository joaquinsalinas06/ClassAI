#!/usr/bin/env bash
# Exercise the actual isolated sketches with temporary host stubs. No serial device or flash.
set -euo pipefail
cd "$(dirname "$0")/../.."
bench_build=$(mktemp -d)
trap 'rm -rf "$bench_build"' EXIT
cat > "$bench_build/Arduino.h" <<'CPP'
#pragma once
#include <cstdint>
#include <cassert>
constexpr int HIGH=1, LOW=0, OUTPUT=1, INPUT_PULLUP=2;
inline uint32_t clockMs=0;
inline int buttonValue=HIGH, written[40]={}, modes[40]={};
inline uint32_t millis(){return clockMs;}
inline void delay(unsigned ms){clockMs+=ms;}
inline int digitalRead(unsigned){return buttonValue;}
inline void digitalWrite(unsigned pin,int v){written[pin]=v;}
inline void pinMode(unsigned pin,int mode){modes[pin]=mode;}
struct SerialStub {
  void begin(unsigned long){}
  void println(const char*){}
  template<class... Args> void printf(const char*,Args...){}
};
inline SerialStub Serial;
CPP
cat > "$bench_build/test_led.cpp" <<'CPP'
#include "led_button_bench.ino"
static void sample(uint32_t time,int value){clockMs=time;buttonValue=value;loop();}
int main(){
  setup(); assert(written[25]==LOW && modes[32]==INPUT_PULLUP);
  sample(0,LOW);sample(34,LOW);assert(!on);
  sample(35,LOW);assert(on && written[25]==HIGH);
  sample(1000,LOW);assert(on); // held: no repeated toggle
  sample(1001,HIGH);sample(1004,LOW);sample(1008,HIGH);sample(1043,HIGH);assert(on);
  sample(1044,LOW);sample(1046,HIGH);sample(1048,LOW);sample(1082,LOW);assert(on);
  sample(1083,LOW);assert(!on && written[25]==LOW);
}
CPP
cat > "$bench_build/SPI.h" <<'CPP'
#pragma once
struct SPIStub { void begin(int,int,int,int){} };
inline SPIStub SPI;
CPP
cat > "$bench_build/Adafruit_PN532.h" <<'CPP'
#pragma once
#include <cstdint>
constexpr int PN532_MIFARE_ISO14443A=0;
inline bool targetPresent=false, configOK=true;
inline uint32_t reportedVersion=0x32010607;
inline int versionCalls=0;
class Adafruit_PN532 {
 public:
  explicit Adafruit_PN532(int){}
  void begin(){}
  uint32_t getFirmwareVersion(){++versionCalls;return reportedVersion;}
  bool SAMConfig(){return configOK;}
  bool setPassiveActivationRetries(int){return true;}
  bool readPassiveTargetID(int,uint8_t*,uint8_t* len,int){*len=4;return targetPresent;}
};
CPP
cat > "$bench_build/test_nfc.cpp" <<'CPP'
#include "nfc_bench.ino"
int main(){
  reportedVersion=0;setup();assert(!ready && versionCalls==3);
  reportedVersion=0x32010607;setup();assert(ready);
  targetPresent=true;loop();assert(reads==1 && waitRelease);
  loop();loop();loop();assert(reads==1);
  targetPresent=false;loop();assert(waitRelease);loop();assert(!waitRelease);
  targetPresent=true;loop();assert(reads==2);
  configOK=false;setup();assert(!ready);loop();assert(reads==2);
}
CPP
for bench in led nfc; do
  if [[ "$bench" == led ]]; then sketch=led_button_bench; else sketch=nfc_bench; fi
  "${CXX:-g++}" -std=c++17 -Wall -Wextra -Werror -I "$bench_build" -I "firmware/$sketch" "$bench_build/test_$bench.cpp" -o "$bench_build/$bench"
  "$bench_build/$bench"
done
printf '%s\n' 'PASS: actual LED debounce/hold sketch and NFC failure/hold/release sketch (host stubs, no hardware).'
