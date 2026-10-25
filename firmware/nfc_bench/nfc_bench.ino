// M-10 aislado: PN532 SPI 18/19/23/5, 3V3/GND. DIP 1 OFF / 2 ON apagado.
// Sin WiFi, pantalla, sensores ni actuadores. No imprime UID/tokens.
// Identificar placa/puerto y preservar respaldo antes de cargar.
#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_PN532.h>
constexpr uint8_t SCK_PIN = 18, MISO_PIN = 19, MOSI_PIN = 23, SS_PIN = 5;
Adafruit_PN532 nfc(SS_PIN);
bool ready = false, waitRelease = false;
uint8_t misses = 0;
uint32_t reads = 0;
void setup() {
  Serial.begin(115200);
  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);
  nfc.begin();
  uint32_t version = 0;
  for (uint8_t i = 0; i < 3 && !version; ++i) version = nfc.getFirmwareVersion();
  if (!version) { Serial.println("PN532 no encontrado: revisar alimentacion, soldadura, DIP y SPI."); return; }
  Serial.printf("PN5%02X firmware %u.%u\n", unsigned(version >> 24) & 0xff, unsigned(version >> 16) & 0xff, unsigned(version >> 8) & 0xff);
  ready = nfc.SAMConfig() && nfc.setPassiveActivationRetries(0x01);
  Serial.println(ready ? "Acercar tarjeta o llavero; retirar entre detecciones. No prueba Android HCE." : "Fallo de configuracion PN532.");
}
void loop() {
  if (!ready) { delay(100); return; }
  uint8_t uid[255] = {}, length = 0;
  const bool present = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &length, 50);
  if (waitRelease) {
    if (present) misses = 0;
    else if (++misses >= 2) { waitRelease = false; Serial.println("Retirada detectada"); }
    return;
  }
  if (!present) return;
  waitRelease = true; misses = 0;
  Serial.printf("Deteccion %lu: UID de %u bytes; valor omitido\n", static_cast<unsigned long>(++reads), unsigned(length));
}
