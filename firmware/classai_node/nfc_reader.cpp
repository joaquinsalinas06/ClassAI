// Glue Arduino/Adafruit PN532. La lógica de protocolo vive en nfc_protocol.h.
//
// Máquina de estados (#70): WAIT_TARGET → TARGET_FOUND → SELECT ClassAI
//   → 9000: GET_CREDENTIAL → android_hce | sin ISO-DEP: UID → nfc_card_uid
//   → WAIT_TARGET_RELEASE → WAIT_TARGET
// TARGET_FOUND/SELECT/GET ocurren dentro de una misma llamada a nfcPoll (solo al haber tap).
//
// Hardware: PN532 NFC Module V3 (Elechouse). DIP SPI = ch1 OFF, ch2 ON (HSU 00, I2C 10);
// mover los switches sin alimentación. VCC a 3V3 del ESP32 (niveles SPI a 3,3 V), GND común.
// SCK 18, MISO 19, MOSI 23, SS 5. IRQ/RSTO sin conectar (la librería consulta el estado por SPI).
// Librería: Adafruit PN532 1.3.4 + Adafruit BusIO (Library Manager).
// Límites conocidos de Adafruit 1.3.4:
//  - readDetectedPassiveTargetID lee 20 bytes: UID de 10 bytes llega truncado (raro en la práctica).
//  - inListPassiveTarget imprime "Tag number: 1" por Serial en cada tap (no es nuestro log).
#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_PN532.h>

#include "nfc_protocol.h"
#include "nfc_reader.h"

// PN532 V3 (Elechouse) en SPI: DIP ch1 OFF, ch2 ON. VSPI del ESP32.
static const uint8_t PIN_SCK = 18, PIN_MISO = 19, PIN_MOSI = 23, PIN_SS = 5;
static const uint16_t POLL_TIMEOUT_MS = 50;  // respaldo; con retries=1 el PN532 responde antes
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
  // retries=1 (2 intentos): InListPassiveTarget responde "0 targets" rápido en vez de esperar
  ready = nfc.SAMConfig() && nfc.setPassiveActivationRetries(0x01);
  if (!ready) Serial.println("[NFC] fallo SAMConfig/RFConfiguration");
  return ready;
}

static bool exchange(const uint8_t* apdu, uint8_t len, uint8_t* resp, uint8_t* respLen) {
  return nfc.inDataExchange(const_cast<uint8_t*>(apdu), len, resp, respLen);  // solo copia apdu
}

// Target ya detectado: decide credencial. false = no emitir (ya logueado).
static bool readCredential(const uint8_t* uid, uint8_t uidLen, NfcCredential& out) {
  uint8_t resp[32];
  uint8_t n = sizeof(resp);
  // readPassiveTargetID inlista el target pero no guarda su Tg (Adafruit-PN532 #66);
  // inListPassiveTarget sí, y es lo que usa inDataExchange.
  bool exchanged = nfc.inListPassiveTarget() &&
                   exchange(nfcp::SELECT_APDU, sizeof(nfcp::SELECT_APDU), resp, &n);

  switch (nfcp::afterSelect(exchanged, resp, exchanged ? n : 0, uidLen)) {
    case nfcp::Path::HCE:
      n = sizeof(resp);
      if (exchange(nfcp::GET_CREDENTIAL_APDU, sizeof(nfcp::GET_CREDENTIAL_APDU), resp, &n) &&
          nfcp::parseCredential(resp, n, out.token)) {
        strcpy(out.type, "android_hce");
        return true;
      }
      Serial.printf("[NFC] ClassAI sin credencial válida (SW %04X), ignorado\n", nfcp::statusWord(resp, n));
      return false;
    case nfcp::Path::CARD:
      if (nfcp::cardToken(uid, uidLen, out.token)) {
        strcpy(out.type, "nfc_card_uid");
        return true;
      }
      Serial.printf("[NFC] UID aleatorio o inválido (%u bytes), ignorado\n", uidLen);
      return false;
    default:
      Serial.println("[NFC] dispositivo ISO-DEP sin app ClassAI, ignorado");
      return false;
  }
}

bool nfcPoll(NfcCredential& out) {
  if (!ready) return false;
  // la librería copia uidLength bytes sin límite; 255 evita desbordes con tramas corruptas
  uint8_t uid[255];
  uint8_t uidLen = 0;
  bool present = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLen, POLL_TIMEOUT_MS);

  if (waitRelease) {  // WAIT_TARGET_RELEASE
    if (present) misses = 0;
    else if (++misses >= RELEASE_MISSES) waitRelease = false;
    return false;
  }
  if (!present) return false;  // WAIT_TARGET

  waitRelease = true;
  misses = 0;
  if (!readCredential(uid, uidLen, out)) return false;
  if (!cooldown.allow(out.token, millis())) {
    Serial.printf("[NFC] %s repetido (<3 s), ignorado\n", out.type);
    return false;
  }
  return true;
}
