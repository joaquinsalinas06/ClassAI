// Glue Arduino/Adafruit PN532. La lógica de protocolo vive en nfc_protocol.h.
//
// Solo celular (Android HCE): sondeo → SELECT ClassAI → GET_CREDENTIAL → token.
// Un intento fallido no bloquea nada: el siguiente sondeo lo repite mientras el teléfono siga cerca.
// Tras una lectura buena se espera a que se retire (WAIT_TARGET_RELEASE) para no repetirla.
// Sin tarjetas físicas, sin heurísticas de UID, sin reinicio de campo ni contadores de reintento.
//
// Hardware: PN532 NFC Module V3 (Elechouse). DIP SPI = ch1 OFF, ch2 ON (HSU 00, I2C 10);
// mover los switches sin alimentación. VCC a 3V3 del ESP32 (niveles SPI a 3,3 V), GND común.
// SCK 18, MISO 19, MOSI 23, SS 5. IRQ/RSTO sin conectar (la librería consulta el estado por SPI).
// Librería: Adafruit PN532 1.3.4 + Adafruit BusIO (Library Manager).
// Límites conocidos de Adafruit 1.3.4:
//  - readDetectedPassiveTargetID lee 20 bytes: UID de 10 bytes llega truncado (raro en la práctica).
//  - copia de build preparada por scripts/ci/prepare-pn532.py conserva Tg al leer UID.
#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_PN532.h>
#ifndef CLASSAI_PN532_RETAINS_TARGET
#error "Preparar PN532 con scripts/ci/prepare-pn532.py y compilar con --library RUTA"
#endif

#include "nfc_protocol.h"
#include "nfc_reader.h"

// PN532 V3 (Elechouse) en SPI: DIP ch1 OFF, ch2 ON. VSPI del ESP32.
static const uint8_t PIN_SCK = 18, PIN_MISO = 19, PIN_MOSI = 23, PIN_SS = 5;
static const uint16_t POLL_TIMEOUT_MS = 250;  // respaldo; con retries=1 el PN532 responde antes
static const uint8_t RELEASE_MISSES = 2;     // lecturas vacías seguidas = target retirado

static Adafruit_PN532 nfc(PIN_SS);
static bool ready = false;
static bool waitRelease = false;
static uint8_t misses = 0;
static nfcp::Cooldown cooldown;

bool nfcBegin() {
  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_SS);
  nfc.begin();
  uint32_t ver = 0;
  for (int i = 0; i < 3 && !ver; i++) ver = nfc.getFirmwareVersion();  // la 1.ª a veces falla tras el wakeup
  if (!ver) {
    Serial.println("[NFC] PN532 no encontrado (revisar DIP SPI y cableado)");
    return ready = false;
  }
  Serial.printf("[NFC] PN5%02X firmware %u.%u\n", (unsigned)(ver >> 24) & 0xFF,
                (unsigned)(ver >> 16) & 0xFF, (unsigned)(ver >> 8) & 0xFF);
  // Más reintentos = el campo RF permanece encendido más ms por sondeo, y Android HCE alcanza a activarse.
  // 17-nov con retries=10 y SIN resincronizar: SELECT 7/12 (con 1: 3/12) pero GET 0/7 por el desfase del chip.
  // 18-nov con retries=1 y resync: los primeros taps no se detectaban (silencio). Se prueba 8 con resync.
  ready = nfc.SAMConfig() && nfc.setPassiveActivationRetries(0x08);
  if (!ready) Serial.println("[NFC] fallo SAMConfig/RFConfiguration");
  return ready;
}

bool nfcIsReady() { return ready; }

// Tras un timeout el PN532 puede responder tarde y dejar una trama atrasada: el siguiente comando lee la respuesta del
// anterior («unexpected response command») y todo falla hasta reiniciar (log 18-nov 17:54 y 18:21). Se reinicializa.
static bool needResync = false;

static bool exchange(const uint8_t* apdu, uint8_t len, uint8_t* resp, uint8_t* respLen) {
  const bool ok = nfc.inDataExchange(const_cast<uint8_t*>(apdu), len, resp, respLen);
  if (!ok) {
    *respLen = 0;  // A transport failure has no APDU status word.
    needResync = true;
  }
  return ok;
}

// SELECT ClassAI → GET_CREDENTIAL. La librería conserva Tg tras detectar el UID: no volver a listar aquí.
static bool readCredential(NfcCredential& out) {
  uint8_t resp[32];
  uint8_t n = sizeof(resp);
  const bool selected = exchange(nfcp::SELECT_APDU, sizeof(nfcp::SELECT_APDU), resp, &n);
  if (nfcp::afterSelect(selected, resp, n, 4) != nfcp::Path::HCE) return false;
  n = sizeof(resp);
  if (!exchange(nfcp::GET_CREDENTIAL_APDU, sizeof(nfcp::GET_CREDENTIAL_APDU), resp, &n)) return false;
  if (!nfcp::parseCredential(resp, n, out.token)) return false;
  strcpy(out.type, "android_hce");
  return true;
}

bool nfcPoll(NfcCredential& out) {
  if (!ready || needResync) {  // arranque fallido o PN532 desfasado: reinicializar, como mucho cada 100 ms
    static uint32_t lastTry = 0;
    if (millis() - lastTry < 100) return false;
    lastTry = millis();
    needResync = false;
    nfcBegin();
    return false;
  }
  // la librería copia uidLength bytes sin límite; 255 evita desbordes con tramas corruptas
  uint8_t uid[255];
  uint8_t uidLen = 0;
  const bool present = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLen, POLL_TIMEOUT_MS);

  if (!present) {
    if (waitRelease && ++misses >= RELEASE_MISSES) waitRelease = false;  // teléfono retirado
    return false;
  }
  misses = 0;
  if (waitRelease) return false;  // sigue el mismo tap ya leído
  if (!readCredential(out)) return false;  // sin waitRelease: el próximo sondeo reintenta

  waitRelease = true;
  if (!cooldown.allow(out.token, millis())) {
    Serial.printf("[NFC] %s repetido (<3 s), ignorado\n", out.type);
    return false;
  }
  Serial.println("[NFC] credencial leída");
  return true;
}
