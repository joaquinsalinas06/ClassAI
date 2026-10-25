// B-09 nominal 3.3 V per user report, <=10 mA reference, Q1 2N3904; never direct GPIO power.
#include <Arduino.h>
#include <ClassAIBench.h>
constexpr uint8_t BUZZER_PIN=17;
BenchControl control;bool pwm=false;
void stopOutput(){if(pwm){ledcWriteTone(BUZZER_PIN,0);ledcDetach(BUZZER_PIN);pwm=false;}digitalWrite(BUZZER_PIN,LOW);}
bool command(const char* text){
 if(strcmp(text,"arm")==0)return true;
 if(strcmp(text,"active")==0){stopOutput();digitalWrite(BUZZER_PIN,HIGH);control.start(120);return true;}
 if(strcmp(text,"passive")==0){stopOutput();pwm=ledcAttach(BUZZER_PIN,2000,8);if(!pwm)return false;ledcWriteTone(BUZZER_PIN,2000);control.start(120);return true;}
 return false;
}
void setup(){digitalWrite(BUZZER_PIN,LOW);pinMode(BUZZER_PIN,OUTPUT);Serial.begin(115200);Serial.println("Buzzer GPIO17: confirmar tipo/consumo para directo; alternativa con transistor en guia. arm, active (120 ms), passive (2 kHz/120 ms), stop. Desarmado.");}
void loop(){control.poll(command,stopOutput);control.tick(stopOutput);}
