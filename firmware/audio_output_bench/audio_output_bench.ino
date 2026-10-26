// D-08 MAX98357A + one D-09. Validate USB/VIN supply per guide; SPK+/- never ground.
#include <Arduino.h>
#include <driver/i2s_std.h>
#include <ClassAIBench.h>
constexpr int AUDIO_BCLK=33,AUDIO_WS=25,AUDIO_DIN=22,AUDIO_SD=21;
constexpr uint32_t AUDIO_RATE=16000;
BenchControl control;i2s_chan_handle_t tx=nullptr;bool ready=false;uint32_t phase=0;
void stopOutput(){digitalWrite(AUDIO_SD,LOW);}
bool initTx(){
 if(ready)return true;
 i2s_chan_config_t channel=I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_AUTO,I2S_ROLE_MASTER);
 esp_err_t error=i2s_new_channel(&channel,&tx,nullptr);
 if(error==ESP_OK){
  i2s_std_config_t config={};config.clk_cfg=I2S_STD_CLK_DEFAULT_CONFIG(AUDIO_RATE);config.slot_cfg=I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT,I2S_SLOT_MODE_STEREO);
  config.gpio_cfg.mclk=I2S_GPIO_UNUSED;config.gpio_cfg.bclk=static_cast<gpio_num_t>(AUDIO_BCLK);config.gpio_cfg.ws=static_cast<gpio_num_t>(AUDIO_WS);config.gpio_cfg.dout=static_cast<gpio_num_t>(AUDIO_DIN);config.gpio_cfg.din=I2S_GPIO_UNUSED;
  error=i2s_channel_init_std_mode(tx,&config);if(error==ESP_OK)error=i2s_channel_enable(tx);
 }
 ready=error==ESP_OK;if(!ready&&tx){i2s_del_channel(tx);tx=nullptr;}
 Serial.printf("I2S TX init=%d\n",error);return ready;
}
bool command(const char* text){
 if(strcmp(text,"arm")==0)return initTx();
 if(strcmp(text,"tone")==0){phase=0;digitalWrite(AUDIO_SD,HIGH);control.start(300);return true;}
 return false;
}
void setup(){digitalWrite(AUDIO_SD,LOW);pinMode(AUDIO_SD,OUTPUT);Serial.begin(115200);Serial.println("MAX98357A BCLK33 WS25 DIN22 SD21; tono 440 Hz/300 ms al 1% digital. Validar alimentacion USB/VIN segun guia. arm, tone, stop. SD LOW al boot.");}
void loop(){
 control.poll(command,stopOutput);control.tick(stopOutput);
 if(!ready){delay(1);return;}
 int16_t frames[128]={};
 if(control.active)for(size_t i=0;i<128;i+=2){phase=(phase+440)%AUDIO_RATE;const int16_t value=phase<AUDIO_RATE/2?327:-327;frames[i]=value;frames[i+1]=value;}
 size_t written=0;const esp_err_t error=i2s_channel_write(tx,frames,sizeof(frames),&written,20);
 if(error!=ESP_OK||written!=sizeof(frames)){stopOutput();control.armed=false;control.active=false;Serial.printf("I2S TX error=%d bytes=%u; desarmado\n",error,static_cast<unsigned>(written));delay(20);}
}
