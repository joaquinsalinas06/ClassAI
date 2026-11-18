// Protocolo NFC ClassAI (APDU HCE v0.1, docs/contracts.md) — C++ puro, sin Arduino.
// Lo usa nfc_reader.cpp y se prueba en el host con test/test_nfc_protocol.cpp.
#pragma once
#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace nfcp {

const size_t TOKEN_LEN = 16;

// SELECT AID F0434C4153534149 ("F0" + "CLASSAI"), Le = 00
const uint8_t SELECT_APDU[] = {0x00, 0xA4, 0x04, 0x00, 0x08, 0xF0, 0x43,
                               0x4C, 0x41, 0x53, 0x53, 0x41, 0x49, 0x00};
// GET_CREDENTIAL, Le = 0x11 (version + token[16])
const uint8_t GET_CREDENTIAL_APDU[] = {0x80, 0xCA, 0x00, 0x00, 0x11};

const uint16_t SW_OK = 0x9000;
const uint16_t SW_NO_CREDENTIAL = 0x6985;
const uint16_t SW_WRONG_LENGTH = 0x6700;
const uint16_t SW_INS_NOT_SUPPORTED = 0x6D00;
const uint16_t SW_UNKNOWN_AID = 0x6A82;

// Últimos 2 bytes de la respuesta; 0 si no hay
inline uint16_t statusWord(const uint8_t* r, size_t n) {
  return n >= 2 ? (uint16_t)((r[n - 2] << 8) | r[n - 1]) : 0;
}

// HEX mayúsculas sin separadores; out debe tener 2n+1 bytes
inline void toHex(const uint8_t* b, size_t n, char* out) {
  static const char D[] = "0123456789ABCDEF";
  for (size_t i = 0; i < n; i++) {
    out[2 * i] = D[b[i] >> 4];
    out[2 * i + 1] = D[b[i] & 0x0F];
  }
  out[2 * n] = '\0';
}

// UID de 4 bytes que empieza con 0x08 = aleatorio (teléfono HCE): nunca es identidad
inline bool isRandomUid(const uint8_t* uid, size_t n) { return n == 4 && uid[0] == 0x08; }

// Token nfc_card_uid; false si el UID es aleatorio o de largo no ISO14443A (4/7/10)
inline bool cardToken(const uint8_t* uid, size_t n, char* out) {
  if (isRandomUid(uid, n) || (n != 4 && n != 7 && n != 10)) return false;
  toHex(uid, n, out);
  return true;
}

// Respuesta a GET_CREDENTIAL: exactamente 01 ‖ token[16] ‖ 90 00 → 32 HEX en out (>= 33 bytes)
inline bool parseCredential(const uint8_t* r, size_t n, char* out) {
  if (n != 1 + TOKEN_LEN + 2 || r[0] != 0x01 || statusWord(r, n) != SW_OK) return false;
  toHex(r + 1, TOKEN_LEN, out);
  return true;
}

enum class Path { HCE, CARD, IGNORE };

// Qué hacer tras el SELECT ClassAI.
// exchanged=false: el target no habla ISO-DEP (MIFARE Classic, NTAG) → tarjeta física.
// SELECT = 90 00 exacto → app ClassAI → GET_CREDENTIAL.
// Otro SW (6A82, 6985...): ISO-DEP sin ClassAI. Con UID de 4 bytes asumimos teléfono
// (HCE sin enrolar / otra app) → nada. Con 7/10 bytes es tarjeta ISO-DEP (DESFire) → UID.
// ponytail: heurística por largo de UID; un DESFire con UID de 4 bytes queda ignorado.
inline Path afterSelect(bool exchanged, const uint8_t* r, size_t n, size_t uidLen) {
  if (!exchanged) return Path::CARD;
  if (n == 2 && statusWord(r, n) == SW_OK) return Path::HCE;
  return uidLen == 4 ? Path::IGNORE : Path::CARD;
}

// Anti-repetición: el mismo token no se re-emite dentro de windowMs. now = millis() inyectado.
struct Cooldown {
  char last[41] = {0};
  uint32_t at = 0;

  bool allow(const char* token, uint32_t now, uint32_t windowMs = 3000) {
    // resta sin signo: correcta aunque millis() dé la vuelta (~49 días)
    if (last[0] && strcmp(last, token) == 0 && now - at < windowMs) return false;
    strncpy(last, token, sizeof(last) - 1);
    at = now;
    return true;
  }
};

}  // namespace nfcp
