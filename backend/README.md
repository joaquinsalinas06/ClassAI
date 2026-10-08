# MLX90614 Monitor

Proyecto Python para recibir lecturas MLX90614 por MQTT, guardarlas agregadas por minuto UTC en SQLite y visualizarlas en un dashboard Streamlit.

## Arquitectura

```text
ESP32 + MLX90614
        |
        | MQTT: MLX90614/temperature
        v
Mosquitto del host Linux :1883
        |
        +--> Contenedor mlx90614-backend
        |       |
        |       v
        |   SQLite persistente: ./data/mlx90614.db
        |
        +--> Contenedor mlx90614-dashboard
                |
                v
            Dashboard Streamlit
        |
        +--> Contenedor mlx90614-api
                |
                v
            API FastAPI de solo lectura
```

Mosquitto no forma parte de Docker Compose. Debe ejecutarse como servicio del host Linux. El backend es el único proceso que escribe SQLite: el dashboard se suscribe a MQTT para las lecturas instantáneas y solo lee el histórico agregado.

Los mensajes MQTT deben tener este formato:

```json
{"ambient": 28.31, "object": 27.85}
```

## ClassAI v1: ingesta multi-sensor

`backend.py` además del tópico legado (`MQTT_TOPIC`) se suscribe a `classai/v1/+/telemetry`, `classai/v1/+/events` y `classai/v1/+/status` (contrato en `docs/contracts.md`). Al arrancar aplica `schema.sql` (idempotente).

- Telemetría → `readings_raw` (se purga lo de más de 7 días, cada hora) y resúmenes por minuto en formato largo en `sensor_minutes` (una fila por device, métrica y minuto; si el proceso se reinicia dentro de un minuto, se combina ponderando por muestras).
- Legado `MLX90614/temperature` → sigue escribiendo `temperature_minutes` (dashboard y `/temperature/*`) y además `sensor_minutes` con `room = legacy`, `device = mlx90614-legacy`, métricas `temp_c` e `ir_object_c`.
- Eventos → `events` (un `event_id` repetido se ignora). `SESSION_STARTED` crea la sesión y llama a `tuner.on_session_started` (si el tuner falla, la ingesta sigue). `ATTENDANCE_RECORDED` resuelve credencial → estudiante; lo rechazado va a `attendance_rejections` con su motivo. `SESSION_ENDED` cierra la sesión y materializa `session_summaries`.
- Un payload inválido se registra en el log y se descarta; nunca detiene el proceso.

Datos históricos del MLX90614 (una sola vez, idempotente; requiere haber arrancado `backend.py` antes):

```bash
python -c "import sqlite3; sqlite3.connect('data/mlx90614.db').executescript(open('migrate_legacy.sql').read())"
```

### Simulador

`sim_publisher.py` imita un ESP32: status, `SESSION_STARTED` (CS5055), telemetría con ruido, 4 lecturas de asistencia (tarjeta, teléfono, el mismo estudiante con su otra credencial y un token desconocido) y `SESSION_ENDED`.

```bash
python sim_publisher.py --seed-students   # enrola las credenciales simuladas en DATABASE_PATH
python sim_publisher.py --host 127.0.0.1 --port 1883 --room a101 --duration 120 --interval 5
```

Resultado esperado: 1 sesión, 2 asistencias, 1 rechazo `unknown_credential` y su fila en `session_summaries`.

### Endpoints de clases y credenciales

```bash
curl "http://127.0.0.1:8000/classes/current?room=a101"
curl "http://127.0.0.1:8000/sessions?room=a101&course=CS5055"
curl "http://127.0.0.1:8000/sessions/<session_id>/summary"
curl "http://127.0.0.1:8000/sessions/<session_id>/series?metric=temp_c&bucket_minutes=5"
curl "http://127.0.0.1:8000/sessions/<session_id>/attendance"   # código y nombre, nunca tokens
curl "http://127.0.0.1:8000/sessions/compare?ids=<id1>&ids=<id2>"
```

Enrolar y revocar credenciales requiere `ADMIN_API_KEY` en `.env` y el header `X-API-Key`:

```bash
curl -X POST http://127.0.0.1:8000/credentials -H "X-API-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"student_code":"20201001","full_name":"Ana Torres","type":"nfc_card_uid","token":"04A1B2C3D4E5F6"}'
curl -X POST http://127.0.0.1:8000/credentials/1/revoke -H "X-API-Key: $ADMIN_API_KEY"
```

### Pruebas

```bash
python -m pytest tests
```

### Firmware (`firmware/classai_node`)

Copia `secrets.example.h` a `secrets.h` (ignorado por git) con WiFi, broker y `ROOM_ID`. Los sensores se activan con los `#define USE_*` y todos los pines están en un solo bloque del `.ino`. Librerías: Adafruit MLX90614, PubSubClient, ArduinoJson 7, DHT sensor library, BH1750 (claws), Adafruit PN532, Adafruit BusIO.

PubSubClient solo publica con QoS 0: los eventos esperan en una cola en RAM (32) y se envían cuando hay conexión; el backend deduplica por `event_id` (`{device}-{arranque}-{uptime_ms}`). El config de confort recibido se valida, se guarda en NVS y se usa sin red.

## Desarrollo local

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python backend.py
```

En otra terminal, con el mismo entorno virtual activo:

```bash
streamlit run dashboard.py
```

Edita `.env` con las credenciales, hosts e IDs MQTT de tu entorno. No se versiona. `MQTT_CLIENT_ID` y `MQTT_DASHBOARD_CLIENT_ID` deben ser distintos.

## Levantar servicios en Linux

```bash
git clone <repository-url>
cd MLX90614-db
cp .env.example .env
nano .env
docker compose up -d --build
```

`compose.yaml` usa `network_mode: host`, pensado para Docker en Linux. Así, `MQTT_HOST=127.0.0.1` desde ambos contenedores llega a Mosquitto ejecutándose en el host Linux por el puerto 1883. No se publican puertos Docker.

Por defecto Streamlit escucha en `DASHBOARD_HOST=127.0.0.1`, de modo que no queda expuesto públicamente. Si más adelante instalas Nginx o un reverse proxy, cambia conscientemente esta variable a `0.0.0.0` y aplica las reglas de acceso del proxy. No uses esta configuración de red como sustituto de la configuración de host en Docker Desktop para macOS o Windows.

## Estado y logs

Estado de ambos servicios:

```bash
docker compose ps
```

Logs del backend:

```bash
docker compose logs -f mlx90614-backend
```

Logs del dashboard:

```bash
docker compose logs -f mlx90614-dashboard
```

## API

La API consulta SQLite en modo solo lectura. No acepta SQL arbitrario y usa cálculos ponderados por `samples` para los promedios. Las fechas sin zona horaria se interpretan con `LOCAL_TIMEZONE`, que en la configuración de ejemplo es `America/Lima`.

Levantar todos los servicios:

```bash
docker compose up -d --build
```

Logs de la API:

```bash
docker compose logs -f mlx90614-api
```

Health:

```bash
curl http://127.0.0.1:8000/health
```

Último minuto disponible:

```bash
curl http://127.0.0.1:8000/temperature/latest
```

Estadísticas ponderadas de un rango local:

```bash
curl "http://127.0.0.1:8000/temperature/stats?start=2026-10-07T01:00:00&end=2026-10-07T01:10:00"
```

Resumen de un día local:

```bash
curl "http://127.0.0.1:8000/temperature/daily-summary?date=2026-10-07"
```

Swagger está disponible en [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

Para acceder temporalmente desde tu Mac sin exponer la API públicamente:

```bash
ssh -L 8000:127.0.0.1:8000 programador@13.140.187.142
```

Luego abre [http://localhost:8000/docs](http://localhost:8000/docs).

## Chatbot local con DeepSeek

El chatbot se ejecuta únicamente en tu Mac. Guarda la clave de DeepSeek y el historial local en archivos ignorados por Git:

```bash
cp .env.chatbot.example .env.chatbot
nano .env.chatbot
```

Configura `DEEPSEEK_API_KEY` y la URL pública o mediante túnel SSH de la API de temperatura. Después, en tu entorno virtual local:

```bash
pip install -r requirements.txt
streamlit run chatbot.py --server.address 127.0.0.1 --server.port 8502
```

Abre [http://localhost:8502](http://localhost:8502). Las conversaciones se guardan localmente en `data/chatbot.db`; el chatbot solo realiza peticiones GET a los endpoints permitidos de temperatura y no consulta SQLite del servidor de forma directa.

## Acceso seguro al dashboard

Desde tu Mac, crea un túnel SSH hacia el puerto local del servidor:

```bash
ssh -L 8501:127.0.0.1:8501 programador@13.140.187.142
```

Después abre [http://localhost:8501](http://localhost:8501).

## Operación

Detener los servicios:

```bash
docker compose down
```

Actualizar desde GitHub:

```bash
git pull
docker compose up -d --build
```

## Verificar SQLite

La base persistente se encuentra en `data/mlx90614.db`. Si `sqlite3` está instalado en el servidor:

```bash
sqlite3 data/mlx90614.db
SELECT * FROM temperature_minutes ORDER BY id DESC LIMIT 10;
```

## Prueba MQTT

Publica una lectura de prueba desde el servidor Linux:

```bash
mosquitto_pub \
  -h 127.0.0.1 \
  -p 1883 \
  -t 'MLX90614/temperature' \
  -m '{"ambient":28.31,"object":27.85}'
```

Comprueba que ambos procesos reciban la lectura con:

```bash
docker compose logs -f mlx90614-backend mlx90614-dashboard
```
