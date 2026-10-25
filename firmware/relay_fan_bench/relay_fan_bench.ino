// Reference LOW-trigger relay module. DIRECT only after 3.3 V compatibility is confirmed.
// BENCH_RELAY_NPN_ONLY selects the optional inverting transistor circuit.
#include <Arduino.h>
#include <ClassAIBench.h>
constexpr uint8_t RELAY_CONTROL=26;
#if defined(BENCH_RELAY_NPN_ONLY)
constexpr int RELAY_ON=HIGH,RELAY_OFF=LOW;
#else
constexpr int RELAY_ON=LOW,RELAY_OFF=HIGH;
#endif
BenchControl control;
void stopOutput(){digitalWrite(RELAY_CONTROL,RELAY_OFF);}
bool command(const char* text){
 if(strcmp(text,"arm")==0)return true;
 if(strcmp(text,"on")==0){digitalWrite(RELAY_CONTROL,RELAY_ON);control.start(2000);return true;}
 if(strcmp(text,"off")==0){stopOutput();control.active=false;return true;}
 return false;
}
void setup(){digitalWrite(RELAY_CONTROL,RELAY_OFF);pinMode(RELAY_CONTROL,OUTPUT);Serial.begin(115200);Serial.println("GPIO26, referencia LOW-trigger; perfil DIRECTO o NPN segun compilacion. Confirmar montaje sin fan primero. arm, on (max 2 s), off, stop. Desarmado.");}
void loop(){control.poll(command,stopOutput);control.tick(stopOutput);}
