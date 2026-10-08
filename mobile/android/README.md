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

AGP 9.1 (Kotlin integrado), Gradle 9.3.1, minSdk 26, target/compile 36.
Dependencias: `com.google.android.material:material:1.12.0` (Material 3) y
`androidx.swiperefreshlayout:swiperefreshlayout:1.1.0`. Animaciones con ObjectAnimator,
AnimatedVectorDrawable y vistas Canvas propias (`Fx.kt`); sin Lottie ni librerías de efectos.

## Flujo

1. **Login** (primer arranque): código universitario, nombre completo y *Servidor* (URL del
   backend; por defecto `http://10.0.2.2:8000`, el host visto desde el emulador). *Vincular este
   teléfono* envía `POST {servidor}/mobile/enroll` con el token local (ver contrato abajo).
   - 2xx → carnet **Activa**.
   - 409 → error en el formulario: "Este estudiante ya tiene un teléfono activo, pide al docente
     que lo revoque". Otro 4xx → error "El servidor rechazó los datos (HTTP n)".
   - Sin red / 5xx → se guarda el perfil y el carnet queda **Pendiente de vincular**, con botón
     *Reintentar* y deslizar hacia abajo para reintentar.
2. **Carnet digital**: nombre, código, avatar con iniciales y chip de estado
   (Activa / Pendiente de vincular / NFC desactivado / Sin HCE / Sin NFC). Con estado Activa
   las ondas NFC laten: "Acerca el teléfono al lector".
3. **Tap**: cuando el lector completa GET_CREDENTIAL (9000) y la app está en primer plano, se ve
   la celebración (ondas y confeti desde el ícono NFC, brillo del carnet, check animado,
   vibración, "¡Asistencia enviada!") y la lectura entra en *Últimas lecturas*. El servicio HCE
   responde igual con la app cerrada; la animación es solo feedback local.
4. Barra superior: *Cambiar servidor* (hoja inferior) y *Desvincular / regenerar credencial*
   (confirmación → token nuevo, borra el perfil y vuelve al login; el docente debe revocar la
   credencial anterior en el backend).
5. *Ver detalles técnicos*: token HEX con botón copiar (para enrolamiento manual), AID, estado
   NFC/HCE, servidor y log de APDUs (INS/SW, nunca el token).

Tema claro/oscuro según el sistema. Con animaciones desactivadas (Opciones de desarrollador o
"Quitar animaciones") no hay giros, brillos ni confeti: la información aparece estática.

Datos locales (SharedPreferences privadas, `allowBackup=false`): token (`classai`) y perfil
`code`, `name`, `server`, `enrolled` (`classai_profile`). El token se genera una vez y no cambia
al reiniciar; solo *Desvincular* lo regenera.

## Contrato de enrolamiento

```
POST {servidor}/mobile/enroll
Content-Type: application/json; charset=utf-8

{"student_code": "202310123", "full_name": "Valeria Quispe Rojas", "token": "<32 HEX mayúsculas>"}
```

| Respuesta | App |
|---|---|
| `200` `{"student_code","full_name","credential_id","status":"active"}` (cualquier 2xx) | Activa (no lee el cuerpo) |
| `409` | Rechazado: el estudiante ya tiene un teléfono activo |
| otro `4xx` | Rechazado con el código HTTP |
| `5xx`, timeout (5 s) o sin conexión | Pendiente de vincular, reintentable |

El backend registra `credential.type = android_hce`, `token` = ese HEX (el mismo que el ESP32
publica en `ATTENDANCE_RECORDED`). La red solo se usa aquí, nunca durante el tap.
`network_security_config` permite HTTP en claro para cualquier host (prototipo en LAN).

## Depuración (solo builds debug)

El emulador no tiene NFC. En builds debug:

```sh
# fuerza NFC/HCE disponibles en la UI y simula una lectura exitosa
adb shell am start -n com.classai.mobile/.MainActivity --ez demo_nfc true --ez simulate_read true
```

Mantener presionado el carnet también simula una lectura. Logcat: `adb logcat -s ClassAI`.
Antes del tap real: NFC activo, teléfono **desbloqueado y con pantalla encendida**
(`requireDeviceUnlock=true`); la app no necesita estar abierta ni tener Internet.

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
