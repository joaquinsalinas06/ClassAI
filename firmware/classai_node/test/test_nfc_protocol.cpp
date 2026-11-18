// Test de host para nfc_protocol.h:
//   g++ -std=c++17 -I firmware/classai_node firmware/classai_node/test/test_nfc_protocol.cpp -o /tmp/test_nfc && /tmp/test_nfc
#undef NDEBUG
#include <assert.h>
#include <stdio.h>

#include "nfc_protocol.h"

using namespace nfcp;

int main() {
  // APDUs byte a byte según contracts.md
  const uint8_t sel[] = {0x00, 0xA4, 0x04, 0x00, 0x08, 0xF0, 0x43, 0x4C, 0x41, 0x53, 0x53, 0x41, 0x49, 0x00};
  assert(sizeof(SELECT_APDU) == 14 && memcmp(SELECT_APDU, sel, 14) == 0);
  const uint8_t get[] = {0x80, 0xCA, 0x00, 0x00, 0x11};
  assert(sizeof(GET_CREDENTIAL_APDU) == 5 && memcmp(GET_CREDENTIAL_APDU, get, 5) == 0);

  // Status words
  const uint8_t ok[] = {0x90, 0x00}, nocred[] = {0x69, 0x85}, aid[] = {0x6A, 0x82};
  assert(statusWord(ok, 2) == SW_OK);
  assert(statusWord(nocred, 2) == SW_NO_CREDENTIAL);
  assert(statusWord(ok, 1) == 0);

  // HEX mayúsculas
  char hex[41];
  const uint8_t b[] = {0x0a, 0xff, 0x00, 0x9c};
  toHex(b, 4, hex);
  assert(strcmp(hex, "0AFF009C") == 0);

  // UID de tarjeta: 4/7/10 bytes, nunca aleatorio 08xxxxxx
  const uint8_t uid4[] = {0xDE, 0xAD, 0xBE, 0xEF};
  const uint8_t uid7[] = {0x04, 0x1A, 0x2B, 0x3C, 0x4D, 0x5E, 0x80};
  const uint8_t rnd[] = {0x08, 0x12, 0x34, 0x56};
  assert(cardToken(uid4, 4, hex) && strcmp(hex, "DEADBEEF") == 0);
  assert(cardToken(uid7, 7, hex) && strcmp(hex, "041A2B3C4D5E80") == 0);
  assert(isRandomUid(rnd, 4) && !cardToken(rnd, 4, hex));
  assert(!isRandomUid(uid7, 7));
  assert(!cardToken(uid4, 5, hex));  // largo no ISO14443A

  // GET_CREDENTIAL: exactamente 19 bytes, versión 01, SW 9000
  uint8_t resp[19] = {0x01, 0x9F, 0x2C, 0x4A, 0x01, 0xB7, 0xE3, 0x5D, 0x66,
                      0x88, 0xC1, 0xF0, 0xA2, 0xB4, 0xD6, 0xE8, 0xF0, 0x90, 0x00};
  assert(parseCredential(resp, 19, hex) && strcmp(hex, "9F2C4A01B7E35D6688C1F0A2B4D6E8F0") == 0);
  assert(strlen(hex) == 32);
  assert(!parseCredential(resp, 18, hex));       // corto
  assert(!parseCredential(nocred, 2, hex));      // 6985 no enrolado
  resp[0] = 0x02;
  assert(!parseCredential(resp, 19, hex));       // versión desconocida
  resp[0] = 0x01; resp[18] = 0x01;
  assert(!parseCredential(resp, 19, hex));       // SW != 9000

  // Decisión tras SELECT
  assert(afterSelect(false, nullptr, 0, 4) == Path::CARD);   // MIFARE Classic: no ISO-DEP
  assert(afterSelect(true, ok, 2, 4) == Path::HCE);          // app ClassAI
  assert(afterSelect(true, aid, 2, 4) == Path::IGNORE);      // teléfono sin ClassAI
  assert(afterSelect(true, nocred, 2, 4) == Path::IGNORE);
  assert(afterSelect(true, aid, 2, 7) == Path::CARD);        // DESFire sin ClassAI
  const uint8_t fci[] = {0x6F, 0x00, 0x90, 0x00};
  assert(afterSelect(true, fci, 4, 4) == Path::IGNORE);      // 9000 con datos: no es ClassAI

  // Cooldown 3 s con millis inyectado
  Cooldown c;
  assert(c.allow("AA", 1000));
  assert(!c.allow("AA", 3999));   // repetido dentro de 3 s
  assert(c.allow("BB", 4000));    // otro token pasa
  assert(c.allow("AA", 4001));    // AA ya no es el último
  assert(!c.allow("AA", 7000));
  assert(c.allow("AA", 7001));    // 3 s después de 4001
  Cooldown w;                      // vuelta de millis()
  assert(w.allow("CC", 0xFFFFFF00u));
  assert(!w.allow("CC", 0x00000100u));  // 512 ms después de la vuelta
  assert(w.allow("CC", 0x00000C00u));   // > 3 s después

  puts("test_nfc_protocol: OK");
  return 0;
}
