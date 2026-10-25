#pragma once
#include <Arduino.h>
#include <cstring>
// arm means the operator has checked the documented circuit, not automatic validation.
class BenchControl {
 public:
  bool armed=false,active=false;
  uint32_t startedAt=0, duration=0;
  char line[24]{}; size_t used=0; bool overflow=false;
  void start(uint32_t ms) { active=armed; startedAt=millis(); duration=ms; }
  template<class Stop> void tick(Stop stop) {
    if(active && static_cast<uint32_t>(millis()-startedAt)>=duration) { stop();active=false; }
  }
  template<class Handle,class Stop> void poll(Handle handle,Stop stop) {
    while(Serial.available()) {
      const char ch=static_cast<char>(Serial.read());
      if(ch=='\r')continue;
      if(ch!='\n') { if(used+1<sizeof(line))line[used++]=ch;else overflow=true;continue; }
      line[used]='\0';
      if(overflow || strcmp(line,"stop")==0) { stop();armed=false;active=false;Serial.println("STOP; desarmado"); }
      else if(strcmp(line,"arm")==0) { stop();active=false;armed=handle("arm");Serial.println(armed?"ARMADO por operador; revisar guia antes de actuar":"ERROR al armar; desarmado"); }
      else if(!armed || !handle(line)) { stop();armed=false;active=false;Serial.println("Comando rechazado; desarmado. Revisar guia y enviar arm."); }
      used=0;overflow=false;
    }
  }
};
