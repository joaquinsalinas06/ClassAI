// Minimal ST7789 test only; does not replace Lando's mascot/assets/integration.
#include <Arduino.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <ClassAIBench.h>
constexpr uint8_t TFT_CS=5,TFT_DC=27,TFT_RST=26,TFT_SCLK=14,TFT_MOSI=23;
// Explicit software SPI prevents silently using another sketch's SPI pin assignment.
Adafruit_ST7789 screen(TFT_CS,TFT_DC,TFT_MOSI,TFT_SCLK,TFT_RST);
BenchControl control;bool initialized=false;uint8_t rotation=0;
void stopOutput(){if(initialized)screen.fillScreen(ST77XX_BLACK);}
void pattern(){
 screen.setRotation(rotation);const uint16_t colors[]={ST77XX_RED,ST77XX_GREEN,ST77XX_BLUE};
 for(int i=0;i<3;++i)screen.fillRect(i*80,0,80,200,colors[i]);screen.fillRect(0,200,240,40,ST77XX_BLACK);
 screen.drawRect(0,0,240,240,ST77XX_WHITE);screen.setCursor(8,210);screen.setTextSize(2);screen.setTextColor(ST77XX_WHITE);screen.print("ClassAI 240x240");
}
bool command(const char* text){
 if(strcmp(text,"arm")==0){if(!initialized){screen.init(240,240);initialized=true;}screen.fillScreen(ST77XX_BLACK);return true;}
 if(strcmp(text,"pattern")==0){pattern();return true;}
 if(strlen(text)==4&&strncmp(text,"rot",3)==0&&text[3]>='0'&&text[3]<='3'){rotation=text[3]-'0';pattern();return true;}
 return false;
}
void setup(){Serial.begin(115200);Serial.println("ST7789 test 240x240: SCLK14 MOSI23 CS5 DC27 RST26. Confirmar VCC/BL 3.3 V, RBL1k. arm, pattern, rot0..rot3, stop. Desarmado.");}
void loop(){control.poll(command,stopOutput);}
