// REFERENCE MAX7219 + SN74AHCT125N at 5 V. Confirm module INPUT first.
#include <Arduino.h>
#include <ClassAIBench.h>
constexpr uint8_t MATRIX_DIN=13,MATRIX_CLK=14,MATRIX_CS=27;
BenchControl control;
bool initialized=false,scanning=false;
uint32_t scanAt=0;uint8_t cell=0;
void sendRegister(uint8_t reg,uint8_t value){
 digitalWrite(MATRIX_CS,LOW);
 for(int bit=15;bit>=0;--bit){digitalWrite(MATRIX_CLK,LOW);digitalWrite(MATRIX_DIN,((static_cast<uint16_t>(reg)<<8|value)>>bit)&1);digitalWrite(MATRIX_CLK,HIGH);}
 digitalWrite(MATRIX_CLK,LOW);digitalWrite(MATRIX_CS,HIGH);
}
void stopOutput(){scanning=false;if(initialized)sendRegister(0x0c,0);}
void clearRows(){for(uint8_t row=1;row<=8;++row)sendRegister(row,0);}
bool command(const char* text){
 if(strcmp(text,"arm")==0){
  digitalWrite(MATRIX_CS,HIGH);pinMode(MATRIX_CS,OUTPUT);digitalWrite(MATRIX_CLK,LOW);pinMode(MATRIX_CLK,OUTPUT);digitalWrite(MATRIX_DIN,LOW);pinMode(MATRIX_DIN,OUTPUT);initialized=true;
  sendRegister(0x0c,0);sendRegister(0x0f,0);sendRegister(0x09,0);sendRegister(0x0b,7);sendRegister(0x0a,0);clearRows();return true;
 }
 if(strcmp(text,"pattern")==0){scanning=false;clearRows();for(uint8_t row=1;row<=8;++row)sendRegister(row,static_cast<uint8_t>(1u<<(row-1)));sendRegister(0x0c,1);control.start(5000);return true;}
 if(strcmp(text,"scan")==0){clearRows();scanning=true;cell=0;scanAt=millis()-100;sendRegister(0x0c,1);control.start(7000);return true;}
 return false;
}
void setup(){Serial.begin(115200);Serial.println("MAX7219 referencia DIN13 CLK14 CS27; AHCT y fuente 5 V obligatorios. arm, pattern, scan, stop. Sin salidas al boot.");}
void loop(){control.poll(command,stopOutput);control.tick(stopOutput);if(control.active&&scanning&&millis()-scanAt>=100){scanAt=millis();clearRows();sendRegister(cell/8+1,static_cast<uint8_t>(1u<<(cell%8)));cell=(cell+1)%64;}}
