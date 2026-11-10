// ESP32 + L9110 (ventilador) + DHT11 + LDR + sensor de sonido + PIR + 3 LEDs
// Librería necesaria: "DHT sensor library" de Adafruit (y "Adafruit Unified Sensor")
// Core ESP32 versión 3.x (ledcAttach)

#include <DHT.h>

// ---------- Pines ----------
const int PIN_IA = 26;   // L9110 A-IA (PWM)
const int PIN_IB = 25;   // L9110 A-IB (siempre LOW)
const int PIN_DHT = 4;   // DHT11 DATA
const int PIN_LDR = 35;  // LDR (solo entrada)
const int PIN_SND = 34;  // Sensor de sonido AO (solo entrada)
const int PIN_PIR = 27;  // PIR OUT  <-- cambia si usaste otro pin
const int LED_VERDE = 18;
const int LED_AMARILLO = 19;
const int LED_ROJO = 23;

// ---------- Umbrales de temperatura (°C) ----------
const float T_ENCENDER = 26.0;  // desde aquí enciende el ventilador
const float T_ALERTA = 30.0;    // desde aquí LED rojo

DHT dht(PIN_DHT, DHT11);

unsigned long ultimaLectura = 0;
bool ventiladorEncendido = false;

void arrancarVentilador() {
  digitalWrite(PIN_IB, LOW);
  for (int v = 120; v <= 255; v += 15) {  // arranque suave
    ledcWrite(PIN_IA, v);
    delay(40);
  }
  ledcWrite(PIN_IA, 255);
  ventiladorEncendido = true;
}

void apagarVentilador() {
  digitalWrite(PIN_IB, LOW);
  ledcWrite(PIN_IA, 0);
  ventiladorEncendido = false;
}

void setLeds(bool v, bool a, bool r) {
  digitalWrite(LED_VERDE, v);
  digitalWrite(LED_AMARILLO, a);
  digitalWrite(LED_ROJO, r);
}

void setup() {
  Serial.begin(115200);

  pinMode(PIN_IB, OUTPUT);
  digitalWrite(PIN_IB, LOW);
  ledcAttach(PIN_IA, 1000, 8);  // PWM 1 kHz, 8 bits
  ledcWrite(PIN_IA, 0);

  pinMode(PIN_PIR, INPUT);
  pinMode(LED_VERDE, OUTPUT);
  pinMode(LED_AMARILLO, OUTPUT);
  pinMode(LED_ROJO, OUTPUT);

  analogReadResolution(12);
  dht.begin();

  setLeds(false, false, false);
}

void loop() {
  if (millis() - ultimaLectura < 2000) return;  // DHT11: mínimo 1 s entre lecturas
  ultimaLectura = millis();

  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  int luz = analogRead(PIN_LDR);
  int ruido = analogRead(PIN_SND);
  bool mov = digitalRead(PIN_PIR);

  if (isnan(temp) || isnan(hum)) {
    Serial.println("Error leyendo el DHT11");
    if (ventiladorEncendido) apagarVentilador();
    setLeds(false, false, true);  // rojo = error
    return;
  }

  // Ventilador: solo encendido o apagado
  if (temp >= T_ENCENDER && !ventiladorEncendido) arrancarVentilador();
  if (temp < T_ENCENDER - 1.0 && ventiladorEncendido) apagarVentilador();  // histéresis de 1 °C

  // LEDs de estado
  if (temp >= T_ALERTA) setLeds(false, false, true);         // rojo
  else if (temp >= T_ENCENDER) setLeds(false, true, false);  // amarillo
  else setLeds(true, false, false);                          // verde

  Serial.printf("Temp: %.1f C | Hum: %.0f %% | Luz: %d | Ruido: %d | Movimiento: %s | Ventilador: %s\n",
                temp, hum, luz, ruido, mov ? "SI" : "no", ventiladorEncendido ? "ON" : "off");
}