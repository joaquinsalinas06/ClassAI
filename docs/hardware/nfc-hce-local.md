# Ensayo local completo: teléfono → PN532 → asistencia

Este ensayo continúa el [montaje físico NFC](banco-nfc.md), **con los mismos
12 cables**, DIP 1 OFF / 2 ON, 3V3/GND y SPI 18/19/23/5. No conectar pantalla,
relé, buzzer, sensores ni pulsador. Estado de hardware: pendiente de ensayo real.

## Una credencial, dos comprobaciones

La app guarda un token estable de 16 bytes. No copiarlo ni hacerlo coincidir con
otro token del ESP32: el lector lo pide con SELECT AID `F0434C4153534149` y
GET_CREDENTIAL, y el backend vincula ese mismo token al estudiante. Una tarjeta
física tiene su propia credencial UID; no es el token HCE del teléfono.

«Credencial leída» en el celular significa que respondió a GET_CREDENTIAL.
«Evento publicado QoS0» en Serial significa aceptación local por la librería
MQTT, **no asistencia persistida**. La comprobación final es la lista de
asistentes de la sesión en web/API. No se añadió confirmación APDU/MQTT nueva.

## 1. Preparar el Mac, sin borrar ni simular asistencia

Desde raíz, usar el entorno Python del proyecto con los requisitos bloqueados:

```sh
uv venv --python 3.13 .venv
uv pip install --python .venv/bin/python -r backend/requirements-ci.txt
.venv/bin/python backend/nfc_lab.py prepare
.venv/bin/python backend/nfc_lab.py doctor
.venv/bin/python backend/nfc_lab.py serve
```

`prepare` pide código y nombre **del perfil de la app**, crea solo si faltan la
base `backend/data/nfc-hce-lab.db`, el aula `nfc-lab` y el estudiante. Conserva
estudiantes, nombres ya registrados, credenciales y sesiones existentes; no pide
token. Si ya está creado, basta repetir sin cambiarlo. No usar `seed_demo --reset`.
La base local está ignorada por Git. Si `.venv` ya existe, conservarla y omitir
su creación; `uv pip install` sirve para completar dependencias.

`doctor` verifica CONNACK del broker existente en 127.0.0.1:1883 y muestra la IP
del Mac. `serve` arranca **solo** ingesta, API en 0.0.0.0:8000 y web real en
127.0.0.1:5189, con esa misma base y sin `.env` ni VITE_MOCK. No reinicia ni
reconfigura Mosquitto. Si un puerto está ocupado, falla sin reemplazar procesos.
Ctrl+C cierra únicamente sus procesos y conserva broker/base. El visor 5188
continúa independiente. La ingesta conserva las suscripciones ClassAI existentes;
la base separada no modifica datos de otros consumidores del broker.

- Teléfono: `http://IP_DEL_MAC:8000`. **localhost en el teléfono es el teléfono**.
- ESP32: MQTT `IP_DEL_MAC:1883`.
- Web en el Mac: `http://127.0.0.1:5189/aula/nfc-lab`.
- API de salud desde navegador del celular: `http://IP_DEL_MAC:8000/health`.

El helper admite `--lan-ip IP_DEL_MAC` si detecta otra interfaz, `--database`
para otra base de ensayo y `--broker-host`/`--broker-port` para ingesta. La
configuración de firmware guiada también admite --broker-port (por defecto 1883).
Para broker con autenticación usar MQTT_USERNAME/MQTT_PASSWORD en el entorno
privado, sin escribirlos en el chat ni en commits. `doctor` prueba acceso desde
el Mac; no demuestra acceso LAN desde otros dispositivos. La red debe permitir
comunicación entre clientes; el ESP32 clásico necesita Wi-Fi de 2,4 GHz. Revisar
firewall/aislamiento si el teléfono no alcanza /health; no cambiar el token.

## 2. App: conservar token y vincular al servidor local

APK debug: `mobile/android/app/build/outputs/apk/debug/app-debug.apk` tras compilar:

```sh
cd mobile/android
JAVA_HOME=/ruta/a/jdk17 ANDROID_HOME=/ruta/al/sdk ./gradlew --no-daemon testDebugUnitTest assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Instalar como actualización, sin desinstalar, borrar datos ni regenerar la
credencial. Si falla por firma o versión, detenerse y revisar la instalación
existente; no resolverlo destruyendo sus datos. Si no hay teléfono por USB,
queda pendiente instalar la actualización (el APK existe localmente).

En ClassAI → **Cambiar servidor**, introducir la URL LAN del Mac. Al cambiarla
se invalida el estado Activa del servidor anterior y se verifica la misma
credencial automáticamente; sin red queda Pendiente con Reintentar. Una respuesta
antigua de otro servidor o credencial no activa el perfil nuevo.

- 200: teléfono vinculado. Repetir mismo código/token devuelve el mismo registro.
- 404: preparar el código correcto en la base local.
- 409: otro teléfono activo o token revocado; revisar el registro, **no revocar ni
  regenerar automáticamente**. La app presenta su aviso genérico de conflicto.
- Sin red / 5xx: conservar datos y reintentar.

El endpoint no usa el nombre enviado para renombrar un estudiante existente.
El botón Desvincular es otra acción: regenera el token y no es necesario aquí.

## 3. Preparar firmware NFC_ONLY

El banco `firmware/nfc_bench` sigue sirviendo para versión, tarjeta y llavero.
**No implementa HCE/APDU**. Para el celular usar el perfil NFC_ONLY del producto,
que reutiliza `nfc_reader.cpp` y `nfc_protocol.h`:

```sh
.venv/bin/python backend/nfc_lab.py configure-firmware
arduino-cli compile --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --build-property compiler.cpp.extra_flags=-DNFC_ONLY=1 --build-path /tmp/classai-nfc-only-build firmware/classai_node
```

El helper pide SSID/clave sin mostrar la clave y crea `firmware/classai_node/secrets.h`
privado (permisos 0600, ignorado por Git), con NFC_ONLY=1, ROOM_ID=nfc-lab y broker
LAN. **Nunca sobrescribe un secrets.h existente**: revisar/editar localmente su
configuración si ya existe. No publica claves ni carga firmware. Los artefactos
compilados con secretos también son privados; no adjuntarlos a una PR.

Verificación reproducible sin secretos ni placa:

```sh
bash scripts/ci/firmware-host.sh
bash scripts/ci/firmware-build.sh             # normal y NFC_ONLY con secrets.example.h
NFC_BUILD_OUTPUT=/tmp/classai-nfc-only-verified bash scripts/ci/firmware-build.sh nfc-only
```

Los binarios de **verificación** usan red/broker de ejemplo y **no están
configurados para tu Wi-Fi**. El binario para la prueba real se genera con la
configuración privada anterior, sin cargarlo automáticamente.

NFC_ONLY deshabilita sensores, I²C, botón y toda escritura de relé/buzzer. Mantiene
red, cola RAM de 32 eventos y telemetría con sensores null. Device ID incluye un
sufijo estable de placa; cada inicio crea sesión nueva y los event_id no colisionan
por encolar eventos en el mismo milisegundo. Mantiene contratos classai/v1 y QoS0.

## 4. Comprobar en tres niveles

Antes de carga: identificar placa/puerto reales, registrar el montaje, preservar
el respaldo privado existente. No se borra/restaura flash para preparar este banco.
La misma receta gráfica sirve para ambos firmwares, sin cables adicionales.

1. **PN532 responde:** terminar prueba de versión/tarjeta/llavero. Tras cargar el
   perfil adecuado en la placa identificada, abrir Serial 115200 y escribir
   `status` seguido de Enter. Debe indicar lector listo y MQTT conectado.
2. **Celular responde:** desbloquear, pantalla encendida y NFC/HCE activos.
   Abrir app sin modo demo, acercar la antena NFC del teléfono al PN532, esperar
   lectura y retirar. Sin sesión: Serial informa android_hce y «Lectura
   diagnostica», sin publicar asistencia. La app muestra Credencial leída.
3. **Persistencia:** esperar «Suscripciones MQTT confirmadas» en ingesta. En
   Serial escribir `start` + Enter; confirmar sesión activa en API/web y recién
   acercar el teléfono. Serial informa lectura y publicación; web/API deben
   mostrar al estudiante **una sola vez**. Repetir tras retirar, incluso después
   del cooldown de 3 segundos. Luego `stop` + Enter y comprobar cierre en API.

`start` exige lector listo y MQTT conectado. Repetir start/stop es idempotente;
no inicia otra sesión ni crea eventos extra. `status` no altera nada. Sin sesión
la lectura es diagnóstica. Si MQTT cae durante sesión, los eventos siguen en RAM
hasta reconectar; se pueden perder por reinicio, cola llena o corte tras publicar.
`stop` puede quedar en cola: su cierre local no prueba que el backend ya lo recibió.

Con el session_id mostrado por Serial, comprobar desde el Mac:

```sh
curl 'http://127.0.0.1:8000/classes/current?room=nfc-lab'
curl 'http://127.0.0.1:8000/sessions/SESSION_ID/attendance'
curl 'http://127.0.0.1:8000/sessions/SESSION_ID/summary'
```

La respuesta attendance no devuelve tokens. Durante sesión basta attendance;
el resumen se materializa al cerrar. El éxito es comprobar `count=1` y el
estudiante esperado en **esa sesión**, no solo ver una animación o LED.

## Diagnóstico y registro

| Estado observado | Qué revisar |
|---|---|
| PN532 no responde | Guía física: DIP, seis redes, soldadura y alimentación, siempre apagado al mover |
| Tarjetas sí / teléfono no | Perfil NFC_ONLY, APK real sin simulación, NFC/HCE y desbloqueo; AID/SELECT y posición de antena |
| GET_CREDENTIAL válido / sin asistencia | Sesión activa, mismo broker/aula, ingesta suscrita, enrolamiento en esa misma API/base; consultar attendance |
| unknown_credential | App vinculada a otro servidor/base o token cambiado; reintentar vinculación sin regenerar |
| revoked_credential / 409 | Revisar revocación/conflicto; no reactivar automáticamente |
| unknown_session / closed_session | Orden inicio/tap/cierre y entrega de eventos; no contar lectura local como persistencia |
| Web no muestra registros reales | Puerto 5189 sin VITE_MOCK; aula nfc-lab y sesión correcta; refrescar si se abre detalle histórico durante sesión |

No publicar tokens, UID, claves, DB, flash ni logs de payloads MQTT. El log nuevo
del firmware muestra solo evento/id y publicación. Registrar en montajes por
separado pruebas software y las físicas, con placa/puerto/commit/perfil y evidencia.
