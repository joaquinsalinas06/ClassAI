// SOLO simulación: DHT22 sustituye al DHT11 físico. No es el firmware del banco real.
#include <Arduino.h>
#include <DHT.h>
DHT sensor(4, DHT22);
void setup() {
  Serial.begin(115200);
  pinMode(27, INPUT);
  sensor.begin();
  Serial.println("SIMULACION DHT22 + PIR: no valida DHT11, VIN ni piezas reales");
}
void loop() {
  delay(2500);
  const float t = sensor.readTemperature(), h = sensor.readHumidity();
  if (isnan(t) || isnan(h)) Serial.println("SIM sensor invalido");
  else Serial.printf("SIM temp_c=%.1f rh_pct=%.1f motion=%d\n", t, h, digitalRead(27));
}
