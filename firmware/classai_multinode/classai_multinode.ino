// One firmware with three mutually exclusive roles. Never uploads automatically.
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <ClassAIMultinode.h>
#include <time.h>
#include "secrets.h"
#ifndef CLASSAI_ROLE
#error "Compile with CLASSAI_ROLE=1 (access), 2 (environment) or 3 (assistant)"
#endif
static_assert(CLASSAI_ROLE>=1&&CLASSAI_ROLE<=3,"invalid role");
#if !MQTT_TLS && !defined(CLASSAI_LOCAL_TEST)
#error "Plain MQTT is restricted to explicit CLASSAI_LOCAL_TEST builds"
#endif
#if CLASSAI_ROLE == 2
#include <DHT.h>
DHT dht(4,DHT11);
#endif
#if CLASSAI_ROLE == 3
#include <driver/i2s_std.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
SPIClass displaySpi(HSPI);
Adafruit_ST7789 screen(&displaySpi,5,27,26);
i2s_chan_handle_t microphone=nullptr,speaker=nullptr;
QueueHandle_t playbackQueue=nullptr;
struct Playback { uint16_t size; uint8_t pcm[1280]; };
volatile bool voiceError=true;
uint32_t agentAt=0,frameSequence=0;
char voiceState[20]="sin agente";
#endif
const char* ROLE=CLASSAI_ROLE==1?"access":CLASSAI_ROLE==2?"environment":"assistant";
char device[65],prefix[96],nodePrefix[150],sessionId[96]="";
#if MQTT_TLS
WiFiClientSecure transport;
#else
WiFiClient transport;
#endif
PubSubClient mqtt(transport);
Preferences prefs;
SemaphoreHandle_t stateLock;
QueueHandle_t telemetryQueue;
struct Telemetry { char json[900]; };
ComfortParams params=comfortDefaults();
volatile bool networkUp=false;
uint32_t bootCount=0,eventSequence=0,sessionRevision=0;
bool filesystemReady=false,fanOn=false,motionSeen=false;
char feedbackEventId[120]="";
volatile bool armed=false;
volatile int displayComfort=-1;
uint32_t displayAt=0;
String pendingCommand;
uint32_t lastSample=0,feedbackAt=0,fanChangedAt=0;
int feedback=0; // 1=pending, 2=stored/accepted, 3=rejected/local failure.
char pendingRequest[120]="";
uint32_t requestAt=0;
const int RELAY_OFF_LEVEL=RELAY_ON_LEVEL==LOW?HIGH:LOW;
void lock(){xSemaphoreTake(stateLock,portMAX_DELAY);}
void unlock(){xSemaphoreGive(stateLock);}
void common(JsonDocument& doc){
 doc["v"]=1;doc["room"]=ROOM_ID;doc["device"]=device;doc["role"]=ROLE;
 doc["uptime_ms"]=millis();
 time_t now=time(nullptr);
 if(now>1700000000){char timestamp[24];struct tm tm;gmtime_r(&now,&tm);strftime(timestamp,sizeof(timestamp),"%Y-%m-%dT%H:%M:%SZ",&tm);doc["ts"]=timestamp;}else doc["ts"]=nullptr;
 doc["session_id"]=sessionId[0]?sessionId:nullptr;
}
void publishDoc(const char* suffix,JsonDocument& doc,bool retained=false){
 char topic[190],body[1200];snprintf(topic,sizeof(topic),"%s/%s",nodePrefix,suffix);
 size_t n=serializeJson(doc,body,sizeof(body));if(n<sizeof(body))mqtt.publish(topic,reinterpret_cast<uint8_t*>(body),n,retained);
}
bool saveEvent(JsonDocument& doc){
 if(!filesystemReady)return false;
 for(unsigned slot=0;slot<64;++slot){
  char path[24];snprintf(path,sizeof(path),"/event-%02u.json",slot);
  if(LittleFS.exists(path))continue;
  File file=LittleFS.open("/pending.tmp","w");if(!file)return false;
  const size_t expected=measureJson(doc),written=serializeJson(doc,file);file.flush();file.close();
  if(written!=expected)return false;
  return LittleFS.rename("/pending.tmp",path);
 }
 return false; // Never evict an unacknowledged event.
}
void acknowledge(JsonDocument& ack){
 if(strcmp(ack["room"]|"",ROOM_ID)||strcmp(ack["device"]|"",device)||ack["v"]!=1)return;
 if(ack["stored"]!=true)return;
 if(pendingRequest[0]&&strcmp(ack["request_id"]|"",pendingRequest)==0){pendingRequest[0]=0;pendingCommand="";}
 const char* id=ack["event_id"]|"";
 if(!*id||!filesystemReady)return;
 for(unsigned slot=0;slot<64;++slot){
  char path[24];snprintf(path,sizeof(path),"/event-%02u.json",slot);
  File file=LittleFS.open(path,"r");if(!file)continue;
  JsonDocument event;auto error=deserializeJson(event,file);file.close();
  if(!error&&strcmp(event["event_id"]|"",id)==0){
   if(LittleFS.remove(path)&&!strcmp(id,feedbackEventId)){feedback=ack["accepted"]==true?2:3;feedbackAt=millis();}
   break;
  }
 }
}
bool config(JsonDocument& doc){
 if(doc["v"]!=1||strcmp(doc["room"]|"",ROOM_ID)||!doc["params_version"].is<int>())return false;
 ComfortParams p=params;
 const char* ranges[]={"temp_c","rh_pct","lux"};float* lows[]={&p.tempMin,&p.rhMin,&p.luxMin};float* highs[]={&p.tempMax,&p.rhMax,&p.luxMax};
 for(unsigned i=0;i<3;++i){auto range=doc[ranges[i]].as<JsonArray>();if(range.size()!=2||!range[0].is<float>()||!range[1].is<float>())return false;*lows[i]=range[0];*highs[i]=range[1];if(!isfinite(*lows[i])||!isfinite(*highs[i])||*lows[i]>=*highs[i])return false;}
 const char* names[]={"temp","rh","lux","noise"};float* weights[]={&p.wTemp,&p.wRh,&p.wLux,&p.wNoise};float sum=0;
 for(unsigned i=0;i<4;++i){auto w=doc["weights"][names[i]];if(!w.is<float>()||!isfinite(w.as<float>())||w.as<float>()<0)return false;*weights[i]=w;sum+=*weights[i];}
 if(fabsf(sum-1)>0.02f||!doc["noise_rel_max"].is<float>()||!doc["ok_min"].is<int>()||!doc["regular_min"].is<int>())return false;
 p.noiseRelMax=doc["noise_rel_max"];p.okMin=doc["ok_min"];p.regularMin=doc["regular_min"];p.paramsVersion=doc["params_version"];
 if(!isfinite(p.noiseRelMax)||p.noiseRelMax<=0||p.noiseRelMax>1||p.regularMin<0||p.okMin<p.regularMin||p.okMin>100||p.paramsVersion<params.paramsVersion)return false;
 params=p;return true;
}
void receive(char* topic,byte* payload,unsigned length){
 JsonDocument doc;if(deserializeJson(doc,payload,length))return;
 char expected[190];lock();
 snprintf(expected,sizeof(expected),"%s/session",prefix);
 if(strcmp(topic,expected)==0&&doc["v"]==1&&!strcmp(doc["room"]|"",ROOM_ID)&&doc["revision"].is<uint32_t>()){
  uint32_t revision=doc["revision"];const char* sid=doc["session_id"]|"";
  if(revision>=sessionRevision&&strlen(sid)<sizeof(sessionId)){
   sessionRevision=revision;strlcpy(sessionId,sid,sizeof(sessionId));prefs.putString("session",sessionId);prefs.putUInt("revision",revision);
  }
 }
 snprintf(expected,sizeof(expected),"%s/ack",nodePrefix);if(strcmp(topic,expected)==0)acknowledge(doc);
 snprintf(expected,sizeof(expected),"%s/config",prefix);
 if(strcmp(topic,expected)==0&&config(doc)){String saved;serializeJson(doc,saved);prefs.putString("config",saved);}
#if CLASSAI_ROLE == 1
 snprintf(expected,sizeof(expected),"%s/nodes/%s-environment/snapshot",prefix,ROOM_ID);
 if(!strcmp(topic,expected)){displayComfort=doc["status"]=="online"?(doc["telemetry"]["comfort"]|-1):-1;displayAt=millis();}
#endif
 unlock();
}
void networkTask(void*){
 uint32_t nextAttempt=0,lastRetry=0;unsigned backoff=1000;
 for(;;){
  const uint32_t now=millis();
  if(WiFi.status()!=WL_CONNECTED){networkUp=false;if(multinode::elapsed(now,nextAttempt,10000)){WiFi.begin(WIFI_SSID,WIFI_PASSWORD);nextAttempt=now;}vTaskDelay(pdMS_TO_TICKS(20));continue;}
  if(!mqtt.connected()){
   networkUp=false;
   if(!multinode::elapsed(now,nextAttempt,backoff)){vTaskDelay(pdMS_TO_TICKS(20));continue;}nextAttempt=now;
   char willTopic[180],will[250];snprintf(willTopic,sizeof(willTopic),"%s/status",nodePrefix);
   snprintf(will,sizeof(will),"{\"v\":1,\"room\":\"%s\",\"device\":\"%s\",\"role\":\"%s\",\"status\":\"offline\"}",ROOM_ID,device,ROLE);
   if(!mqtt.connect(device,MQTT_USER,MQTT_PASSWORD,willTopic,1,true,will)){backoff=min(backoff*2,60000u);continue;}
   backoff=1000;
   char topic[190];snprintf(topic,sizeof(topic),"%s/session",prefix);mqtt.subscribe(topic,1);
   snprintf(topic,sizeof(topic),"%s/config",prefix);mqtt.subscribe(topic,1);
   snprintf(topic,sizeof(topic),"%s/ack",nodePrefix);mqtt.subscribe(topic,1);
#if CLASSAI_ROLE == 1
   snprintf(topic,sizeof(topic),"%s/nodes/%s-environment/snapshot",prefix,ROOM_ID);mqtt.subscribe(topic,1);
#endif
   JsonDocument status;lock();common(status);unlock();status["status"]="online";publishDoc("status",status,true);
  }
  networkUp=true;mqtt.loop();
  Telemetry frame;if(xQueueReceive(telemetryQueue,&frame,0)==pdTRUE){char topic[180];snprintf(topic,sizeof(topic),"%s/telemetry",nodePrefix);mqtt.publish(topic,frame.json);}
  if(multinode::elapsed(now,lastRetry,3000)){
   lastRetry=now;String queued;lock();
   if(filesystemReady)for(unsigned slot=0;slot<64;++slot){
    char path[24];snprintf(path,sizeof(path),"/event-%02u.json",slot);File file=LittleFS.open(path,"r");if(!file)continue;
    queued=file.readString();file.close();break;
   }
   unlock();
   if(queued.length()){JsonDocument event;if(!deserializeJson(event,queued))publishDoc("events",event);}
   lock();
   if(pendingRequest[0]){
    if(multinode::elapsed(now,requestAt,10000)){pendingRequest[0]=0;feedback=3;feedbackAt=now;}
    else {JsonDocument command;if(!deserializeJson(command,pendingCommand))publishDoc("commands",command);}
   }
   unlock();
  }
  vTaskDelay(pdMS_TO_TICKS(5));
 }
}
#if CLASSAI_ROLE == 1
void matrixRegister(uint8_t reg,uint8_t value){
 digitalWrite(27,LOW);for(int bit=15;bit>=0;--bit){digitalWrite(14,LOW);digitalWrite(13,((uint16_t(reg)<<8|value)>>bit)&1);digitalWrite(14,HIGH);}digitalWrite(14,LOW);digitalWrite(27,HIGH);
}
void accessFeedback(){
 const bool showing=feedback&&uint32_t(millis()-feedbackAt)<2000;
 digitalWrite(25,showing&&feedback==2);
 if(armed&&BUZZER_VALIDATED){
  const bool sound=showing&&feedback==2&&uint32_t(millis()-feedbackAt)<120;
#if BUZZER_PASSIVE
  ledcWriteTone(17,sound?2000:0);
#else
  digitalWrite(17,sound?HIGH:LOW);
#endif
 }
 if(armed&&MATRIX_VALIDATED){
  static int shown=-100;int value=showing?feedback:10+(displayComfort>=80?2:1);
  if(!showing&&(displayComfort<0||multinode::elapsed(millis(),displayAt,15000))){matrixRegister(0x0c,0);shown=-100;return;}
  if(value==shown)return;shown=value;
  const uint8_t happy[]={0,0x66,0x66,0,0x42,0x24,0x18,0},sad[]={0,0x66,0x66,0,0x18,0x24,0x42,0};
  for(unsigned row=0;row<8;++row)matrixRegister(row+1,value==1?uint8_t(1u<<row):(value==2||value==12?happy[row]:sad[row]));
  matrixRegister(0x0c,1);
 }
}
void pollAccess(){
 static bool ready=nfcBegin();static uint32_t polled=0;
 if(ready&&multinode::elapsed(millis(),polled,60)){
  polled=millis();NfcCredential credential;
  if(nfcPoll(credential)){
   lock();JsonDocument event;common(event);
   bool saved=false;
   if(sessionId[0]){
    char id[120];snprintf(id,sizeof(id),"%s-%lu-%lu",device,(unsigned long)bootCount,(unsigned long)++eventSequence);
    strlcpy(feedbackEventId,id,sizeof(feedbackEventId));event["event"]="ATTENDANCE_RECORDED";event["event_id"]=id;event["credential"]["type"]=credential.type;event["credential"]["token"]=credential.token;
    saved=saveEvent(event);
   }
   feedback=saved?1:3;feedbackAt=millis();unlock();
  }
 }
 static int previous=HIGH,stable=HIGH;static uint32_t changed=0;
 int value=digitalRead(32);if(value!=previous){previous=value;changed=millis();}
 if(value!=stable&&multinode::elapsed(millis(),changed,50)){
  stable=value;if(value==LOW){lock();if(networkUp&&!pendingRequest[0]){snprintf(pendingRequest,sizeof(pendingRequest),"%s-%lu-r%lu",device,(unsigned long)bootCount,(unsigned long)++eventSequence);requestAt=millis();JsonDocument command;common(command);command["request_id"]=pendingRequest;command["action"]=sessionId[0]?"stop":"start";pendingCommand="";serializeJson(command,pendingCommand);}else {feedback=3;feedbackAt=millis();}unlock();}
 }
 accessFeedback();
}
#endif
#if CLASSAI_ROLE == 3
bool initAudio(){
 i2s_chan_config_t channel=I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0,I2S_ROLE_MASTER);
 if(i2s_new_channel(&channel,nullptr,&microphone)!=ESP_OK)return false;
 i2s_std_config_t rx={};rx.clk_cfg=I2S_STD_CLK_DEFAULT_CONFIG(16000);rx.slot_cfg=I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT,I2S_SLOT_MODE_STEREO);
 rx.gpio_cfg.mclk=I2S_GPIO_UNUSED;rx.gpio_cfg.bclk=GPIO_NUM_18;rx.gpio_cfg.ws=GPIO_NUM_19;rx.gpio_cfg.dout=I2S_GPIO_UNUSED;rx.gpio_cfg.din=GPIO_NUM_34;
 if(i2s_channel_init_std_mode(microphone,&rx)!=ESP_OK||i2s_channel_enable(microphone)!=ESP_OK)return false;
 channel=I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1,I2S_ROLE_MASTER);
 if(i2s_new_channel(&channel,&speaker,nullptr)!=ESP_OK)return false;
 i2s_std_config_t tx={};tx.clk_cfg=I2S_STD_CLK_DEFAULT_CONFIG(32000);tx.slot_cfg=I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT,I2S_SLOT_MODE_STEREO);
 tx.gpio_cfg.mclk=I2S_GPIO_UNUSED;tx.gpio_cfg.bclk=GPIO_NUM_33;tx.gpio_cfg.ws=GPIO_NUM_25;tx.gpio_cfg.dout=GPIO_NUM_22;tx.gpio_cfg.din=I2S_GPIO_UNUSED;
 return i2s_channel_init_std_mode(speaker,&tx)==ESP_OK&&i2s_channel_enable(speaker)==ESP_OK;
}
void sendAudio(const uint8_t* pcm,uint16_t size){
 uint8_t frame[656]={'C','A',1,1};frame[4]=size&255;frame[5]=size>>8;memcpy(frame+6,&frameSequence,4);++frameSequence;
 memcpy(frame+10,pcm,size);const uint32_t crc=multinode::crc32(frame+2,8+size);memcpy(frame+10+size,&crc,4);Serial.write(frame,size+14);
}
void captureTask(void*){
 int32_t slots[640];int16_t mono[320];
 for(;;){size_t bytes=0;
  if(i2s_channel_read(microphone,slots,sizeof(slots),&bytes,30)==ESP_OK&&bytes==sizeof(slots)){
   for(unsigned i=0;i<320;++i)mono[i]=int16_t(slots[2*i]>>16);
   sendAudio(reinterpret_cast<uint8_t*>(mono),sizeof(mono));
  }else {voiceError=true;vTaskDelay(pdMS_TO_TICKS(10));}
 }
}
void playbackTask(void*){
 Playback chunk;int32_t stereo[1280];
 for(;;){
  if(xQueueReceive(playbackQueue,&chunk,pdMS_TO_TICKS(100))!=pdTRUE){digitalWrite(21,LOW);continue;}
  if(!AMPLIFIER_VALIDATED||!armed||!networkUp||multinode::elapsed(millis(),agentAt,1500)){digitalWrite(21,LOW);continue;}
  for(unsigned i=0;i<chunk.size/2;++i){int16_t sample;memcpy(&sample,chunk.pcm+2*i,2);sample=int16_t(sample/8);stereo[2*i]=stereo[2*i+1]=int32_t(sample)*65536;}
  digitalWrite(21,HIGH);size_t written=0;
  const size_t expected=chunk.size*4;
  if(i2s_channel_write(speaker,stereo,expected,&written,50)!=ESP_OK||written!=expected){digitalWrite(21,LOW);voiceError=true;}
 }
}
void pollSerialAudio(){
 static uint8_t buffer[4096];static size_t used=0;
 while(Serial.available()&&used<sizeof(buffer))buffer[used++]=Serial.read();
 while(used>=14){
  if(buffer[0]!='C'||buffer[1]!='A'||buffer[2]!=1){memmove(buffer,buffer+1,--used);continue;}
  const unsigned size=buffer[4]|unsigned(buffer[5])<<8;
  if(size>1280){memmove(buffer,buffer+1,--used);continue;}
  if(used<size+14)break;
  uint32_t crc;memcpy(&crc,buffer+10+size,4);
  if(crc==multinode::crc32(buffer+2,size+8)){
   agentAt=millis();voiceError=false;
   if(buffer[3]==2&&size%2==0){Playback frame;frame.size=size;memcpy(frame.pcm,buffer+10,size);if(xQueueSend(playbackQueue,&frame,0)!=pdTRUE){voiceError=true;digitalWrite(21,LOW);}}
   if(buffer[3]==3&&size<sizeof(voiceState)){memcpy(voiceState,buffer+10,size);voiceState[size]=0;}
   if(buffer[3]==5){armed=false;digitalWrite(21,LOW);xQueueReset(playbackQueue);}
   if(buffer[3]==6){armed=true;}
  }
  memmove(buffer,buffer+size+14,used-size-14);used-=size+14;
 }
 if(used==sizeof(buffer))used=0;
}
#endif
void disarm(){
 armed=false;
#if CLASSAI_ROLE == 1
 if(MATRIX_VALIDATED)matrixRegister(0x0c,0);
 if(BUZZER_VALIDATED){
#if BUZZER_PASSIVE
 ledcWriteTone(17,0);
#endif
 digitalWrite(17,LOW);}
#elif CLASSAI_ROLE == 2
 if(RELAY_VALIDATED)digitalWrite(26,RELAY_OFF_LEVEL);fanOn=false;
#else
 digitalWrite(21,LOW);
#endif
}
void hardwareSetup(){
#if CLASSAI_ROLE == 1
 pinMode(32,INPUT_PULLUP);pinMode(35,INPUT);digitalWrite(25,LOW);pinMode(25,OUTPUT);
 if(MATRIX_VALIDATED){digitalWrite(27,HIGH);pinMode(27,OUTPUT);pinMode(14,OUTPUT);pinMode(13,OUTPUT);matrixRegister(0x0c,0);}
 if(BUZZER_VALIDATED){digitalWrite(17,LOW);pinMode(17,OUTPUT);
#if BUZZER_PASSIVE
 ledcAttach(17,2000,8);
#endif
 }
#elif CLASSAI_ROLE == 2
 dht.begin();pinMode(27,INPUT);pinMode(34,INPUT);pinMode(35,INPUT);analogReadResolution(12);
 for(int pin:{18,19,23}){digitalWrite(pin,LOW);pinMode(pin,OUTPUT);}
 if(RELAY_VALIDATED){digitalWrite(26,RELAY_OFF_LEVEL);pinMode(26,OUTPUT);}
#else
 pinMode(35,INPUT);digitalWrite(21,LOW);pinMode(21,OUTPUT);
 displaySpi.begin(14,-1,23,5);screen.init(240,240);screen.fillScreen(ST77XX_BLACK);screen.setTextColor(ST77XX_WHITE);screen.setTextSize(2);
 playbackQueue=xQueueCreate(8,sizeof(Playback));
 if(playbackQueue&&initAudio()){xTaskCreate(captureTask,"capture",6144,nullptr,3,nullptr);xTaskCreate(playbackTask,"playback",8192,nullptr,3,nullptr);}
#endif
}
void sample(){
 JsonDocument doc;lock();common(doc);ComfortParams p=params;unlock();
 doc["lux"]=nullptr;doc["comfort"]=nullptr;doc["state"]="REGULAR";doc["params_version"]=p.paramsVersion;
#if CLASSAI_ROLE == 1
 if(millis()>=60000)doc["presence"]=motionSeen;else doc["presence"]=nullptr;
#else
 doc["light_rel"]=analogRead(35)/4095.0;
#if CLASSAI_ROLE == 2
 const float temperature=dht.readTemperature(),humidity=dht.readHumidity();
 static unsigned low=4095,high=0;
 // ADC windows are collected incrementally in loop(), not by blocking MQTT/audio.
 extern unsigned noiseMinimum,noiseMaximum,noiseCount;
 low=noiseMinimum;high=noiseMaximum;const bool valid=noiseCount>1;noiseMinimum=4095;noiseMaximum=0;noiseCount=0;
 const float noise=valid?float(high-low)/4095.0f:NAN;
 const int comfort=comfortIndex(p,temperature,humidity,NAN,noise);
 if(isfinite(temperature))doc["temp_c"]=temperature;else doc["temp_c"]=nullptr;
 if(isfinite(humidity))doc["rh_pct"]=humidity;else doc["rh_pct"]=nullptr;
 if(isfinite(noise))doc["noise_rel"]=noise;else doc["noise_rel"]=nullptr;
 if(comfort>=0)doc["comfort"]=comfort;doc["state"]=comfortState(p,comfort);
 if(millis()>=60000)doc["presence"]=motionSeen;else doc["presence"]=nullptr;
 bool desired=multinode::fanDesired(fanOn,temperature,comfort,p.tempMax,p.okMin,p.regularMin);
 if(!isfinite(temperature)||!armed||!RELAY_VALIDATED||(desired!=fanOn&&multinode::elapsed(millis(),fanChangedAt,60000))){
  fanOn=armed&&RELAY_VALIDATED&&desired&&isfinite(temperature);fanChangedAt=millis();if(RELAY_VALIDATED)digitalWrite(26,fanOn?RELAY_ON_LEVEL:RELAY_OFF_LEVEL);
 }
 doc["fan_on"]=fanOn;doc["fan_enabled"]=bool(RELAY_VALIDATED&&armed);
 digitalWrite(18,comfort>=p.okMin);digitalWrite(19,comfort>=p.regularMin&&comfort<p.okMin);digitalWrite(23,comfort>=0&&comfort<p.regularMin);
#else
 doc["agent_online"]=!multinode::elapsed(millis(),agentAt,1500);doc["voice_state"]=voiceState;doc["audio_error"]=voiceError;
#endif
#endif
 motionSeen=false;
 Telemetry frame;serializeJson(doc,frame.json,sizeof(frame.json));xQueueOverwrite(telemetryQueue,&frame);
}
#if CLASSAI_ROLE == 2
unsigned noiseMinimum=4095,noiseMaximum=0,noiseCount=0;
#endif
void setup(){
#if CLASSAI_ROLE == 3
 Serial.setRxBufferSize(8192);Serial.begin(921600);
#else
 Serial.begin(115200);
#endif
 stateLock=xSemaphoreCreateMutex();telemetryQueue=xQueueCreate(1,sizeof(Telemetry));
 prefs.begin("classai-three",false);bootCount=prefs.getUInt("boot",0)+1;
 if(prefs.putUInt("boot",bootCount)!=sizeof(uint32_t))for(;;)delay(1000);
 snprintf(device,sizeof(device),"%s-%s",ROOM_ID,ROLE);snprintf(prefix,sizeof(prefix),"classai/v1/%s",ROOM_ID);snprintf(nodePrefix,sizeof(nodePrefix),"%s/nodes/%s",prefix,device);
 prefs.getString("session",sessionId,sizeof(sessionId));sessionRevision=prefs.getUInt("revision",0);
 JsonDocument saved;String json=prefs.getString("config","");if(!deserializeJson(saved,json))config(saved);
 filesystemReady=LittleFS.begin(false);hardwareSetup();
 WiFi.mode(WIFI_STA);WiFi.begin(WIFI_SSID,WIFI_PASSWORD);configTime(0,0,"pool.ntp.org");
#if MQTT_TLS
 transport.setCACert(MQTT_ROOT_CA);transport.setTimeout(5);transport.setHandshakeTimeout(5);
#endif
 mqtt.setServer(MQTT_HOST,MQTT_PORT);mqtt.setCallback(receive);mqtt.setBufferSize(1536);mqtt.setSocketTimeout(2);
 xTaskCreate(networkTask,"mqtt",8192,nullptr,1,nullptr);
}
void loop(){
#if CLASSAI_ROLE == 1
 if(millis()>=60000&&digitalRead(35)==HIGH)motionSeen=true;
 pollAccess();
#elif CLASSAI_ROLE == 2
 if(millis()>=60000&&digitalRead(27)==HIGH)motionSeen=true;
 static uint32_t sampled=0;if(multinode::elapsed(micros(),sampled,300)){sampled=micros();unsigned value=analogRead(34);noiseMinimum=min(noiseMinimum,value);noiseMaximum=max(noiseMaximum,value);++noiseCount;}
#else
 pollSerialAudio();
 if(multinode::elapsed(millis(),agentAt,1500)){voiceError=true;disarm();strlcpy(voiceState,"sin agente",sizeof(voiceState));}
 if(!networkUp){disarm();if(playbackQueue)xQueueReset(playbackQueue);strlcpy(voiceState,"sin red",sizeof(voiceState));}
 static uint32_t drawn=0;if(multinode::elapsed(millis(),drawn,500)){
  drawn=millis();
  // Clawd geometry from prototipo/mascota_claude_basica, drawn without a full framebuffer.
  const int x=40,y=85,s=10;const uint16_t orange=0xDBAA;
  screen.fillRect(24,80,192,144,ST77XX_WHITE);
  screen.fillRect(x+3*s,y+s,10*s,3*s,orange);screen.fillRect(x+2*s,y+3*s,12*s,6*s,orange);
  screen.fillRect(x,y+4*s,2*s,3*s,orange);
  const bool talking=!strcmp(voiceState,"speaking");
  screen.fillRect(x+14*s,y+(talking?1:4)*s,2*s,3*s,orange);
  for(int leg=0;leg<4;++leg)screen.fillRect(x+(3+leg*3)*s,y+9*s,2*s,3*s,orange);
  const bool blink=(millis()/500)%8==0;
  for(int eye:{5,10})screen.fillRect(x+eye*s,y+3*s,s,blink?2:s,ST77XX_BLACK);
  screen.fillRect(0,0,240,80,ST77XX_BLACK);screen.setCursor(8,8);screen.print("ClassAI");screen.setCursor(8,35);screen.print(voiceState);screen.setCursor(8,60);screen.print(networkUp?"MQTT online":"MQTT offline");
 }
#endif
#if CLASSAI_ROLE != 3
 static char command[32];static unsigned used=0;static bool overflow=false;
 while(Serial.available()){
  char ch=Serial.read();if(ch=='\r')continue;
  if(ch!='\n'){if(used+1<sizeof(command))command[used++]=ch;else {overflow=true;disarm();}continue;}
  command[used]=0;used=0;
  if(overflow){overflow=false;disarm();continue;}
  if(!strcmp(command,"arm")){
   armed=true;
#if CLASSAI_ROLE == 1
   if(MATRIX_VALIDATED){matrixRegister(0x0f,0);matrixRegister(0x09,0);matrixRegister(0x0b,7);matrixRegister(0x0a,0);}
#endif
  }else if(!strcmp(command,"format-outbox")&&!filesystemReady){lock();filesystemReady=LittleFS.format()&&LittleFS.begin(false);unlock();}
  else disarm();
 }
#endif
 if(multinode::elapsed(millis(),lastSample,5000)){lastSample=millis();sample();}
 delay(1);
}
