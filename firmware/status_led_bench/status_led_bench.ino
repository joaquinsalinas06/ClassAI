#include <Arduino.h>
#include <cstring>
constexpr uint8_t LED_RED=25, LED_YELLOW=26, LED_GREEN=27;
char command[12]; size_t used=0; bool overflow=false;
void setLed(int pin) {
  digitalWrite(LED_RED, pin==LED_RED?HIGH:LOW);
  digitalWrite(LED_YELLOW, pin==LED_YELLOW?HIGH:LOW);
  digitalWrite(LED_GREEN, pin==LED_GREEN?HIGH:LOW);
}
void setup() {
  Serial.begin(115200);
  for(const auto pin : {LED_RED,LED_YELLOW,LED_GREEN}) { digitalWrite(pin,LOW); pinMode(pin,OUTPUT); }
  Serial.println("LEDs 25/26/27, cada uno con 1kΩ. Serial: red/yellow/green/off + Enter; sin otros actuadores.");
}
void loop() {
  while(Serial.available()) {
    const char ch = static_cast<char>(Serial.read());
    if(ch=='\r') continue;
    if(ch!='\n') { if(used+1<sizeof(command))command[used++]=ch;else overflow=true; continue; }
    command[used]='\0';
    if(!overflow && strcmp(command,"red")==0)setLed(LED_RED);
    else if(!overflow && strcmp(command,"yellow")==0)setLed(LED_YELLOW);
    else if(!overflow && strcmp(command,"green")==0)setLed(LED_GREEN);
    else if(!overflow && strcmp(command,"off")==0)setLed(-1);
    else { setLed(-1); Serial.println("Comando invalido; LEDs apagados. red/yellow/green/off"); }
    used=0; overflow=false;
  }
}
