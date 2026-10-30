# ClassAI — Contratos MQTT v1

Fuente única para firmware, backend, simulador y dashboard (#12, #13, #21, #37).
Todo JSON es UTF-8, sin campos con `NaN`/`Infinity`; un valor inválido se envía como `null`.

## Tópicos

`{room}` = identificador corto del aula, `[a-z0-9-]+` (ej. `a101`).

| Tópico | Dirección | QoS | Retain | Contenido |
|---|---|---|---|---|
| `classai/v1/{room}/telemetry` | ESP32 → backend | 0 | no | lectura periódica (5 s por defecto) |
| `classai/v1/{room}/events` | ESP32 → backend | 1 | no | `SESSION_STARTED`, `ATTENDANCE_RECORDED`, `SESSION_ENDED` |
| `classai/v1/{room}/config` | backend → ESP32 | 1 | **sí** | parámetros del índice de confort |
| `classai/v1/{room}/status` | ESP32 → todos | 1 | sí | `online` / `offline` (Last Will) |

Legado aceptado por el backend (solo lectura, sin cambios en firmware viejo): `MLX90614/temperature` con `{"ambient": float, "object": float}` se ingiere como `room = "legacy"`, métricas `temp_c` (ambient) e `ir_object_c` (object).

QoS 0 en telemetría: una lectura perdida se reemplaza en 5 s. QoS 1 en eventos es el objetivo
del contrato y lo usa `sim_publisher.py`; el backend deduplica por `event_id` y la asistencia
por `(session_id, student_id)`. **El firmware actual usa PubSubClient, que publica con QoS 0**
(también eventos/status). Su cola en RAM reduce pérdidas mientras no hay conexión, pero un corte
tras publicar o un reinicio puede perder eventos. Ni QoS 1 por sí solo ni el smoke test prueban
entrega garantizada: faltan validación física y una estrategia de persistencia/confirmación.
La columna QoS de la tabla describe el objetivo, no una garantía del ESP32 actual.

## Telemetría

```json
{
  "v": 1,
  "device": "esp32-a101",
  "room": "a101",
  "session_id": "a101-20261014T140000Z",
  "ts": "2026-10-14T14:05:00Z",
  "uptime_ms": 302512,
  "temp_c": 23.4,
  "rh_pct": 55.1,
  "lux": 412.0,
  "noise_rel": 0.31,
  "presence": true,
  "ir_object_c": 27.9,
  "comfort": 82,
  "state": "OK",
  "params_version": 3
}
```

| Campo | Tipo | Unidad | Obligatorio | Notas |
|---|---|---|---|---|
| `v` | int | — | sí | versión del contrato, `1` |
| `device` | string | — | sí | ID MQTT del nodo |
| `room` | string | — | sí | igual al `{room}` del tópico |
| `session_id` | string \| null | — | sí | `null` fuera de sesión |
| `ts` | string \| null | ISO 8601 UTC | sí | `null` si aún no hay NTP; el backend usa su hora de recepción |
| `uptime_ms` | int | ms | sí | `millis()` |
| `temp_c` | number \| null | °C | no | DHT22 (o MLX90614 ambient) |
| `rh_pct` | number \| null | % | no | DHT22 |
| `lux` | number \| null | lux | no | BH1750 |
| `noise_rel` | number \| null | 0–1 | no | KY-038, **relativo, no dB** (#8) |
| `presence` | bool \| null | — | no | PIR |
| `ir_object_c` | number \| null | °C | no | MLX90614 objeto |
| `comfort` | int \| null | 0–100 | sí | índice calculado en el borde |
| `state` | string | — | sí | `OK` (≥ `ok_min`), `REGULAR` (≥ `regular_min`), `ALERT` |
| `params_version` | int | — | sí | versión del config con el que se calculó `comfort`; `0` = valores de fábrica |

Una métrica ausente o `null` = sensor inválido; no se guarda ni se promedia.

## Eventos

Campos comunes: `v`, `event`, `event_id` (string único por nodo, p.ej. `"{device}-{uptime_ms}"`), `device`, `room`, `session_id`, `ts` (igual que telemetría), `uptime_ms`.

```json
{"v":1,"event":"SESSION_STARTED","event_id":"esp32-a101-1200","device":"esp32-a101","room":"a101","session_id":"a101-20261014T140000Z","ts":"2026-10-14T14:00:00Z","uptime_ms":1200,"course":"CS5055"}
```

`course` es opcional (string \| null); permite al backend aplicar el baseline de esa clase.

```json
{"v":1,"event":"ATTENDANCE_RECORDED","event_id":"esp32-a101-90412","device":"esp32-a101","room":"a101","session_id":"a101-20261014T140000Z","ts":"2026-10-14T14:01:30Z","uptime_ms":90412,
 "credential":{"type":"android_hce","token":"9F2C4A01B7E35D6688C1F0A2B4D6E8F0"}}
```

```json
{"v":1,"event":"SESSION_ENDED","event_id":"esp32-a101-5400300","device":"esp32-a101","room":"a101","session_id":"a101-20261014T140000Z","ts":"2026-10-14T15:30:00Z","uptime_ms":5400300}
```

### Credencial

| `credential.type` | `credential.token` |
|---|---|
| `nfc_card_uid` | UID de la tarjeta ISO14443A en HEX **mayúsculas**, sin separadores (4, 7 o 10 bytes → 8, 14 o 20 caracteres) |
| `android_hce` | 16 bytes del GET_CREDENTIAL en HEX mayúsculas (32 caracteres) |

- Nunca se llama `uid` al identificador genérico; `type` es obligatorio.
- Un UID de 4 bytes que empieza con `08` es aleatorio (teléfono): **no se emite**.
- El token no contiene PII. El backend resuelve `credential → student`; la asistencia es única por `(session_id, student_id)`.

`session_id` lo genera el nodo al pulsar inicio: `{room}-{YYYYMMDDTHHMMSSZ}` si hay NTP, si no `{room}-u{uptime_ms}`.

## Config de confort (retenido)

```json
{
  "v": 1,
  "params_version": 4,
  "room": "a101",
  "temp_c": [21.6, 26.6],
  "rh_pct": [40, 60],
  "lux": [300, 500],
  "noise_rel_max": 0.42,
  "weights": {"temp": 0.35, "rh": 0.20, "lux": 0.20, "noise": 0.25},
  "ok_min": 80,
  "regular_min": 60,
  "source": {"temp": "ashrae55_adaptive", "noise": "baseline_p90", "lux": "en12464"}
}
```

- Rangos `[min, max]` = zona de puntuación 100. Fuera del rango, la puntuación cae linealmente a 0 a una distancia igual al ancho del rango (temperatura: 0 a ±3 °C fuera).
- `noise_rel_max`: hasta ese valor S_R = 100; cae linealmente a 0 en `noise_rel_max + 0.3`.
- Pesos suman 1. El ESP32 guarda el último config válido en NVS y lo usa sin red. Un config con `v` distinto o campos faltantes se ignora.
- Valores de fábrica (`params_version: 0`): temp `[21, 24]`, rh `[40, 60]`, lux `[300, 500]`, `noise_rel_max 0.5`, pesos de #25, `ok_min 80`, `regular_min 60`.

## Status

Texto plano `online` (publicado al conectar, retenido) y `offline` (Last Will, retenido).

## APDU HCE v0.1 (#70)

- AID `F0434C4153534149` (`F0` + "CLASSAI").
- SELECT: `00 A4 04 00 08 F0 43 4C 41 53 53 41 49 00` → `90 00`.
- GET_CREDENTIAL: `80 CA 00 00 11` → `01 ‖ token[16] ‖ 90 00` (19 bytes).
- Errores: `69 85` sin credencial, `67 00` longitud/formato, `6D 00` INS no soportado, `6A 82` AID desconocido.
- El SELECT también se acepta sin el `Le` final (13 bytes). GET_CREDENTIAL sin SELECT previo → `69 85`.
- Lector: si el SELECT responde algo distinto de `90 00`, un UID de 4 bytes se ignora (teléfono sin ClassAI); un UID de 7/10 bytes se trata como tarjeta física ISO-DEP (p.ej. DESFire) → `nfc_card_uid`.
- Limitación Adafruit PN532 1.3.4: UIDs de 10 bytes llegan truncados; en la práctica las tarjetas del curso son de 4 o 7 bytes.


## Enrolamiento móvil local (HTTP)

`POST /mobile/enroll` acepta código y token; `full_name` es opcional por compatibilidad
con APK anteriores. El nombre siempre procede del padrón del servidor. Reintentar mismo
student_code y token android_hce activo devuelve 200 y el mismo credential_id,
sin crear otra fila ni renombrar el estudiante. Otro token activo del estudiante
y un token revocado devuelven 409; no se reactivan por reintento. Cambiar servidor
en Android conserva token/perfil pero invalida la vinculación hasta comprobar el
nuevo destino. La lectura APDU no confirma persistencia: consultar attendance de
la sesión. El perfil NFC_ONLY usa los eventos classai/v1 existentes, sin ACK nuevo.

## Extensión multinodo v1 · acceso/ambiente/asistente

Compatible con los tópicos legados anteriores. Nuevos nodos usan identidad
estable `{room}-{role}`, con role `access`, `environment` o `assistant`; room
hasta32caracteres y device hasta64. Una instancia de cada rol por aula. No usar
MAC ni credenciales físicas como identificador público. ACL liga usuario a tópicos.

| Tópico relativo a `classai/v1/{room}` | Emisor | Retain | Función |
|---|---|---|---|
|`nodes/{device}/telemetry`| nodo |no| Medición por zona, cada5s |
|`nodes/{device}/status`| nodo/LWT |sí| JSON v1/room/device/role/status online u offline |
|`nodes/{device}/commands`| acceso |no| Solicitud start/stop idempotente |
|`nodes/{device}/events`| acceso |no| ATTENDANCE_RECORDED existente |
|`nodes/{device}/ack`| ingesta |no| Resultado posterior al commit |
|`nodes/{device}/snapshot`| ingesta |sí| Última lectura y estado persistidos por dispositivo |
|`session`| ingesta |sí| Sesión compartida y revisión monotónica |
|`confirmed`| ingesta |no| Evento persistido, sin credential/token; aceptado o rechazo |

PubSubClient mantiene publicación QoS0, también con cola persistente. Backend
publica QoS1; los eventos se reintentan hasta ACK. No confundir ACK MQTT,
`stored:true` y `accepted:true`: el primero no demuestra SQLite, el segundo
confirma persistencia incluso de un rechazo y el tercero acepta la asistencia.

Telemetría conserva v/device/room/session_id/ts/uptime_ms y añade `role`.
Ambiente es la única autoridad de temp_c/rh_pct/noise_rel/comfort/state; acceso
y asistente envían comfort:null. Solo ambiente alimenta las métricas comunes
de presencia/confort. Luz relativa de cada nodo se conserva por device:
`light_rel` número0..1 o null. ADC35/4095 con divisor orientado para subir al
iluminar; no es lux, porcentaje de iluminancia ni comparación calibrada entre
unidades. Todos estos perfiles envían lux:null. Su peso queda fuera del confort
hasta calibración explícita. Fan publica `fan_on` real y `fan_enabled`; el
asistente añade `agent_online`, `voice_state` y `audio_error`.

Snapshot: `{v,room,device,role,status,status_at,received_at,telemetry}`. received_at
es la recepción de la última medición, no la del LWT. Un offline conserva esa
medición. REST `GET /rooms/{room}/nodes` añade stale=true si no hay medición o
supera15s. La web vuelve a calcular antigüedad aunque el broker siga disponible.
SSE añade `node` por dispositivo y `session`; replay conserva todos los nodos,
no solo el último del aula. GET /classes/current usa ambiente para la lectura
principal. Los consumidores legados siguen aceptando tópicos v1 anteriores.

### Sesión autoritativa

Ejemplo comando: `{v:1,room:"a101",device:"a101-access",role:"access",
request_id:"a101-access-3-r1",action:"start"}`. Stop añade `session_id` esperado.
No existe toggle remoto. request_id se conserva en SQLite: repetirlo devuelve
el mismo ACK sin repetir ni invertir la acción, incluso después de reiniciar.
Start solo se acepta sin otra sesión multinodo abierta; stop solo si coincide
la sesión vigente. Un rechazo también es idempotente.

Después del commit se publica session retenida:
`{v:1,room:"a101",revision:1,session_id:"a101-<uuid>",course:null,started_at:"…"}`.
Al cerrar, session_id:null y revision aumenta. El backend reconstruye el
retenido desde SQLite tras reconectar. SQLite es la autoridad, no el retenido
que sobreviva por casualidad en el broker. No operar un emisor legado de
SESSION_STARTED y la nueva coordinación simultáneamente sobre la misma aula;
migrar cuando no exista clase abierta.

ACK comando incluye request_id/stored/accepted; ACK asistencia incluye
event_id/stored/accepted/reason y destino device/room/v. Solo después de ACK
stored:true se borra su archivo de outbox. Reenvíos con igual event_id deben
conservar payload; reutilizarlo con otro contenido se rechaza. Credencial,
sesión desconocida/cerrada o token revocado producen accepted:false. No se
publica token ni audio en snapshots/confirmed. Una sesión de otra aula no se
puede usar para registrar asistencia.

### Audio activado

El agente local procesa continuamente el PCM del USB; solo envía tras palabra
de activación `POST /assistant/voice`, Content-Type audio/wav, `X-Voice-Key`
comparado con VOICE_API_KEY. WAV monoPCM16/16kHz entre0,1y15s, cuerpo limitado a
480128bytes. Respuesta WAV y Cache-Control:no-store. Falta de configuración503,
clave incorrecta401, audio inválido400, cuerpo excesivo413, fallo de voz502.
La transcripción llama al mismo asistente textual configurado; sin proveedor
LLM configurado conserva503. Pruebas no hacen llamadas pagadas.

Worker opcional privado: POST /transcribe recibe WAV y devuelve `{text}`;
POST /synthesize recibe `{text}` y devuelve WAV. El perfil de despliegue usa
faster-whisper con modelo local y espeak-ng español; no expone su puerto a
Internet ni descarga modelos al iniciar. El agente remuestrea a32kHz para el
amplificador. Palabra inicial preentrenada, no reconocimiento de «ClassAI».
