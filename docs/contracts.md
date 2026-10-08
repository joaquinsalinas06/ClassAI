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

QoS 0 en telemetría: una lectura perdida se reemplaza en 5 s. QoS 1 en eventos: la asistencia no se puede perder; el backend deduplica por `event_id`.

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
