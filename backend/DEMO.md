# Demo completa (local)

Broker + histórico sembrado + ingesta + API + simulador en vivo + dashboard web.
Cada proceso en su propia terminal, todas desde `backend/` y con las mismas variables:

```bash
cd backend
source .venv/bin/activate
export MQTT_HOST=127.0.0.1 MQTT_PORT=1883 MQTT_TOPIC=MLX90614/temperature MQTT_CLIENT_ID=classai-ingest \
       DATABASE_PATH=data/demo.db LOCAL_TIMEZONE=America/Lima
```

| # | Proceso | Comando |
|---|---|---|
| 1 | Mosquitto | `mosquitto -p 1883` (Homebrew: `/opt/homebrew/sbin/mosquitto -p 1883`) |
| 2 | Histórico (una vez, ~2 s) | `python seed_demo.py --db data/demo.db --reset` |
| 3 | Ingesta | `python backend.py` |
| 4 | API | `uvicorn api:app --host 127.0.0.1 --port 8000 --timeout-graceful-shutdown 3` |
| 5 | Aula en vivo | `python sim_publisher.py --room a101 --course CS5055 --duration 0 --interval 5 --db data/demo.db` |
| 6 | Web | `cd ../web && pnpm install && pnpm dev` → <http://localhost:5173> (proxy `/api` → `CLASSAI_API`, por defecto `http://127.0.0.1:8000`) |

- `seed_demo.py` crea 3 aulas con coordenadas (a101 Lima, b204 Cusco, c305 Iquitos), 25 estudiantes con tarjeta
  y/o HCE, ~3 semanas de clases (CS5055, MA2001, EF1001 y HU3002 nocturno) con minutos de sensores, configs de
  confort, asistencia (tardanzas, duplicados, rechazos), feedback y `session_summaries`. Es determinista; sin
  `--reset` se niega a escribir en una base con datos. Las clases que aún no terminaron hoy se omiten.
- `--duration 0` deja la sesión abierta hasta Ctrl+C (envía `SESSION_ENDED` al salir). Con `--db` parte de los
  valores promedio del aula y hace taps NFC con credenciales sembradas (+ una desconocida). Otra aula en paralelo:
  `--room b204 --course EF1001`.
- `--timeout-graceful-shutdown`: `/live` mantiene conexiones abiertas; sin él uvicorn espera a que se cierren.
- Asistente (`POST /assistant/ask`): `DEEPSEEK_API_KEY` y `DEEPSEEK_MODEL` (y opcional `LLM_BASE_URL`) en el
  entorno o en `backend/.env.chatbot`. Sin ellas responde 503. Las herramientas consultan
  `TEMPERATURE_API_BASE_URL` (por defecto `http://127.0.0.1:$API_PORT`, o sea la misma API).
- El tuner consulta Open-Meteo al iniciar la sesión en vivo; sin internet usa `[21, 24]`.

Comprobar:

```bash
curl -N http://127.0.0.1:8000/live/a101      # status, config y telemetry al conectar; luego event/telemetry; ": ping" cada 15 s
curl http://127.0.0.1:8000/rooms
curl "http://127.0.0.1:8000/sessions?room=b204&limit=5"
curl -X POST http://127.0.0.1:8000/assistant/ask -H "Content-Type: application/json" \
  -d '{"question":"¿Qué clase hay ahora en la a101?","history":[]}'
```
