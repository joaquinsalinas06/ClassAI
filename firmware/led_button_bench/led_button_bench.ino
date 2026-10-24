// M-01: solo LED GPIO25 con 1 kΩ en serie y botón GPIO32 hacia GND.
// Identificar placa/puerto y preservar respaldo antes de cualquier carga.
#include <Arduino.h>
constexpr uint8_t LED_PIN = 25, BUTTON_PIN = 32;
constexpr uint32_t DEBOUNCE_MS = 35;
int lastRead = HIGH, stable = HIGH;
uint32_t changedAt = 0;
bool on = false;
void setup() {
  Serial.begin(115200);
  digitalWrite(LED_PIN, LOW);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.println("M-01: LED25 con 1k; boton32 a GND; una pulsacion alterna LED.");
}
void loop() {
  const uint32_t now = millis();
  const int value = digitalRead(BUTTON_PIN);
  if (value != lastRead) { lastRead = value; changedAt = now; }
  if (value != stable && now - changedAt >= DEBOUNCE_MS) {
    stable = value;
    if (stable == LOW) {
      on = !on;
      digitalWrite(LED_PIN, on ? HIGH : LOW);
      Serial.printf("Pulsacion: LED %s\n", on ? "ON" : "OFF");
    }
  }
}
