# ClassAI Mobile (Android HCE)

App nativa Kotlin que convierte el teléfono en credencial de asistencia NFC. El PN532 del nodo
(lector) le envía APDUs; la app (tarjeta emulada, `HostApduService`) responde con un token opaco
de 16 bytes. Protocolo: **APDU HCE v0.1** en `docs/contracts.md`. Sin red durante el tap.

## Generar el APK

Requisitos: JDK 17+ y Android SDK con `platforms;android-36` y `build-tools;36.0.0`.
La dirección de API se configura al compilar, nunca por el alumno:

```sh
cd mobile/android
cp .env.example .env
# Editar CLASSAI_API_URL en .env (sin comillas); este archivo está ignorado por Git.
./gradlew testDebugUnitTest assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`CLASSAI_API_URL` del entorno tiene prioridad sobre `.env`; el valor de desarrollo
es `http://10.0.2.2:8000` (el localhost del ordenador visto por el emulador).
Un teléfono físico necesita una API accesible por LAN o HTTPS. Cambiar esa dirección
requiere recompilar el APK, sin mostrar configuración al alumno. Al actualizar
a otra URL, el carnet queda pendiente y revalida el mismo token; no se borran sus datos. La URL no es un
secreto; nunca incluir claves de administrador en ella. No se despliega un servidor
con este build. AGP 9.1, Gradle wrapper 9.3.1, minSdk 26 y compile/target 36.

## Experiencia del alumno

1. Primera apertura: **solo código universitario**. Teclado numérico, ceros iniciales
   intactos, dígitos visibles y botón activo cuando el formato es válido. Se puede
   enviar con el botón o la tecla Listo/Enter. El docente debe haber cargado el código
   en el padrón. El nombre se obtiene de la respuesta del backend, no se pide otra vez.
2. Vinculación: el token se genera localmente y se envía con el código. Mientras se
   procesa no se duplican envíos. Si no hay conexión, se guarda el código y el carnet
   queda **Pendiente de vincular**; se reintenta al volver a abrir, recuperar red o
   pulsar Reintentar. Nunca se declara activo sin confirmación del servidor.
3. Siguientes aperturas: se muestra el carnet guardado directamente. Una vinculación
   activa no necesita Internet durante el tap, ni la Activity abierta. Los estados
   NFC apagado, Sin NFC/Sin HCE y Pendiente siguen siendo explícitos.
4. Tras leer la credencial: confirmación breve, vibración y hora en Últimas lecturas (memoria del proceso). La app
   indica **Credencial leída**, no confirmación de asistencia en SQLite: el backend
   sigue validando sesión/estudiante y puede rechazar una lectura.
5. Menú secundario: Cambiar de estudiante pide confirmación, regenera la credencial y
   vuelve al código. Para volver a vincular un teléfono distinto, el docente debe
   revocar el anterior. **Ver detalles técnicos**, cerrado por defecto, muestra NFC/HCE reales,
   vinculación, URL configurada, AID, credencial privada copiable y eventos APDU en memoria.
   El botón de ajustes NFC permite configurar el teléfono. La URL sigue definiéndose
   en `.env` al compilar; el alumno no necesita introducirla ni cambiarla.

La ilustración identifica **Tu teléfono → Lector del aula** con una pantalla NFC
y base. Dos destellos suaves y ondas secuenciales animan la escena; el carnet entra
con un fundido corto y una sola onda tenue, sin giro 3D ni confeti. Todo usa Canvas/animación nativa. Se detienen cuando la vista no es visible
y respetan la opción del sistema para reducir/desactivar animaciones. Login, carnet
y confirmación usan los tokens de `design/tokens.json`; fuentes nativas como fallback
sin descargas. Las credenciales y el perfil viven en SharedPreferences privadas con
backup deshabilitado. El APK conserva ese perfil entre reinicios normales.

Este acceso por código es **enrolamiento del prototipo**, no autenticación
institucional ni login con Google. Google requeriría configurar OAuth y verificar
sus tokens en el backend; no se incluye un botón ficticio.

## Contrato de enrolamiento

```http
POST {API_URL}/mobile/enroll
Content-Type: application/json; charset=utf-8

{"student_code":"0012345","token":"<32 HEX mayúsculas>"}
```

Respuesta `200`: `student_code`, nombre canónico `full_name`, `credential_id` y
`status: active`. `full_name` en la petición sigue siendo opcional para compatibilidad
con versiones anteriores; el backend usa siempre el nombre del padrón.

- Repetir código + token del mismo teléfono activo devuelve el mismo perfil/ID,
  incluso si se perdió la primera respuesta. La operación se serializa en SQLite.
- Otro teléfono activo para ese código devuelve `409`; código sin registrar `404`;
  token inválido `400`. La app muestra una instrucción para el alumno/docente.
- Sin red, respuesta incompleta/no válida o `5xx`: estado pendiente, reintentable.
- El tap solo entrega el token opaco, sin código/nombre ni llamadas de red.

Comprobaciones desde la raíz:

```sh
node design/build-tokens.mjs --check
node --test design/*.test.mjs
PYTHON_DOTENV_DISABLED=1 .venv/bin/python -m pytest backend -q
PYTHON=.venv/bin/python scripts/ci/smoke.sh
```

## Depuración (solo builds debug)

El emulador no tiene NFC. En builds debug:

```sh
# fuerza NFC/HCE disponibles en la UI y simula una lectura exitosa
adb shell am start -n com.classai.mobile/.MainActivity --ez demo_nfc true --ez simulate_read true
```

La simulación solo se activa por ese intent explícito de depuración; mantener
presionado el carnet no simula asistencia. Logcat: `adb logcat -s ClassAI`.
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
