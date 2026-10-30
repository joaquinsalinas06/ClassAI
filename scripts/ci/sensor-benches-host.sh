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
#include <vector>
constexpr int HIGH=1, LOW=0, OUTPUT=1, INPUT_PULLUP=2, INPUT=3, ADC_11db=3;
inline uint32_t clockMs=0, clockUs=0;
inline int modes[40]={}, written[40]={}, reads[40]={}, inputValue=0, adcValue=0;
inline uint32_t millis(){return clockMs;}
inline uint32_t micros(){return clockUs;}
inline void delay(unsigned ms){clockMs+=ms;clockUs+=1000*ms;}
inline unsigned fractionalUs=0;
inline void delayMicroseconds(unsigned us){clockUs+=us;fractionalUs+=us;clockMs+=fractionalUs/1000;fractionalUs%=1000;}
inline int digitalRead(unsigned pin){++reads[pin];return inputValue;}
inline std::vector<uint16_t> spiWords;
inline uint16_t spiWord=0;inline unsigned spiBits=0;
inline void digitalWrite(unsigned pin,int value){
 if(pin==27&&value==LOW){spiWord=0;spiBits=0;}
 if(pin==14&&value==HIGH&&written[27]==LOW){spiWord=static_cast<uint16_t>((spiWord<<1)|(written[13]?1:0));++spiBits;}
 if(pin==27&&value==HIGH&&spiBits==16){spiWords.push_back(spiWord);spiBits=0;}
 written[pin]=value;
}
inline bool pwmAttached=false;inline int pwmFrequency=0;
inline bool ledcAttach(int,int,int){pwmAttached=true;return true;}
inline void ledcDetach(int){pwmAttached=false;}
inline void ledcWriteTone(int,int f){pwmFrequency=f;}
inline void pinMode(unsigned pin,int mode){modes[pin]=mode;}
inline void analogReadResolution(int){}
inline void analogSetPinAttenuation(int,int){}
inline bool alternateAdc=false;
inline int analogRead(int pin){++reads[pin];return alternateAdc?(reads[pin]%2?1000:3000):adcValue;}
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
cat > "$bench_tmp/sound_capture.cpp" <<'CPP'
#include "sound_bench.ino"
int main(){
 setup();Serial.out.clear();alternateAdc=true;loop();
 assert(modes[34]==INPUT && clockMs==500 && reads[34]==2000);
 assert(Serial.out.find("\"min\":1000,\"max\":3000,\"mean\":2000,\"peak_to_peak\":2000,\"rail_samples\":0")!=std::string::npos);
 alternateAdc=false;adcValue=0;Serial.out.clear();loop();
 assert(Serial.out.find("\"min\":0,\"max\":0,\"mean\":0,\"peak_to_peak\":0,\"rail_samples\":2000")!=std::string::npos);
 adcValue=4095;Serial.out.clear();loop();
 assert(Serial.out.find("\"min\":4095,\"max\":4095,\"mean\":4095,\"peak_to_peak\":0,\"rail_samples\":2000")!=std::string::npos);
 clockMs=0xffffff00u;Serial.out.clear();loop();
 assert(clockMs==244 && Serial.out.find("\"samples\":2000")!=std::string::npos);
 for(int p : {17,25,26,27})assert(modes[p]==0);
}
CPP
"${CXX:-g++}" -std=c++17 -Wall -Wextra -Werror -DBENCH_CAPTURE_500MS=1 -I "$bench_tmp" -I firmware/sound_bench "$bench_tmp/sound_capture.cpp" -o "$bench_tmp/sound_capture"
"$bench_tmp/sound_capture"
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
constexpr int ESP_OK=0,I2S_NUM_AUTO=-1,I2S_ROLE_MASTER=1,I2S_DATA_BIT_WIDTH_16BIT=16,I2S_DATA_BIT_WIDTH_32BIT=32,I2S_SLOT_MODE_STEREO=2,I2S_GPIO_UNUSED=-1;
struct i2s_chan_config_t {};
struct i2s_std_config_t { struct Empty {} clk_cfg,slot_cfg;struct GPIO { int mclk,bclk,ws,dout,din; }gpio_cfg; };
#define I2S_CHANNEL_DEFAULT_CONFIG(a,b) {}
#define I2S_STD_CLK_DEFAULT_CONFIG(a) {}
#define I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(a,b) {}
inline int initError=0,readError=0,deleted=0;
inline size_t frameBytes=512;
inline int16_t sampleLeft=256,sampleRight=-32767;
inline esp_err_t i2s_new_channel(i2s_chan_config_t*,i2s_chan_handle_t* tx,i2s_chan_handle_t* rx){if(rx)*rx=reinterpret_cast<void*>(1);if(tx)*tx=reinterpret_cast<void*>(1);return initError;}
inline esp_err_t i2s_channel_init_std_mode(i2s_chan_handle_t,i2s_std_config_t* config){if(config->gpio_cfg.din!=I2S_GPIO_UNUSED)assert(config->gpio_cfg.bclk==26&&config->gpio_cfg.ws==25&&config->gpio_cfg.din==33);else assert(config->gpio_cfg.bclk==33&&config->gpio_cfg.ws==25&&config->gpio_cfg.dout==22);return 0;}
inline esp_err_t i2s_channel_enable(i2s_chan_handle_t){return 0;}
inline esp_err_t i2s_del_channel(i2s_chan_handle_t){++deleted;return 0;}
inline esp_err_t i2s_channel_read(i2s_chan_handle_t,void* out,size_t len,size_t* bytes,int timeout){
 assert(timeout==50);*bytes=frameBytes;
 auto words=static_cast<int32_t*>(out);for(size_t i=0;i<len/sizeof(int32_t);i+=2){words[i]=static_cast<int32_t>(sampleLeft)*256;words[i+1]=static_cast<int32_t>(sampleRight)*256;}
 return readError;
}
CPP
cat >> "$bench_tmp/driver/i2s_std.h" <<'CPP'
inline int writeError=0;inline bool shortWrite=false;
inline esp_err_t i2s_channel_write(i2s_chan_handle_t,const void* raw,size_t length,size_t* bytes,int timeout){
 assert(timeout==20);*bytes=shortWrite?length-2:length;auto frames=static_cast<const int16_t*>(raw);
 for(size_t i=0;i<length/sizeof(int16_t);i+=2){assert(frames[i]==frames[i+1]);assert(frames[i]>=-327&&frames[i]<=327);if(written[21]==LOW)assert(frames[i]==0);}
 return writeError;
}
CPP
cat > "$bench_tmp/Adafruit_GFX.h" <<'CPP'
#pragma once
CPP
cat > "$bench_tmp/Adafruit_ST7789.h" <<'CPP'
#pragma once
constexpr uint16_t ST77XX_BLACK=0,ST77XX_RED=1,ST77XX_GREEN=2,ST77XX_BLUE=3,ST77XX_WHITE=4;
inline int displayInits=0,displayPatterns=0,currentRotation=0;
class Adafruit_ST7789 {public:
 Adafruit_ST7789(int cs,int dc,int mosi,int clk,int rst){assert(cs==5&&dc==27&&mosi==23&&clk==14&&rst==26);}
 void init(int w,int h){assert(w==240&&h==240);++displayInits;}
 void fillScreen(int){} void setRotation(int r){currentRotation=r;}
 void fillRect(int,int,int,int,int){++displayPatterns;} void drawRect(int,int,int,int,int){}
 void setCursor(int,int){} void setTextSize(int){} void setTextColor(int){} void print(const char*){}
};
CPP
cat > "$bench_tmp/matrix.cpp" <<'CPP'
#include "matrix_bench.ino"
int main(){
 setup();assert(modes[13]==0&&modes[14]==0&&modes[27]==0);
 Serial.input="pattern\n";loop();assert(!control.armed&&spiWords.empty());
 Serial.input="arm\n";loop();assert(control.armed&&initialized);assert(spiWords[0]==0x0c00);
 assert(spiWords[1]==0x0f00&&spiWords[2]==0x0900&&spiWords[3]==0x0b07&&spiWords[4]==0x0a00);
 Serial.input="pattern\n";loop();assert(control.active&&spiWords.back()==0x0c01);
 clockMs=5000;loop();assert(!control.active&&spiWords.back()==0x0c00);
 Serial.input="scan\n";loop();assert(scanning&&cell==1);Serial.input="stop\n";loop();assert(!control.armed&&!scanning&&spiWords.back()==0x0c00);
 Serial.input="happy\n";spiWords.clear();loop();assert(!control.armed&&spiWords.size()==1&&spiWords.back()==0x0c00);
 const char* faces[]={"happy\n","sad\n","angry\n"};
 const uint8_t expected[3][8]={{0,0x66,0x66,0,0x42,0x24,0x18,0},{0,0x66,0x66,0,0x18,0x24,0x42,0},{0x42,0x24,0x66,0,0x3c,0x42,0,0}};
 for(unsigned face=0;face<3;++face){
  Serial.input="arm\n";loop();spiWords.clear();Serial.input=faces[face];loop();
  assert(control.active&&!scanning&&spiWords.size()==9);
  for(unsigned row=0;row<8;++row)assert(spiWords[row]==((row+1)<<8|expected[face][row]));
  clockMs+=5000;loop();assert(!control.active&&spiWords.back()==0x0c00);
 }
 const char* turns[]={"rotate0\n","rotate90\n","rotate180\n","rotate270\n"};
 const unsigned cornerRow[]={0,0,7,7},cornerValue[]={0x80,1,1,0x80};
 const uint8_t corner[8]={0x80,0,0,0,0,0,0,0};
 for(unsigned turn=0;turn<4;++turn){
  Serial.input=turns[turn];loop();assert(rotation==turn&&!control.active);
  spiWords.clear();showFace(corner);assert(spiWords.size()==9);
  for(unsigned row=0;row<8;++row)assert(spiWords[row]==((row+1)<<8|(row==cornerRow[turn]?cornerValue[turn]:0)));
 }
 Serial.input="stop\nrotate90\n";loop();assert(!control.armed&&!control.active&&rotation==3);
 Serial.input="arm\nrotate45\n";loop();assert(!control.armed&&!control.active);
}
CPP
cat > "$bench_tmp/buzzer.cpp" <<'CPP'
#include "buzzer_bench.ino"
int main(){
 setup();assert(written[17]==LOW);Serial.input="active\n";loop();assert(written[17]==LOW&&!control.armed);
 Serial.input="arm\nactive\n";loop();assert(control.active&&written[17]==HIGH);
 clockMs=119;loop();assert(written[17]==HIGH);clockMs=120;loop();assert(written[17]==LOW&&!control.active);
 Serial.input="passive\n";loop();assert(pwmAttached&&pwmFrequency==2000);Serial.input="stop\n";loop();assert(!pwmAttached&&written[17]==LOW&&!control.armed);
 Serial.input="arm\nxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n";loop();assert(!control.armed&&written[17]==LOW);
 clockMs=UINT32_MAX-50;Serial.input="arm\nactive\n";loop();clockMs=68;loop();assert(written[17]==HIGH);clockMs=69;loop();assert(written[17]==LOW);
}
CPP
cat > "$bench_tmp/fan.cpp" <<'CPP'
#include "relay_fan_bench.ino"
int main(){
 setup();assert(written[26]==RELAY_OFF);Serial.input="on\n";loop();assert(written[26]==RELAY_OFF);
 Serial.input="arm\non\n";loop();assert(written[26]==RELAY_ON&&control.active);
 clockMs=1999;loop();assert(written[26]==RELAY_ON);clockMs=2000;loop();assert(written[26]==RELAY_OFF);
 Serial.input="on\noff\n";loop();assert(written[26]==RELAY_OFF&&!control.active);
 Serial.input="on\ninvalid\n";loop();assert(written[26]==RELAY_OFF&&!control.armed);
 assert(modes[17]==0&&modes[25]==0&&modes[27]==0);
}
CPP
cat > "$bench_tmp/audio.cpp" <<'CPP'
#include "audio_output_bench.ino"
int main(){
 setup();assert(!ready&&written[21]==LOW);Serial.input="tone\n";loop();assert(!ready&&written[21]==LOW);
 Serial.input="arm\ntone\n";loop();assert(ready&&control.active&&written[21]==HIGH);
 clockMs=control.startedAt+299;loop();assert(written[21]==HIGH);clockMs=control.startedAt+300;loop();assert(written[21]==LOW&&!control.active);
 Serial.input="tone\n";writeError=1;loop();assert(!control.armed&&written[21]==LOW);
 writeError=0;shortWrite=true;Serial.input="arm\ntone\n";loop();assert(!control.armed&&written[21]==LOW);
}
CPP
cat > "$bench_tmp/display.cpp" <<'CPP'
#include "display_bench.ino"
int main(){
 setup();assert(displayInits==0);Serial.input="pattern\n";loop();assert(displayPatterns==0);
 Serial.input="arm\npattern\nrot3\n";loop();assert(displayInits==1&&displayPatterns>0&&currentRotation==3);
 Serial.input="stop\n";loop();assert(!control.armed);Serial.input="rot4\n";loop();assert(currentRotation==3);
 assert(modes[17]==0&&modes[21]==0);
}
CPP
for entry in matrix:matrix_bench buzzer:buzzer_bench fan:relay_fan_bench audio:audio_output_bench display:display_bench; do
 "${CXX:-g++}" -std=c++17 -Wall -Wextra -Werror -I "$bench_tmp" -I firmware/libraries/ClassAIBench/src -I "firmware/${entry#*:}" "$bench_tmp/${entry%%:*}.cpp" -o "$bench_tmp/test"
 "$bench_tmp/test"
done
"${CXX:-g++}" -std=c++17 -Wall -Wextra -Werror -DBENCH_RELAY_NPN_ONLY=1 -I "$bench_tmp" -I firmware/libraries/ClassAIBench/src -I firmware/relay_fan_bench "$bench_tmp/fan.cpp" -o "$bench_tmp/test"
"$bench_tmp/test"
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
printf '%s\n' 'PASS: isolated DHT/PIR/combined sketches, invalid readings/warmup/edges, ADC windows/clipping, LED commands/overflow, I2S guards/stats, arm/stop/overflow/wrap, MAX7219 packets, timed buzzer/fan/audio and display rotation. Host stubs; no hardware.'
