#!/usr/bin/env bash
# Actual isolated sketches under host stubs; never accesses USB or actuators.
set -euo pipefail
cd "$(dirname "$0")/../.."
bench_tmp=$(mktemp -d)
trap 'rm -rf "$bench_tmp"' EXIT
cat > "$bench_tmp/Arduino.h" <<'CPP'
#pragma once
#include <cassert>
#include <cstdint>
#include <cmath>
#include <cstdio>
#include <string>
#include <initializer_list>
constexpr int HIGH=1, LOW=0, OUTPUT=1, INPUT_PULLUP=2, INPUT=3, ADC_11db=3;
inline uint32_t clockMs=0, clockUs=0;
inline int modes[40]={}, written[40]={}, reads[40]={}, inputValue=0, adcValue=0;
inline uint32_t millis(){return clockMs;}
inline uint32_t micros(){return clockUs;}
inline void delay(unsigned ms){clockMs+=ms;clockUs+=1000*ms;}
inline int digitalRead(unsigned pin){++reads[pin];return inputValue;}
inline void digitalWrite(unsigned pin,int value){written[pin]=value;}
inline void pinMode(unsigned pin,int mode){modes[pin]=mode;}
inline void analogReadResolution(int){}
inline void analogSetPinAttenuation(int,int){}
inline int analogRead(int pin){++reads[pin];return adcValue;}
struct SerialStub {
 std::string out, input;
 void begin(unsigned long){}
 void print(const char* s){out+=s;}
 void print(float v,int precision){char b[40];snprintf(b,sizeof(b),"%.*f",precision,v);out+=b;}
 void println(const char* s){out+=s;out+='\n';}
 template<class... Args> void printf(const char* fmt,Args... args){char b[1024];snprintf(b,sizeof(b),fmt,args...);out+=b;}
 int available(){return static_cast<int>(input.size());}
 int read(){char c=input[0];input.erase(0,1);return c;}
};
inline SerialStub Serial;
using std::isnan;
CPP
cat > "$bench_tmp/DHT.h" <<'CPP'
#pragma once
constexpr int DHT11=11;
inline int dhtBegins=0;
inline float temp=24, humidity=50;
class DHT { public: DHT(int,int){} void begin(){++dhtBegins;} float readTemperature(){return temp;} float readHumidity(){return humidity;} };
CPP
cat > "$bench_tmp/ambient.cpp" <<'CPP'
#include "ambient_bench.ino"
int main(){
 setup(); Serial.out.clear();
 clockMs=2500;loop();
#if defined(BENCH_DHT_ONLY)
 assert(modes[27]==0 && reads[27]==0 && dhtBegins==1);
 assert(Serial.out.find("motion")==std::string::npos);
 temp=NAN; clockMs=5000;Serial.out.clear();loop();
 assert(Serial.out.find("\"dht_valid\":false,\"temp_c\":null")!=std::string::npos);
#elif defined(BENCH_PIR_ONLY)
 assert(Serial.out.find("temp_c")==std::string::npos && modes[27]==INPUT);
 assert(Serial.out.find("\"motion\":null")!=std::string::npos);
 clockMs=60000;inputValue=HIGH;Serial.out.clear();loop();
 assert(Serial.out.find("PIR cambio: movimiento")!=std::string::npos);
 assert(Serial.out.find("\"motion\":true")!=std::string::npos);
 Serial.out.clear();clockMs=60001;loop();assert(Serial.out.empty());
 inputValue=LOW;clockMs=60002;loop();assert(Serial.out.find("inactivo")!=std::string::npos);
#else
 assert(dhtBegins==1 && modes[27]==INPUT);
 assert(Serial.out.find("\"dht_valid\":true")!=std::string::npos);
 assert(Serial.out.find("\"motion\":null")!=std::string::npos);
#endif
 for(int p : {17,25,26}) assert(modes[p]==0 && written[p]==0);
}
CPP
cat > "$bench_tmp/sound.cpp" <<'CPP'
#include "sound_bench.ino"
int main(){
 setup(); Serial.out.clear();
 clockUs=1000;adcValue=100;loop();clockUs=2000;adcValue=2100;loop();
 clockMs=100;loop();
 assert(Serial.out.find("\"samples\":2,\"min\":100,\"max\":2100,\"peak_to_peak\":2000")!=std::string::npos);
 assert(Serial.out.find("\"clipped\":false")!=std::string::npos);
 assert(samples==0 && minimum==4095 && maximum==0 && modes[34]==INPUT);
 Serial.out.clear();clockMs=200;loop();assert(Serial.out.find("\"noise_rel\":null")!=std::string::npos);
 Serial.out.clear();clockMs=250;clockUs=3000;adcValue=4095;loop();clockMs=300;loop();
 assert(Serial.out.find("\"clipped\":true")!=std::string::npos);
 for(int p : {17,25,26,27})assert(modes[p]==0);
}
CPP
cat > "$bench_tmp/leds.cpp" <<'CPP'
#include "status_led_bench.ino"
int main(){
 setup(); assert(written[25]==LOW && written[26]==LOW && written[27]==LOW);
 Serial.input="red\n";loop();assert(written[25]==HIGH && written[26]==LOW && written[27]==LOW);
 Serial.input="green\n";loop();assert(written[25]==LOW && written[27]==HIGH);
 Serial.input="yellow\r\n";loop();assert(written[26]==HIGH && written[27]==LOW);
 Serial.input="too-long-command-green\n";loop();assert(written[25]==LOW && written[26]==LOW && written[27]==LOW);
 Serial.input="green\noff\n";loop();assert(written[27]==LOW);
 assert(modes[17]==0 && modes[32]==0);
}
CPP
cat > "$bench_tmp/mic.cpp" <<'CPP'
#include <cassert>
#include "sample_stats.h"
int main(){
 SampleStats s;assert(s.rms()==0 && s.peakToPeak()==0);
 s.add(0);assert(s.count==1 && s.rms()==0);
 s={};s.add(0x40000000);s.add(-0x40000000);
 assert(s.minimum==-4194304 && s.maximum==4194304 && s.count==2);
 assert(s.rms()==0.5 && s.peakToPeak()>0.49 && s.peakToPeak()<0.51);
 s={};s.add(INT32_MIN);s.add(INT32_MAX);assert(s.rms()<=1 && s.peakToPeak()==1);
}
CPP
mkdir -p "$bench_tmp/driver"
cat > "$bench_tmp/driver/i2s_std.h" <<'CPP'
#pragma once
#include <cstdint>
#include <cstring>
using esp_err_t=int;using gpio_num_t=int;using i2s_chan_handle_t=void*;
constexpr int ESP_OK=0,I2S_NUM_AUTO=-1,I2S_ROLE_MASTER=1,I2S_DATA_BIT_WIDTH_32BIT=32,I2S_SLOT_MODE_STEREO=2,I2S_GPIO_UNUSED=-1;
struct i2s_chan_config_t {};
struct i2s_std_config_t { struct Empty {} clk_cfg,slot_cfg;struct GPIO { int mclk,bclk,ws,dout,din; }gpio_cfg; };
#define I2S_CHANNEL_DEFAULT_CONFIG(a,b) {}
#define I2S_STD_CLK_DEFAULT_CONFIG(a) {}
#define I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(a,b) {}
inline int initError=0,readError=0,deleted=0;
inline size_t frameBytes=512;
inline int16_t sampleLeft=256,sampleRight=-32767;
inline esp_err_t i2s_new_channel(i2s_chan_config_t*,void*,i2s_chan_handle_t* rx){*rx=reinterpret_cast<void*>(1);return initError;}
inline esp_err_t i2s_channel_init_std_mode(i2s_chan_handle_t,i2s_std_config_t* config){assert(config->gpio_cfg.bclk==26&&config->gpio_cfg.ws==25&&config->gpio_cfg.din==33&&config->gpio_cfg.dout==I2S_GPIO_UNUSED);return 0;}
inline esp_err_t i2s_channel_enable(i2s_chan_handle_t){return 0;}
inline esp_err_t i2s_del_channel(i2s_chan_handle_t){++deleted;return 0;}
inline esp_err_t i2s_channel_read(i2s_chan_handle_t,void* out,size_t len,size_t* bytes,int timeout){
 assert(timeout==50);*bytes=frameBytes;
 auto words=static_cast<int32_t*>(out);for(size_t i=0;i<len/sizeof(int32_t);i+=2){words[i]=static_cast<int32_t>(sampleLeft)*256;words[i+1]=static_cast<int32_t>(sampleRight)*256;}
 return readError;
}
CPP
cat > "$bench_tmp/mic_sketch.cpp" <<'CPP'
#include "inmp441_bench.ino"
int main(){
 setup();assert(ready);Serial.out.clear();loop();
 assert(stats.count==64 && stats.minimum==256 && stats.maximum==256);
 stats={};Serial.out.clear();readError=1;loop();assert(Serial.out.find("\"valid\":false")!=std::string::npos && stats.count==0);
 readError=0;frameBytes=4;Serial.out.clear();loop();assert(Serial.out.find("\"valid\":false")!=std::string::npos);
 frameBytes=512;Serial.out.clear();clockMs=500;loop();assert(Serial.out.find("\"valid\":true,\"samples\":64")!=std::string::npos);
 assert(stats.count==0);initError=3;setup();assert(!ready&&rx==nullptr&&deleted==1);
 for(int p : {17,25,26,27})assert(modes[p]==0 && written[p]==0);
}
CPP
"${CXX:-g++}" -std=c++17 -Wall -Wextra -Werror -I "$bench_tmp" -I firmware/inmp441_bench "$bench_tmp/mic_sketch.cpp" -o "$bench_tmp/test"
"$bench_tmp/test"
for profile in DHT PIR BOTH; do
 "${CXX:-g++}" -std=c++17 -Wall -Wextra -Werror -DBENCH_${profile}_ONLY=1 -I "$bench_tmp" -I firmware/ambient_bench "$bench_tmp/ambient.cpp" -o "$bench_tmp/test"
 "$bench_tmp/test"
done
for entry in sound:sound_bench leds:status_led_bench mic:inmp441_bench; do
 "${CXX:-g++}" -std=c++17 -Wall -Wextra -Werror -I "$bench_tmp" -I "firmware/${entry#*:}" "$bench_tmp/${entry%%:*}.cpp" -o "$bench_tmp/test"
 "$bench_tmp/test"
done
printf '%s\n' 'PASS: isolated DHT/PIR/combined sketches, invalid readings/warmup/edges, ADC windows/clipping, LED commands/overflow, I2S left-slot/error/init guards and signed stats. Host stubs; no hardware.'
