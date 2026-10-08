"""Datos en vivo para el dashboard web: GET /live/{room} (Server-Sent Events) y GET /rooms.

Un solo cliente MQTT por proceso de la API escucha classai/v1/+/{telemetry,events,config,status}
y reparte cada mensaje a las colas asyncio de las conexiones SSE de esa aula.
"""

import asyncio
import json
import os
import re
import sqlite3
from collections import deque
from contextlib import asynccontextmanager, closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from fastapi import Path as PathParam
from fastapi.responses import StreamingResponse

from temperature_service import (
    ConfigurationError,
    DatabaseTemporarilyUnavailableError,
    TemperatureService,
    iso_utc,
    normalize_credential,
)


ROOM_PATTERN = r"^[a-z0-9-]+$"
TOPICS = [(f"classai/v1/+/{kind}", 1) for kind in ("telemetry", "events", "config", "status")]
TOPIC_PATTERN = re.compile(r"^classai/v1/([a-z0-9-]+)/(telemetry|events|config|status)$")
QUEUE_SIZE = 100
PING_SECONDS = 15
REPLAY_ORDER = ("status", "config", "telemetry")  # lo último conocido del aula, al conectar


def lookup_credential(database_path: Optional[str], credential: object) -> dict:
    """{'student': {code, full_name}} o {'rejected': {reason}}; lectura con mode=ro."""
    try:
        credential_type, token = normalize_credential(
            credential.get("type") if isinstance(credential, dict) else None,
            credential.get("token") if isinstance(credential, dict) else None,
        )
    except ValueError:
        return {"rejected": {"reason": "unknown_credential"}}
    row = None
    if database_path and Path(database_path).exists():
        try:
            uri = Path(database_path).resolve().as_uri() + "?mode=ro"
            with closing(sqlite3.connect(uri, uri=True, timeout=5)) as connection:
                row = connection.execute(
                    "SELECT st.code, st.full_name, c.active FROM credentials c "
                    "JOIN students st ON st.id = c.student_id WHERE c.type = ? AND c.token = ? "
                    "ORDER BY c.active DESC, c.id DESC LIMIT 1",
                    (credential_type, token),
                ).fetchone()
        except sqlite3.Error as error:
            print(f"Live: no se pudo resolver la credencial: {error}")
    if row is None:
        return {"rejected": {"reason": "unknown_credential"}}
    if not row[2]:
        return {"rejected": {"reason": "revoked_credential"}}
    return {"student": {"code": row[0], "full_name": row[1]}}


def to_sse(topic: str, payload: bytes, database_path: Optional[str], received: datetime) -> Optional[tuple[str, str, dict]]:
    """Mensaje MQTT -> (room, nombre del evento SSE, datos) o None si no se reenvía."""
    match = TOPIC_PATTERN.match(topic)
    if match is None:
        return None
    room, kind = match.groups()
    text = payload.decode("utf-8", "replace").strip()
    if kind == "status":
        return (room, "status", {"room": room, "status": text}) if text in ("online", "offline") else None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    if kind == "config":
        return room, "config", data
    data = {**data, "received_at": iso_utc(received)}
    if kind == "telemetry":
        return room, "telemetry", data
    if data.get("event") == "ATTENDANCE_RECORDED":
        credential = data.pop("credential", None)  # el token nunca sale de la API
        return room, "event", {**data, **lookup_credential(database_path, credential)}
    if data.get("event") in ("SESSION_STARTED", "SESSION_ENDED"):
        return room, "event", data
    return None


class Hub:
    """Colas por conexión, filtradas por aula, y caché de lo último por aula. Solo se usa desde el loop."""

    def __init__(self) -> None:
        self.queues: dict[str, set[asyncio.Queue]] = {}
        self.cache: dict[str, dict[str, dict]] = {}
        self.seen_events: deque[str] = deque(maxlen=500)  # reenvíos QoS 1 del mismo event_id

    def publish(self, room: str, name: str, data: dict) -> None:
        if name == "event":
            if data.get("event_id") in self.seen_events:
                return
            self.seen_events.append(data.get("event_id"))
        else:
            self.cache.setdefault(room, {})[name] = data
        for queue in self.queues.get(room, ()):
            if queue.full():
                queue.get_nowait()  # cliente lento: se descarta lo más viejo
            queue.put_nowait((name, data))

    def subscribe(self, room: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_SIZE)
        cached = self.cache.get(room, {})
        for name in REPLAY_ORDER:
            if name in cached:
                queue.put_nowait((name, cached[name]))
        self.queues.setdefault(room, set()).add(queue)
        return queue

    def unsubscribe(self, room: str, queue: asyncio.Queue) -> None:
        queues = self.queues.get(room, set())
        queues.discard(queue)
        if not queues:
            self.queues.pop(room, None)


hub = Hub()
_client: Optional[mqtt.Client] = None


async def start() -> None:
    """Arranca el suscriptor compartido. Sin broker la API sigue (SSE solo envía pings)."""
    global _client
    load_dotenv()
    loop = asyncio.get_running_loop()
    database_path = os.getenv("DATABASE_PATH")
    host, port = os.getenv("MQTT_HOST", "127.0.0.1"), int(os.getenv("MQTT_PORT", "1883"))
    # El pid en el client id: con varios workers o un reinicio solapado no se expulsan entre sí.
    client_id = f"{os.getenv('MQTT_API_CLIENT_ID', 'classai-api-live')}-{os.getpid()}"
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)
    client.reconnect_delay_set(min_delay=1, max_delay=60)
    if os.getenv("MQTT_USERNAME"):
        client.username_pw_set(os.getenv("MQTT_USERNAME"), os.getenv("MQTT_PASSWORD") or None)

    def on_connect(client, userdata, flags, reason_code, properties) -> None:
        if getattr(reason_code, "is_failure", False):
            print(f"Live: MQTT rechazó la conexión: {reason_code}")
            return
        client.subscribe(TOPICS)
        print(f"Live: MQTT conectado a {host}:{port}")

    def on_connect_fail(client, userdata) -> None:
        print(f"Live: no se pudo conectar a MQTT {host}:{port}; se reintentará")

    def on_message(client, userdata, message) -> None:
        # Hilo de paho: la consulta SQLite se hace aquí; el reparto, en el loop de asyncio.
        try:
            item = to_sse(message.topic, message.payload, database_path, datetime.now(timezone.utc))
        except Exception as error:  # un mensaje raro nunca tumba el suscriptor
            print(f"Live: mensaje ignorado ({message.topic}): {error!r}")
            return
        if item is not None:
            loop.call_soon_threadsafe(hub.publish, *item)

    client.on_connect = on_connect
    client.on_connect_fail = on_connect_fail
    client.on_message = on_message
    try:
        client.connect_async(host, port, keepalive=60)
        client.loop_start()
        _client = client
    except Exception as error:
        print(f"Live: MQTT no disponible ({error!r}); /live solo enviará pings")


async def stop() -> None:
    global _client
    if _client is not None:
        _client.disconnect()
        _client.loop_stop()
        _client = None


@asynccontextmanager
async def lifespan(app):
    await start()
    try:
        yield
    finally:
        await stop()


router = APIRouter(tags=["live"], lifespan=lifespan)


@router.get("/live/{room}", summary="Telemetría, eventos, config y status del aula en vivo (SSE)")
async def live(room: str = PathParam(pattern=ROOM_PATTERN, max_length=32)) -> StreamingResponse:
    async def stream():
        queue = hub.subscribe(room)
        try:
            while True:
                try:
                    name, data = await asyncio.wait_for(queue.get(), PING_SECONDS)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
                    continue
                yield f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False, separators=(',', ':'))}\n\n"
        finally:
            hub.unsubscribe(room, queue)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/rooms", summary="Aulas conocidas con su status, sesión abierta y última telemetría")
def rooms() -> list[dict]:
    try:
        rows = TemperatureService.from_environment().list_rooms()
    except ConfigurationError as error:
        raise HTTPException(status_code=500, detail="La configuración de la API no es válida") from error
    except DatabaseTemporarilyUnavailableError as error:
        raise HTTPException(status_code=503, detail="La base de datos está temporalmente ocupada") from error
    result = []
    for row in rows:
        cached = hub.cache.get(row["id"], {})
        result.append({**row, "status": cached.get("status", {}).get("status"),
                       "last_telemetry": cached.get("telemetry")})
    return result
