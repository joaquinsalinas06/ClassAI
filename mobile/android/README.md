# ClassAI Mobile (Android HCE)

App nativa Kotlin que convierte el teléfono en credencial de asistencia NFC. El PN532 del nodo
(lector) le envía APDUs; la app (tarjeta emulada, `HostApduService`) responde con un token opaco
de 16 bytes. Protocolo: **APDU HCE v0.1** en `docs/contracts.md`. Sin red durante el tap.

## Build

Requisitos: JDK 17+ y Android SDK con `platforms;android-36` y `build-tools;36.0.0`.

```sh
cd mobile/android
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties   # o ANDROID_HOME
./gradlew testDebugUnitTest assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

AGP 9.1 (Kotlin integrado), Gradle 9.3.1, minSdk 26, target/compile 36. Sin dependencias de runtime.

## Uso

1. Abrir la app una vez: genera el token (SecureRandom, 128 bits) y lo guarda en preferencias privadas.
   No se regenera al reiniciar; `allowBackup=false` evita clonarlo a otro equipo.
2. **Enrolar**: copiar el token HEX (botón *Copiar token*) y asociarlo al estudiante en el backend
   (#73) como `credential.type = android_hce`, `token` = esos 32 caracteres.
3. Antes del tap: NFC activo, teléfono **desbloqueado y con pantalla encendida**
   (`requireDeviceUnlock=true`). La app no necesita estar abierta ni tener Internet.
4. *Regenerar* invalida el token anterior: hay que volver a enrolar (también tras reinstalar la app).

La pantalla muestra NFC disponible/activo, HCE compatible, "Listo para acercar al lector" y los
últimos eventos (INS/SW de cada APDU y `onDeactivated` LINK_LOSS/DESELECTED, nunca el token).
Logcat: `adb logcat -s ClassAI`.

## Protocolo (resumen)

| Comando | Respuesta |
|---|---|
| `00 A4 04 00 08 F0434C4153534149 [00]` | `90 00`; otro AID `6A 82`; mal formado `67 00` |
| `80 CA 00 00 11` | `01 ‖ token[16] ‖ 90 00` (19 bytes) |
| GET sin token, o sin SELECT previo | `69 85` |
| GET con longitud distinta | `67 00` |
| otro INS | `6D 00` |

GET_CREDENTIAL antes del SELECT responde `69 85` (condiciones de uso no cumplidas). Android solo
enruta APDUs al servicio tras el SELECT del AID, así que en la práctica no ocurre.

## Lector (firmware)

`firmware/classai_node/nfc_reader.{h,cpp}` + `nfc_protocol.h` (lógica pura, test en
`firmware/classai_node/test/`). API: `nfcBegin()`, `nfcPoll(NfcCredential&)`.

- PN532 V3 (Elechouse) en **SPI: DIP ch1 OFF, ch2 ON**. ESP32: SCK 18, MISO 19, MOSI 23, SS 5, VCC 3V3.
- Librería Adafruit PN532 1.3.4 + Adafruit BusIO.
- Por tap: `readPassiveTargetID` (≤50 ms) → `inListPassiveTarget` → SELECT → GET_CREDENTIAL.
  Si el target no habla ISO-DEP (MIFARE Classic, NTAG) se usa su UID (`nfc_card_uid`).
  Un UID `08xxxxxx` (aleatorio, teléfono) nunca se emite. Un dispositivo ISO-DEP de UID de 4 bytes
  que no responde `90 00` al SELECT (teléfono sin la app/sin enrolar) se ignora; con UID de 7/10
  bytes se trata como tarjeta (DESFire).
- Antirrebote: espera a que se retire el target y no repite el mismo token en 3 s.

Test de host: `g++ -std=c++17 -I firmware/classai_node firmware/classai_node/test/test_nfc_protocol.cpp -o /tmp/t && /tmp/t`

## Límites del prototipo

Identificación de asistencia, no autenticación fuerte: el token es estático y puede copiarse si
alguien controla un lector. Sin iOS. PN532 está "Not Recommended for New Designs" (NXP).
