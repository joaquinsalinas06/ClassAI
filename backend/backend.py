"""Consume telemetría, eventos y status ClassAI (docs/contracts.md) y el tópico legado MLX90614.

Guarda resúmenes por minuto en SQLite (formato largo en sensor_minutes y, para el legado,
también en temperature_minutes), eventos, sesiones y asistencia.
"""

import json
import math
import os
import re
import signal
import sqlite3
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import paho.mqtt.client as mqtt
from dotenv import load_dotenv

from temperature_service import iso_utc, normalize_credential


SCHEMA_PATH = Path(__file__).with_name("schema.sql")
CLASSAI_TOPICS = ("classai/v1/+/telemetry", "classai/v1/+/events", "classai/v1/+/status")
TOPIC_PATTERN = re.compile(r"^classai/v1/([a-z0-9-]+)/(telemetry|events|status)$")
METRICS = ("temp_c", "rh_pct", "lux", "noise_rel", "presence", "ir_object_c", "comfort")
EVENT_TYPES = ("SESSION_STARTED", "ATTENDANCE_RECORDED", "SESSION_ENDED")
LEGACY_ROOM = "legacy"
LEGACY_DEVICE = "mlx90614-legacy"
RAW_RETENTION = timedelta(days=7)
PURGE_INTERVAL_SECONDS = 3600
# Valores de fábrica del contrato si no hay config guardado para la sesión.
DEFAULT_NOISE_REL_MAX = 0.5
DEFAULT_REGULAR_MIN = 60

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS temperature_minutes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    minute_utc TEXT NOT NULL UNIQUE,
    samples INTEGER NOT NULL,
    ambient_min REAL NOT NULL,
    ambient_max REAL NOT NULL,
    ambient_avg REAL NOT NULL,
    object_min REAL NOT NULL,
    object_max REAL NOT NULL,
    object_avg REAL NOT NULL,
    created_at TEXT NOT NULL
)
"""


@dataclass(frozen=True)
class Settings:
    mqtt_host: str
    mqtt_port: int
    mqtt_topic: str
    mqtt_client_id: str
    mqtt_username: Optional[str]
    mqtt_password: Optional[str]
    database_path: str


@dataclass(frozen=True)
class MinuteSummary:
    minute_utc: str
    samples: int
    ambient_min: float
    ambient_max: float
    ambient_avg: float
    object_min: float
    object_max: float
    object_avg: float


def required_env(name: str) -> str:
    value = os.getenv(name)
    if value is None or not value.strip():
        raise ValueError(f"Falta la variable obligatoria {name} en .env")
    return value.strip()


def load_settings() -> Settings:
    """Carga toda la configuración de .env y valida lo necesario para iniciar."""
    load_dotenv()
    port_text = required_env("MQTT_PORT")
    try:
        mqtt_port = int(port_text)
    except ValueError as error:
        raise ValueError("MQTT_PORT debe ser un número entero") from error
    if not 1 <= mqtt_port <= 65535:
        raise ValueError("MQTT_PORT debe estar entre 1 y 65535")

    return Settings(
        mqtt_host=required_env("MQTT_HOST"),
        mqtt_port=mqtt_port,
        mqtt_topic=required_env("MQTT_TOPIC"),
        mqtt_client_id=required_env("MQTT_CLIENT_ID"),
        mqtt_username=os.getenv("MQTT_USERNAME") or None,
        mqtt_password=os.getenv("MQTT_PASSWORD") or None,
        database_path=required_env("DATABASE_PATH"),
    )


class Database:
    """Conexión SQLite que puede recuperarse de errores temporales."""

    def __init__(self, database_path: str) -> None:
        self.database_path = database_path
        self.connection: Optional[sqlite3.Connection] = None
        self.next_retry_at = 0.0

    def _connect(self) -> sqlite3.Connection:
        if self.connection is not None:
            return self.connection
        database_file = Path(self.database_path)
        if database_file.parent != Path("."):
            database_file.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.database_path, timeout=5, check_same_thread=False)
        connection.execute("PRAGMA busy_timeout = 5000")
        connection.execute(CREATE_TABLE_SQL)
        connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        connection.commit()
        self.connection = connection
        return connection

    def ensure_ready(self) -> bool:
        try:
            self._connect()
            return True
        except (sqlite3.Error, OSError) as error:
            self._handle_error(error)
            return False

    def save_summary(self, summary: MinuteSummary) -> bool:
        """Inserta el resumen o lo combina si el proceso se reinició ese minuto."""
        if time.monotonic() < self.next_retry_at:
            return False
        try:
            connection = self._connect()
            connection.execute(
                """
                INSERT INTO temperature_minutes (
                    minute_utc, samples,
                    ambient_min, ambient_max, ambient_avg,
                    object_min, object_max, object_avg, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(minute_utc) DO UPDATE SET
                    samples = temperature_minutes.samples + excluded.samples,
                    ambient_min = MIN(temperature_minutes.ambient_min, excluded.ambient_min),
                    ambient_max = MAX(temperature_minutes.ambient_max, excluded.ambient_max),
                    ambient_avg = (
                        temperature_minutes.ambient_avg * temperature_minutes.samples
                        + excluded.ambient_avg * excluded.samples
                    ) / (temperature_minutes.samples + excluded.samples),
                    object_min = MIN(temperature_minutes.object_min, excluded.object_min),
                    object_max = MAX(temperature_minutes.object_max, excluded.object_max),
                    object_avg = (
                        temperature_minutes.object_avg * temperature_minutes.samples
                        + excluded.object_avg * excluded.samples
                    ) / (temperature_minutes.samples + excluded.samples)
                """,
                (
                    summary.minute_utc, summary.samples,
                    summary.ambient_min, summary.ambient_max, summary.ambient_avg,
                    summary.object_min, summary.object_max, summary.object_avg,
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            connection.commit()
            return True
        except (sqlite3.Error, OSError) as error:
            if self.connection is not None:
                try:
                    self.connection.rollback()
                except sqlite3.Error:
                    pass
            self._handle_error(error)
            return False

    def write(self, callback):
        """Ejecuta callback(connection) en una transacción.

        Devuelve lo que devuelva callback, False si los datos violan una restricción
        (se descartan) o None si SQLite no está disponible (el llamador reintenta).
        """
        if time.monotonic() < self.next_retry_at:
            return None
        try:
            connection = self._connect()
            result = callback(connection)
            connection.commit()
            return result
        except (sqlite3.Error, OSError) as error:
            if self.connection is not None:
                try:
                    self.connection.rollback()
                except sqlite3.Error:
                    pass
            if isinstance(error, sqlite3.IntegrityError):
                print(f"Datos descartados por restricción de SQLite: {error}")
                return False
            self._handle_error(error)
            return None

    def _handle_error(self, error: Exception) -> None:
        print(f"Error de SQLite: {error}. Se reintentará en 5 segundos.")
        self.close()
        self.next_retry_at = time.monotonic() + 5

    def close(self) -> None:
        if self.connection is not None:
            try:
                self.connection.close()
            except sqlite3.Error as error:
                print(f"Error al cerrar SQLite: {error}")
            finally:
                self.connection = None


class MinuteAccumulator:
    """Agrupa muestras UTC en memoria y entrega un resumen terminado por minuto."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.current_minute: Optional[datetime] = None
        self.samples = 0
        self.ambient_sum = 0.0
        self.ambient_min: Optional[float] = None
        self.ambient_max: Optional[float] = None
        self.object_sum = 0.0
        self.object_min: Optional[float] = None
        self.object_max: Optional[float] = None
        self.pending: list[MinuteSummary] = []

    def add(self, ambient: float, object_temperature: float, observed_at: datetime) -> None:
        minute = observed_at.replace(second=0, microsecond=0)
        with self.lock:
            if self.current_minute is None:
                self._reset(minute)
            elif minute != self.current_minute:
                self._queue_current()
                self._reset(minute)
            self.samples += 1
            self.ambient_sum += ambient
            self.object_sum += object_temperature
            self.ambient_min = ambient if self.ambient_min is None else min(self.ambient_min, ambient)
            self.ambient_max = ambient if self.ambient_max is None else max(self.ambient_max, ambient)
            self.object_min = object_temperature if self.object_min is None else min(self.object_min, object_temperature)
            self.object_max = object_temperature if self.object_max is None else max(self.object_max, object_temperature)

    def finish_expired(self, now: datetime) -> None:
        with self.lock:
            if self.current_minute is not None and now >= self.current_minute + timedelta(minutes=1):
                self._queue_current()
                self._reset(None)

    def finish_current(self) -> None:
        with self.lock:
            self._queue_current()
            self._reset(None)

    def take_pending(self) -> list[MinuteSummary]:
        with self.lock:
            pending, self.pending = self.pending, []
            return pending

    def restore_pending(self, summaries: list[MinuteSummary]) -> None:
        with self.lock:
            self.pending = summaries + self.pending

    def _queue_current(self) -> None:
        if self.current_minute is None or self.samples == 0:
            return
        assert self.ambient_min is not None and self.ambient_max is not None
        assert self.object_min is not None and self.object_max is not None
        self.pending.append(MinuteSummary(
            minute_utc=self.current_minute.strftime("%Y-%m-%d %H:%M"),
            samples=self.samples,
            ambient_min=self.ambient_min,
            ambient_max=self.ambient_max,
            ambient_avg=self.ambient_sum / self.samples,
            object_min=self.object_min,
            object_max=self.object_max,
            object_avg=self.object_sum / self.samples,
        ))

    def _reset(self, minute: Optional[datetime]) -> None:
        self.current_minute = minute
        self.samples = 0
        self.ambient_sum = 0.0
        self.ambient_min = None
        self.ambient_max = None
        self.object_sum = 0.0
        self.object_min = None
        self.object_max = None


@dataclass(frozen=True)
class SensorMinute:
    room: str
    device: str
    metric: str
    minute_utc: str
    samples: int
    min: float
    max: float
    avg: float


class SensorMinuteAccumulator:
    """Como MinuteAccumulator, pero en formato largo: un resumen por (device, métrica, minuto UTC)."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        # (room, device, metric, minute) -> [samples, suma, min, max]
        self.buckets: dict[tuple[str, str, str, datetime], list[float]] = {}
        self.pending: list[SensorMinute] = []

    def add(self, room: str, device: str, values: dict[str, float], observed_at: datetime) -> None:
        minute = observed_at.replace(second=0, microsecond=0)
        with self.lock:
            for metric, value in values.items():
                bucket = self.buckets.get((room, device, metric, minute))
                if bucket is None:
                    self.buckets[(room, device, metric, minute)] = [1, value, value, value]
                else:
                    bucket[0] += 1
                    bucket[1] += value
                    bucket[2] = min(bucket[2], value)
                    bucket[3] = max(bucket[3], value)

    def finish_expired(self, now: datetime) -> None:
        self._queue(lambda minute: now >= minute + timedelta(minutes=1))

    def finish_current(self) -> None:
        self._queue(lambda minute: True)

    def take_pending(self) -> list[SensorMinute]:
        with self.lock:
            pending, self.pending = self.pending, []
            return pending

    def restore_pending(self, summaries: list[SensorMinute]) -> None:
        with self.lock:
            self.pending = summaries + self.pending

    def _queue(self, is_finished) -> None:
        with self.lock:
            for key in [key for key in self.buckets if is_finished(key[3])]:
                room, device, metric, minute = key
                samples, total, low, high = self.buckets.pop(key)
                self.pending.append(SensorMinute(
                    room=room, device=device, metric=metric,
                    minute_utc=minute.strftime("%Y-%m-%d %H:%M"),
                    samples=int(samples), min=low, max=high, avg=total / samples,
                ))


def save_sensor_minutes(connection: sqlite3.Connection, summaries: list[SensorMinute]) -> bool:
    """Inserta cada resumen o lo combina ponderando por muestras si el minuto ya existe."""
    connection.executemany(
        """
        INSERT INTO sensor_minutes (room, device, metric, minute_utc, samples, min, max, avg)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(device, metric, minute_utc) DO UPDATE SET
            samples = sensor_minutes.samples + excluded.samples,
            min = MIN(sensor_minutes.min, excluded.min),
            max = MAX(sensor_minutes.max, excluded.max),
            avg = (
                sensor_minutes.avg * sensor_minutes.samples
                + excluded.avg * excluded.samples
            ) / (sensor_minutes.samples + excluded.samples)
        """,
        [
            (s.room, s.device, s.metric, s.minute_utc, s.samples, s.min, s.max, s.avg)
            for s in summaries
        ],
    )
    return True


def flush_sensor_pending(accumulator: SensorMinuteAccumulator, database: Database) -> None:
    summaries = accumulator.take_pending()
    if summaries and database.write(lambda connection: save_sensor_minutes(connection, summaries)) is None:
        accumulator.restore_pending(summaries)


def print_saved(summary: MinuteSummary) -> None:
    print("\n===================================")
    print("MINUTO GUARDADO")
    print("===================================")
    print(f"Minuto UTC: {summary.minute_utc}")
    print(f"Muestras: {summary.samples}")
    print(f"Ambiente: min={summary.ambient_min:.2f} max={summary.ambient_max:.2f} avg={summary.ambient_avg:.2f}")
    print(f"Objeto: min={summary.object_min:.2f} max={summary.object_max:.2f} avg={summary.object_avg:.2f}")
    print("===================================\n")


def flush_pending(accumulator: MinuteAccumulator, database: Database) -> None:
    summaries = accumulator.take_pending()
    for index, summary in enumerate(summaries):
        if database.save_summary(summary):
            print_saved(summary)
        else:
            accumulator.restore_pending(summaries[index:])
            return


def decode_json_object(payload: bytes) -> dict:
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError("payload no es UTF-8") from error
    try:
        data = json.loads(text)
    except json.JSONDecodeError as error:
        raise ValueError("JSON inválido") from error
    if not isinstance(data, dict):
        raise ValueError("el JSON debe ser un objeto")
    return data


def parse_temperature_message(message: mqtt.MQTTMessage, expected_topic: str) -> tuple[float, float]:
    if message.topic != expected_topic:
        raise ValueError(f"topic inesperado: {message.topic!r}")
    data = decode_json_object(message.payload)
    if "ambient" not in data or "object" not in data:
        raise ValueError("faltan los campos ambient y/o object")
    if isinstance(data["ambient"], bool) or isinstance(data["object"], bool):
        raise ValueError("ambient y object deben ser números")
    try:
        ambient = float(data["ambient"])
        object_temperature = float(data["object"])
    except (TypeError, ValueError) as error:
        raise ValueError("ambient y object deben ser números") from error
    if not math.isfinite(ambient) or not math.isfinite(object_temperature):
        raise ValueError("ambient y object deben ser números finitos")
    return ambient, object_temperature


def parse_ts(value: object) -> Optional[str]:
    """ts ISO 8601 del nodo normalizado a UTC; None si falta o no se entiende."""
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return iso_utc(parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc))


def check_common(room: str, data: dict) -> None:
    if type(data.get("v")) is not int or data["v"] != 1:
        raise ValueError("v debe ser 1")
    if not isinstance(data.get("device"), str) or not data["device"]:
        raise ValueError("falta device")
    if data.get("room") != room:
        raise ValueError(f"room {data.get('room')!r} no coincide con el tópico ({room})")


def parse_telemetry(room: str, data: dict) -> tuple[str, Optional[str], dict[str, float]]:
    """Valida la telemetría y devuelve (device, session_id, métricas válidas)."""
    check_common(room, data)
    session_id = data.get("session_id")
    if session_id is not None and not isinstance(session_id, str):
        raise ValueError("session_id debe ser texto o null")
    values: dict[str, float] = {}
    for metric in METRICS:
        value = data.get(metric)
        if value is None:
            continue  # sensor inválido: no se guarda ni se promedia
        if metric == "presence":
            if not isinstance(value, bool):
                raise ValueError("presence debe ser bool o null")
            values[metric] = float(value)
        elif isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"{metric} debe ser un número finito o null")
        else:
            values[metric] = float(value)
    return data["device"], session_id, values


def parse_event(room: str, data: dict) -> dict:
    """Valida los campos comunes de un evento; normaliza ts y course."""
    check_common(room, data)
    if data.get("event") not in EVENT_TYPES:
        raise ValueError(f"event desconocido: {data.get('event')!r}")
    for field in ("event_id", "session_id"):
        if not isinstance(data.get(field), str) or not data[field]:
            raise ValueError(f"falta {field}")
    course = data.get("course")
    return {**data, "ts": parse_ts(data.get("ts")), "course": course if isinstance(course, str) else None}


def minute_key(iso_value: str) -> str:
    return datetime.fromisoformat(iso_value.replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M")


def record_attendance(connection: sqlite3.Connection, event: dict, at: str, received_at: str) -> str:
    """Resuelve credencial -> estudiante (#30). Devuelve el resultado para el log."""
    credential = event.get("credential")
    raw_type = credential.get("type") if isinstance(credential, dict) else None
    raw_token = credential.get("token") if isinstance(credential, dict) else None
    session_id = event["session_id"]

    def reject(reason: str, token: object = raw_token) -> str:
        connection.execute(
            """
            INSERT INTO attendance_rejections (event_id, session_id, credential_type, token, reason, received_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                event["event_id"], session_id,
                raw_type[:32] if isinstance(raw_type, str) else None,
                token[:64] if isinstance(token, str) else None,
                reason, received_at,
            ),
        )
        return reason

    try:
        credential_type, token = normalize_credential(raw_type, raw_token)
    except ValueError:
        return reject("invalid_payload")
    row = connection.execute(
        "SELECT id, student_id, active FROM credentials WHERE type = ? AND token = ? "
        "ORDER BY active DESC, id DESC LIMIT 1",
        (credential_type, token),
    ).fetchone()
    if row is None:
        return reject("unknown_credential", token)
    if not row[2]:
        return reject("revoked_credential", token)
    session = connection.execute("SELECT ended_at FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if session is None:
        return reject("unknown_session", token)
    if session[0] is not None and at > session[0]:
        return reject("closed_session", token)
    cursor = connection.execute(
        "INSERT OR IGNORE INTO attendance (session_id, student_id, credential_id, recorded_at) VALUES (?, ?, ?, ?)",
        (session_id, row[1], row[0], at),
    )
    return "registrada" if cursor.rowcount else "duplicada (mismo estudiante)"


def materialize_session_summary(connection: sqlite3.Connection, session_id: str) -> None:
    session = connection.execute(
        "SELECT room, course, started_at, ended_at, params_version FROM sessions WHERE id = ?",
        (session_id,),
    ).fetchone()
    if session is None or session[3] is None:
        return
    room, course, started_at, ended_at, params_version = session
    params = connection.execute(
        "SELECT json_extract(payload, '$.noise_rel_max'), json_extract(payload, '$.regular_min') "
        "FROM comfort_params WHERE room = ? AND params_version = ?",
        (room, params_version),
    ).fetchone()
    noise_rel_max = params[0] if params and params[0] is not None else DEFAULT_NOISE_REL_MAX
    regular_min = params[1] if params and params[1] is not None else DEFAULT_REGULAR_MIN
    rows = connection.execute(
        """
        SELECT metric,
               SUM(avg * samples) / SUM(samples), MIN(min), MAX(max),
               COUNT(DISTINCT CASE WHEN metric = 'noise_rel' AND avg > ? THEN minute_utc END),
               COUNT(DISTINCT CASE WHEN metric = 'comfort' AND avg < ? THEN minute_utc END)
        FROM sensor_minutes
        WHERE room = ? AND minute_utc >= ? AND minute_utc <= ?
        GROUP BY metric
        """,
        (noise_rel_max, regular_min, room, minute_key(started_at), minute_key(ended_at)),
    ).fetchall()
    stats = {row[0]: row[1:] for row in rows}
    empty = (None, None, None, None, None)
    temp, rh, lux = stats.get("temp_c", empty), stats.get("rh_pct", empty), stats.get("lux", empty)
    noise, presence, comfort = stats.get("noise_rel", empty), stats.get("presence", empty), stats.get("comfort", empty)
    duration = datetime.fromisoformat(ended_at.replace("Z", "+00:00")) - datetime.fromisoformat(
        started_at.replace("Z", "+00:00")
    )
    attendance_count = connection.execute(
        "SELECT COUNT(*) FROM attendance WHERE session_id = ?", (session_id,)
    ).fetchone()[0]
    connection.execute(
        """
        INSERT OR REPLACE INTO session_summaries (
            session_id, room, course, started_at, ended_at, minutes,
            temp_avg, temp_min, temp_max, rh_avg, lux_avg, noise_avg, noise_high_minutes,
            presence_ratio, comfort_avg, comfort_min, alert_minutes, attendance_count, params_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            session_id, room, course, started_at, ended_at, round(duration.total_seconds() / 60),
            temp[0], temp[1], temp[2], rh[0], lux[0], noise[0],
            noise[3] if "noise_rel" in stats else None,
            presence[0], comfort[0], comfort[1],
            comfort[4] if "comfort" in stats else None,
            attendance_count, params_version,
        ),
    )


def store_event(connection: sqlite3.Connection, event: dict, payload_text: str, received_at: str) -> str:
    """Guarda y aplica un evento ya validado; un event_id repetido (reenvío QoS 1) se ignora."""
    cursor = connection.execute(
        "INSERT OR IGNORE INTO events (event_id, event, room, device, session_id, received_at, payload) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (event["event_id"], event["event"], event["room"], event["device"], event["session_id"], received_at, payload_text),
    )
    if cursor.rowcount == 0:
        return "duplicado, ignorado"
    at = event["ts"] or received_at
    session_id = event["session_id"]
    if event["event"] == "SESSION_STARTED":
        connection.execute(
            "INSERT OR IGNORE INTO sessions (id, room, device, course, started_at) VALUES (?, ?, ?, ?, ?)",
            (session_id, event["room"], event["device"], event["course"], at),
        )
        return "sesión iniciada"
    if event["event"] == "ATTENDANCE_RECORDED":
        return f"asistencia {record_attendance(connection, event, at, received_at)}"
    connection.execute("UPDATE sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL", (at, session_id))
    if connection.execute("SELECT 1 FROM sessions WHERE id = ?", (session_id,)).fetchone() is None:
        return "fin de sesión desconocida"
    materialize_session_summary(connection, session_id)
    return "sesión finalizada y resumida"


def link_params_version(connection: sqlite3.Connection, room: str, session_id: str) -> bool:
    """La sesión usa el último config publicado del aula (0 = valores de fábrica)."""
    connection.execute(
        "UPDATE sessions SET params_version = COALESCE("
        "(SELECT MAX(params_version) FROM comfort_params WHERE room = ?), 0) "
        "WHERE id = ? AND params_version IS NULL",
        (room, session_id),
    )
    return True


def notify_tuner(database: Database, client: mqtt.Client, room: str, session_id: str, course: Optional[str]) -> None:
    """El tuner publica el config retenido; si falla, la ingesta sigue igual."""
    # ponytail: llamada síncrona; si el tuner tarda (red/modelo) los mensajes esperan en la cola.
    try:
        import tuner

        tuner.on_session_started(database.database_path, client, room, session_id, course)
    except Exception as error:
        print(f"Tuner no disponible para {session_id}: {error!r}")
    database.write(lambda connection: link_params_version(connection, room, session_id))


def handle_message(
    message: mqtt.MQTTMessage,
    received: datetime,
    settings: Settings,
    database: Database,
    accumulator: MinuteAccumulator,
    sensor_accumulator: SensorMinuteAccumulator,
    client: mqtt.Client,
) -> bool:
    """Procesa un mensaje. Devuelve False solo si SQLite no está disponible y hay que reintentar."""
    received_at = iso_utc(received)
    if message.topic == settings.mqtt_topic:
        ambient, object_temperature = parse_temperature_message(message, settings.mqtt_topic)
        print(f"{received.strftime('%H:%M:%S')} | Ambiente: {ambient:.2f} C | Objeto: {object_temperature:.2f} C")
        accumulator.add(ambient, object_temperature, received)
        sensor_accumulator.add(
            LEGACY_ROOM, LEGACY_DEVICE, {"temp_c": ambient, "ir_object_c": object_temperature}, received
        )
        return True

    match = TOPIC_PATTERN.match(message.topic)
    if match is None:
        raise ValueError(f"topic inesperado: {message.topic!r}")
    room, kind = match.groups()
    if kind == "status":
        print(f"{received.strftime('%H:%M:%S')} | {room} status: {message.payload.decode('utf-8', 'replace')}")
        return True

    data = decode_json_object(message.payload)
    payload_text = json.dumps(data, separators=(",", ":"))
    if kind == "telemetry":
        device, session_id, values = parse_telemetry(room, data)
        saved = database.write(lambda connection: connection.execute(
            "INSERT INTO readings_raw (room, device, session_id, received_at, payload) VALUES (?, ?, ?, ?, ?)",
            (room, device, session_id, received_at, payload_text),
        ))
        if saved is None:
            return False
        sensor_accumulator.add(room, device, values, received)
        print(f"{received.strftime('%H:%M:%S')} | {room}/{device} | {values}")
        return True

    event = parse_event(room, data)
    if event["event"] == "SESSION_ENDED":
        # El resumen se calcula desde sensor_minutes: primero se cierran los minutos en memoria.
        sensor_accumulator.finish_current()
        flush_sensor_pending(sensor_accumulator, database)
    result = database.write(lambda connection: store_event(connection, event, payload_text, received_at))
    if result is None:
        return False
    print(f"{received.strftime('%H:%M:%S')} | {room} {event['event']} {event['event_id']}: {result}")
    if result == "sesión iniciada":
        notify_tuner(database, client, room, event["session_id"], event["course"])
    return True


def main() -> None:
    try:
        settings = load_settings()
    except ValueError as error:
        print(f"Error de configuración: {error}")
        return

    database = Database(settings.database_path)
    database.ensure_ready()
    accumulator = MinuteAccumulator()
    sensor_accumulator = SensorMinuteAccumulator()
    inbox: deque[tuple[mqtt.MQTTMessage, datetime]] = deque()
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=settings.mqtt_client_id)
    client.reconnect_delay_set(min_delay=1, max_delay=60)
    if settings.mqtt_username:
        client.username_pw_set(settings.mqtt_username, settings.mqtt_password)

    def on_connect(client: mqtt.Client, userdata: object, flags: object, reason_code: object, properties: object) -> None:
        if getattr(reason_code, "is_failure", False):
            print(f"MQTT rechazó la conexión: {reason_code}")
            return
        topics = [(settings.mqtt_topic, 0)] + [(topic, 1) for topic in CLASSAI_TOPICS]
        result, _ = client.subscribe(topics)
        if result == mqtt.MQTT_ERR_SUCCESS:
            print(f"MQTT conectado a {settings.mqtt_host}:{settings.mqtt_port}")
            print(f"Escuchando: {', '.join(topic for topic, _ in topics)}")
        else:
            print(f"Error al suscribirse: código {result}")

    def on_connect_fail(client: mqtt.Client, userdata: object) -> None:
        print("No se pudo conectar a MQTT. Se reintentará automáticamente.")

    def on_disconnect(client: mqtt.Client, userdata: object, disconnect_flags: object, reason_code: object, properties: object) -> None:
        if reason_code != 0:
            sent_by_server = getattr(disconnect_flags, "is_disconnect_packet_from_server", False)
            origin = (
                "Mosquitto envió un paquete DISCONNECT"
                if sent_by_server
                else "la conexión TCP se cerró sin un paquete MQTT DISCONNECT"
            )
            print(
                f"MQTT desconectado ({reason_code}): {origin}. "
                "Se reintentará automáticamente."
            )

    def on_message(client: mqtt.Client, userdata: object, message: mqtt.MQTTMessage) -> None:
        # Todo el trabajo con SQLite ocurre en el hilo principal, en orden de llegada.
        inbox.append((message, datetime.now(timezone.utc)))

    client.on_connect = on_connect
    client.on_connect_fail = on_connect_fail
    client.on_disconnect = on_disconnect
    client.on_message = on_message

    stop_requested = threading.Event()

    def request_shutdown(signum: int, frame: object) -> None:
        if not stop_requested.is_set():
            print(f"\nSeñal {signal.Signals(signum).name} recibida. Cerrando backend...")
        stop_requested.set()

    signal.signal(signal.SIGINT, request_shutdown)
    signal.signal(signal.SIGTERM, request_shutdown)

    print("\n===================================")
    print("CLASSAI BACKEND")
    print("===================================")
    print(f"MQTT: {settings.mqtt_host}:{settings.mqtt_port}")
    print(f"Topics: {settings.mqtt_topic}, {', '.join(CLASSAI_TOPICS)}")
    print(f"Database: {settings.database_path}")
    print("===================================\n")

    client.connect_async(settings.mqtt_host, settings.mqtt_port, keepalive=60)
    client.loop_start()
    next_purge = 0.0
    try:
        while not stop_requested.is_set():
            while inbox:
                message, received = inbox[0]
                try:
                    if not handle_message(
                        message, received, settings, database, accumulator, sensor_accumulator, client
                    ):
                        break  # SQLite no disponible: el mensaje se reintenta en la próxima vuelta
                except ValueError as error:
                    print(f"Mensaje MQTT ignorado ({message.topic}): {error}")
                except Exception as error:  # un mensaje raro nunca debe tumbar la ingesta
                    print(f"Error procesando {message.topic}: {error!r}")
                inbox.popleft()
            now = datetime.now(timezone.utc)
            accumulator.finish_expired(now)
            flush_pending(accumulator, database)
            sensor_accumulator.finish_expired(now)
            flush_sensor_pending(sensor_accumulator, database)
            if time.monotonic() >= next_purge:
                cutoff = iso_utc(now - RAW_RETENTION)
                if database.write(lambda connection: connection.execute(
                    "DELETE FROM readings_raw WHERE received_at < ?", (cutoff,)
                )) is not None:
                    next_purge = time.monotonic() + PURGE_INTERVAL_SECONDS
            time.sleep(0.25)
    except KeyboardInterrupt:
        print("\nCerrando backend...")
        stop_requested.set()
    finally:
        client.disconnect()
        client.loop_stop()
        accumulator.finish_current()
        flush_pending(accumulator, database)
        sensor_accumulator.finish_current()
        flush_sensor_pending(sensor_accumulator, database)
        database.close()


if __name__ == "__main__":
    main()
