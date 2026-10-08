// Lector NFC ClassAI: PN532 (SPI) para tarjetas ISO14443A y Android HCE.
#pragma once

struct NfcCredential { char type[16]; char token[41]; };   // type "nfc_card_uid" | "android_hce"

bool nfcBegin();                    // init PN532 over SPI; false if not found (node keeps working without NFC)
bool nfcPoll(NfcCredential& out);   // non-blocking (target <~60 ms per call); true once per new tap (cooldown/release handled inside)
