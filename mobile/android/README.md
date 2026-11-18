# ClassAI Mobile (Android HCE)

App nativa Kotlin que convierte el teléfono en credencial de asistencia NFC. El PN532 del nodo
(lector) le envía APDUs; la app (tarjeta emulada, `HostApduService`) responde con un token opaco
de 16 bytes. Protocolo: **APDU HCE v0.1** en `docs/contracts.md`. Sin red durante el tap.

## Generar el APK

Requisitos: JDK 17+ y Android SDK con `platforms;android-36` y `build-tools;36.0.0`.
La URL del backend es `BuildConfig.CLASSAI_API_URL`; por defecto `https://classai.myschool.com.pe/api`.
Para otro backend, `CLASSAI_API_URL` en el entorno o en `.env` (ver `.env.example`; emulador: `http://10.0.2.2:8000`).
HTTP en claro solo se permite para `10.0.2.2` y `localhost`.

```sh
cd mobile/android
./gradlew --no-daemon testDebugUnitTest assembleRelease   # APK firmado con la clave debug
adb install -r app/build/outputs/apk/release/app-release.apk
```

## Experiencia del alumno

1. **Acceso**: código universitario + contraseña (+ nombre al crear la cuenta). Un 409 al registrar
   lleva al login ("Ese código ya tiene cuenta"); un 401 posterior devuelve al acceso.
   El token de sesión (30 días) queda en SharedPreferences privadas: al reabrir la app sigue dentro.
2. **Inicio**: carnet digital animado (estado NFC/HCE) y las clases abiertas. Pull-to-refresh y refresco cada 5 s.
3. **Clase**: sin asistencia muestra "Acerca tu celular al lector"; al pasar el celular por el lector
   (refresco cada 2,5 s) aparece la asistencia, las métricas del aula (temperatura, humedad, ruido,
   confort) y los votos Todo bien / Calor / Frío con el voto actual marcado.
4. En register y login se envía `nfc_token` (los 16 bytes que el teléfono responde a GET_CREDENTIAL, HEX)
   para que el servidor vincule el teléfono; el tap en sí no usa red.

Contrato HTTP: `docs/contracts.md`, sección "Alumno (app)". Sin iOS; el token HCE es estático
(identificación, no autenticación fuerte). `requireDeviceUnlock=true`: el teléfono debe estar desbloqueado.

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
