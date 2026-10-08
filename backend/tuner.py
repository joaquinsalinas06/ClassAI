"""Parámetros de confort por aula y curso: el backend calcula, el ESP32 ejecuta.

Reglas sin etiquetas (funcionan desde el día 1) + un desplazamiento acotado aprendido del
feedback del docente con River. Diseño y fuentes en docs/architecture.md; contrato del
config en docs/contracts.md ("Config de confort").
"""

import json
import math
import os
import pickle
import re
import sqlite3
import statistics
import threading
from contextlib import closing
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional
from zoneinfo import ZoneInfo

import paho.mqtt.publish as mqtt_publish
import requests
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from fastapi import Path as PathParam
from pydantic import BaseModel, Field
from river import linear_model, optim


ROOM_PATTERN = r"^[a-z0-9-]+$"
DEFAULT_TIMEZONE = "America/Lima"
WEIGHTS = {"temp": 0.35, "rh": 0.20, "lux": 0.20, "noise": 0.25}

# Puntuación (idéntica a firmware/classai_node/comfort.h).
TEMP_FALLOFF_C = 3.0      # temperatura: 0 a ±3 °C fuera del rango
NOISE_FALLOFF = 0.3       # ruido: 0 en noise_rel_max + 0.3

# ASHRAE 55 adaptativo: T_comf = 0.31·T_rm + 17.8, banda 90 % = ±2.5 °C, válido 10–33.5 °C.
ASHRAE_SLOPE, ASHRAE_INTERCEPT, ASHRAE_BAND_90 = 0.31, 17.8, 2.5
ASHRAE_TRM_RANGE = (10.0, 33.5)
RUNNING_MEAN_ALPHA = 0.8  # EN 16798-1 recomienda 0.8; 7 días previos
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Ruido: P90 de la propia clase, con un mínimo de datos.
MIN_NOISE_MINUTES, MIN_NOISE_SESSIONS = 30, 2
NOISE_RANGE = (0.2, 0.8)

# Luz EN 12464-1 (aulas 300 lx; clases nocturnas / adultos 500 lx).
LUX_DAY, LUX_EVENING, EVENING_HOUR = [300, 500], [500, 750], 18

# Feedback: desplazamiento máximo sobre las reglas.
MAX_TEMP_SHIFT, MAX_NOISE_SHIFT, MAX_LUX_SHIFT = 2.0, 0.15, 200
LEARNING_RATE = 0.3
FEEDBACK_KINDS = ("ok", "hot", "cold", "noisy", "dark", "fan_override_on", "fan_override_off")
# kind -> {modelo: etiqueta}. Un modelo que no aparece no aprende de ese kind.
FEEDBACK_LABELS = {
    "ok": {"hot": False, "cold": False, "noisy": False, "dark": False},
    "hot": {"hot": True, "cold": False},
    "cold": {"cold": True, "hot": False},
    "noisy": {"noisy": True},
    "dark": {"dark": True},
    "fan_override_on": {"hot": True, "cold": False},   # el docente encendió el ventilador
    "fan_override_off": {"hot": False},                # lo apagó: no hacía tanto calor
}
NO_SHIFT = {"temp": 0.0, "noise": 0.0, "lux": 0}


def factory_config(room: str) -> dict:
    """Valores de fábrica del contrato (params_version 0)."""
    return {
        "v": 1, "params_version": 0, "room": room,
        "temp_c": [21, 24], "rh_pct": [40, 60], "lux": [300, 500], "noise_rel_max": 0.5,
        "weights": dict(WEIGHTS), "ok_min": 80, "regular_min": 60,
        "source": {"temp": "factory", "rh": "factory", "noise": "factory", "lux": "factory"},
    }


def config_topic(room: str) -> str:
    return f"classai/v1/{room}/config"


# ---------------------------------------------------------------- índice de referencia

def _valid(value: Optional[float]) -> bool:
    return value is not None and math.isfinite(value)


def _score(value: float, low: float, high: float, falloff: float) -> float:
    if low <= value <= high:
        return 100.0
    distance = low - value if value < low else value - high
    return max(0.0, 100.0 * (1.0 - distance / falloff))


def comfort_index(cfg: dict, temp_c: Optional[float], rh_pct: Optional[float],
                  lux: Optional[float], noise_rel: Optional[float]) -> int:
    """Referencia de comfort.h. None/NaN = sensor inválido: su peso se reparte; -1 si no hay ninguno."""
    weights = cfg["weights"]
    rh_low, rh_high = cfg["rh_pct"]
    lux_low, lux_high = cfg["lux"]
    parts = []
    if _valid(temp_c):
        parts.append((weights["temp"], _score(temp_c, *cfg["temp_c"], TEMP_FALLOFF_C)))
    if _valid(rh_pct):
        parts.append((weights["rh"], _score(rh_pct, rh_low, rh_high, max(rh_high - rh_low, 1e-6))))
    if _valid(lux):
        parts.append((weights["lux"], _score(lux, lux_low, lux_high, max(lux_high - lux_low, 1e-6))))
    if _valid(noise_rel):
        limit = cfg["noise_rel_max"]
        parts.append((weights["noise"], _score(noise_rel, -math.inf, limit, NOISE_FALLOFF)))
    total = sum(weight for weight, _ in parts)
    if total <= 0:
        return -1
    value = sum(weight * score for weight, score in parts) / total
    return min(100, max(0, math.floor(value + 0.5)))


def comfort_state(cfg: dict, comfort: int) -> str:
    """Sin sensores válidos (-1) es REGULAR: no hay base para encender ventilador ni buzzer."""
    if comfort < 0:
        return "REGULAR"
    if comfort >= cfg["ok_min"]:
        return "OK"
    return "REGULAR" if comfort >= cfg["regular_min"] else "ALERT"


# ---------------------------------------------------------------- reglas

def running_mean(daily_means_newest_first: list[float], alpha: float = RUNNING_MEAN_ALPHA) -> Optional[float]:
    """Media exterior ponderada exponencialmente (EN 16798-1), normalizada por la suma de pesos."""
    if not daily_means_newest_first:
        return None
    weights = [alpha ** index for index in range(len(daily_means_newest_first))]
    return sum(w * t for w, t in zip(weights, daily_means_newest_first)) / sum(weights)


def adaptive_temp_range(t_rm: Optional[float]) -> tuple[list[float], Optional[float]]:
    """Rango ASHRAE 55 al 90 % de aceptabilidad y T_comf; sin T_rm, fábrica [21, 24]."""
    if t_rm is None:
        return [21, 24], None
    clamped = min(max(t_rm, ASHRAE_TRM_RANGE[0]), ASHRAE_TRM_RANGE[1])
    t_comf = ASHRAE_SLOPE * clamped + ASHRAE_INTERCEPT
    return [round(t_comf - ASHRAE_BAND_90, 1), round(t_comf + ASHRAE_BAND_90, 1)], t_comf


def noise_baseline(samples: list[tuple[str, float]]) -> Optional[float]:
    """P90 de promedios por minuto (session_id, noise_rel); None si faltan datos."""
    if len(samples) < MIN_NOISE_MINUTES or len({session for session, _ in samples}) < MIN_NOISE_SESSIONS:
        return None
    p90 = statistics.quantiles([value for _, value in samples], n=10, method="inclusive")[-1]
    return round(min(max(p90, NOISE_RANGE[0]), NOISE_RANGE[1]), 3)


def lux_range(local_start: datetime) -> list[int]:
    return list(LUX_EVENING if local_start.hour >= EVENING_HOUR else LUX_DAY)


_TRM_CACHE: dict[tuple[float, float, str], float] = {}


def outdoor_running_mean(latitude: float, longitude: float, local_day: date) -> Optional[float]:
    """T_rm de los 7 días previos a local_day desde Open-Meteo. None si la API falla."""
    # ponytail: caché en memoria por proceso y día; tabla si hay muchos procesos o aulas.
    key = (round(latitude, 2), round(longitude, 2), local_day.isoformat())
    if key in _TRM_CACHE:
        return _TRM_CACHE[key]
    try:
        response = requests.get(OPEN_METEO_URL, params={
            "latitude": latitude, "longitude": longitude, "daily": "temperature_2m_mean",
            "past_days": 7, "forecast_days": 1, "timezone": "auto",
        }, timeout=5)
        response.raise_for_status()
        daily = response.json()["daily"]
        past = [float(t) for day, t in zip(daily["time"], daily["temperature_2m_mean"])
                if day < local_day.isoformat() and t is not None]
    except (requests.RequestException, ValueError, KeyError, TypeError) as error:
        print(f"Open-Meteo no disponible ({latitude}, {longitude}): {error}")
        return None
    t_rm = running_mean(list(reversed(past[-7:])))
    if t_rm is not None:
        _TRM_CACHE[key] = t_rm
    return t_rm


# ---------------------------------------------------------------- feedback (River)

def _new_models() -> dict:
    # Sin intercepto común: el one-hot del curso hace de sesgo propio de cada clase.
    return {name: linear_model.LogisticRegression(optimizer=optim.SGD(LEARNING_RATE), intercept_lr=0.0)
            for name in ("hot", "cold", "noisy", "dark")}


def _context_features(course: Optional[str], local_hour: int, t_out: Optional[float]) -> dict:
    return {
        f"course={course or '-'}": 1.0,
        "hour": (local_hour - 12) / 12,
        "t_out": 0.0 if t_out is None else (t_out - 20) / 10,
    }


def _deviation(model: str, readings: dict, cfg: dict) -> Optional[float]:
    """Desviación de la lectura respecto al objetivo de las reglas (sin el shift ya aplicado)."""
    shift = cfg.get("source", {}).get("shift", NO_SHIFT)
    if model in ("hot", "cold") and _valid(readings.get("temp_c")):
        center = sum(cfg["temp_c"]) / 2 - shift["temp"]
        return (readings["temp_c"] - center) / TEMP_FALLOFF_C
    if model == "noisy" and _valid(readings.get("noise_rel")):
        return (readings["noise_rel"] - (cfg["noise_rel_max"] - shift["noise"])) / NOISE_FALLOFF
    if model == "dark" and _valid(readings.get("lux")):
        return ((cfg["lux"][0] - shift["lux"]) - readings["lux"]) / 200
    return None


def learn_feedback(models: dict, kind: str, course: Optional[str], local_hour: int,
                   t_out: Optional[float], readings: dict, cfg: dict) -> None:
    """Un paso online por modelo afectado por este kind."""
    context = _context_features(course, local_hour, t_out)
    for name, label in FEEDBACK_LABELS[kind].items():
        x = dict(context)
        deviation = _deviation(name, readings, cfg)
        if deviation is not None:
            x["dev"] = deviation
        models[name].learn_one(x, label)


def feedback_shift(models: dict, course: Optional[str], local_hour: int, t_out: Optional[float]) -> dict:
    """P(incomodidad) con la lectura justo en el objetivo (dev = 0) -> desplazamiento acotado."""
    x = _context_features(course, local_hour, t_out)
    p = {name: model.predict_proba_one(x)[True] for name, model in models.items()}
    return {
        "temp": round(-MAX_TEMP_SHIFT * (p["hot"] - p["cold"]), 2) + 0.0,  # + 0.0: sin "-0.0" en el JSON
        "noise": round(-MAX_NOISE_SHIFT * (2 * p["noisy"] - 1), 3) + 0.0,
        "lux": round(MAX_LUX_SHIFT * max(0.0, 2 * p["dark"] - 1)),
    }


_MODELS_LOCK = threading.Lock()


def _models_path(database_file: str, room: str) -> Path:
    if not re.fullmatch(ROOM_PATTERN, room):
        raise ValueError(f"room inválido: {room!r}")
    return Path(database_file).resolve().parent / "models" / f"feedback_{room}.pkl"


def load_models(database_file: str, room: str) -> dict:
    # pickle solo de models/ junto a la base: lo escribe este backend, misma confianza que el .db.
    path = _models_path(database_file, room)
    if not path.exists():
        return _new_models()
    with path.open("rb") as handle:
        return pickle.load(handle)


def save_models(database_file: str, room: str, models: dict) -> None:
    path = _models_path(database_file, room)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_bytes(pickle.dumps(models))
    os.replace(temporary, path)


# ---------------------------------------------------------------- config

def _parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _room_info(connection: sqlite3.Connection, room: str) -> tuple[Optional[float], Optional[float], ZoneInfo]:
    row = connection.execute("SELECT latitude, longitude, timezone FROM rooms WHERE id = ?", (room,)).fetchone()
    if row is None:
        return None, None, ZoneInfo(DEFAULT_TIMEZONE)
    return row[0], row[1], ZoneInfo(row[2] or DEFAULT_TIMEZONE)


def _outdoor(latitude: Optional[float], longitude: Optional[float], local_day: date) -> Optional[float]:
    if latitude is None or longitude is None:
        return None
    return outdoor_running_mean(latitude, longitude, local_day)


def _noise_history(connection: sqlite3.Connection, room: str, course: Optional[str],
                   before: datetime) -> list[tuple[str, float]]:
    # ponytail: todo el historial de la clase; ventana de N sesiones si la clase cambia de estilo.
    return connection.execute(
        """
        SELECT s.id, m.avg FROM sessions s
        JOIN sensor_minutes m ON m.room = s.room AND m.metric = 'noise_rel'
            AND m.minute_utc >= replace(substr(s.started_at, 1, 16), 'T', ' ')
            AND m.minute_utc < replace(substr(s.ended_at, 1, 16), 'T', ' ')
        WHERE s.room = ? AND s.course = ? AND s.ended_at IS NOT NULL AND s.started_at < ?
        """,
        (room, course, _iso(before)),
    ).fetchall()


def build_config(db_conn: sqlite3.Connection, room: str, course: Optional[str],
                 session_start_utc: Optional[datetime], now: datetime) -> dict:
    """Config del contrato para (aula, curso, inicio). params_version = último del aula + 1."""
    start = session_start_utc or now
    latitude, longitude, zone = _room_info(db_conn, room)
    local_start = start.astimezone(zone)
    t_rm = _outdoor(latitude, longitude, local_start.date())
    temp, t_comf = adaptive_temp_range(t_rm)
    noise = noise_baseline(_noise_history(db_conn, room, course, start))
    lux = lux_range(local_start)

    shift = dict(NO_SHIFT)
    has_feedback = db_conn.execute(
        "SELECT 1 FROM feedback WHERE room = ? AND course IS ? LIMIT 1", (room, course)
    ).fetchone()
    database_file = db_conn.execute("PRAGMA database_list").fetchone()[2]
    if has_feedback and database_file:
        with _MODELS_LOCK:
            models = load_models(database_file, room)
        shift = feedback_shift(models, course, local_start.hour, t_rm)

    version = db_conn.execute(
        "SELECT COALESCE(MAX(params_version), 0) + 1 FROM comfort_params WHERE room = ?", (room,)
    ).fetchone()[0]
    base_noise = 0.5 if noise is None else noise
    return {
        "v": 1,
        "params_version": version,
        "room": room,
        "temp_c": [round(temp[0] + shift["temp"], 1), round(temp[1] + shift["temp"], 1)],
        "rh_pct": [40, 60],
        "lux": [lux[0] + shift["lux"], lux[1] + shift["lux"]],
        "noise_rel_max": round(min(max(base_noise + shift["noise"], NOISE_RANGE[0]), NOISE_RANGE[1]), 3),
        "weights": dict(WEIGHTS),
        "ok_min": 80,
        "regular_min": 60,
        "source": {
            "temp": "factory" if t_rm is None else "ashrae55_adaptive",
            "rh": "fixed",
            "noise": "factory" if noise is None else "baseline_p90",
            "lux": "en12464_evening" if lux == LUX_EVENING else "en12464",
            "t_rm": None if t_rm is None else round(t_rm, 2),
            "t_comf": None if t_comf is None else round(t_comf, 2),
            "course": course,
            "shift": shift,
        },
    }


def store_config(connection: sqlite3.Connection, cfg: dict, reason: str, now: datetime) -> dict:
    """Guarda en comfort_params; el número de versión se fija dentro del lock de escritura."""
    connection.execute("BEGIN IMMEDIATE")
    try:
        version = connection.execute(
            "SELECT COALESCE(MAX(params_version), 0) + 1 FROM comfort_params WHERE room = ?", (cfg["room"],)
        ).fetchone()[0]
        cfg = {**cfg, "params_version": version}
        connection.execute(
            "INSERT INTO comfort_params (room, params_version, created_at, reason, payload) VALUES (?, ?, ?, ?, ?)",
            (cfg["room"], version, _iso(now), reason, json.dumps(cfg, separators=(",", ":"))),
        )
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    return cfg


def _connect(database_path: str) -> sqlite3.Connection:
    connection = sqlite3.connect(database_path, timeout=5)
    connection.execute("PRAGMA busy_timeout = 5000")
    return connection


def on_session_started(db_path: str, mqtt_client, room: str, session_id: str, course: Optional[str]) -> None:
    """Calcula, guarda y publica (retenido, QoS 1) el config del aula. Nunca lanza al llamador."""
    try:
        now = datetime.now(timezone.utc)
        with closing(_connect(db_path)) as connection:
            row = connection.execute("SELECT started_at FROM sessions WHERE id = ?", (session_id,)).fetchone()
            start = _parse_utc(row[0]) if row else now
            cfg = build_config(connection, room, course, start, now)
            cfg = store_config(connection, cfg, f"session_started:{session_id}", now)
        mqtt_client.publish(config_topic(room), json.dumps(cfg, separators=(",", ":")), qos=1, retain=True)
        print(f"Config v{cfg['params_version']} publicado para {room}: temp {cfg['temp_c']} "
              f"lux {cfg['lux']} ruido {cfg['noise_rel_max']}")
    except Exception as error:
        print(f"Tuner: no se pudo generar/publicar el config de {room}: {error!r}")


# ---------------------------------------------------------------- API

router = APIRouter(tags=["comfort"])


class FeedbackIn(BaseModel):
    room: str = Field(pattern=ROOM_PATTERN, max_length=32)
    kind: Literal[FEEDBACK_KINDS]
    session_id: Optional[str] = Field(default=None, max_length=64)


def _database_path() -> str:
    load_dotenv()
    path = os.getenv("DATABASE_PATH")
    if not path:
        raise HTTPException(status_code=500, detail="La configuración de la API no es válida")
    return path


def _latest_config(connection: sqlite3.Connection, room: str) -> dict:
    row = connection.execute(
        "SELECT payload FROM comfort_params WHERE room = ? ORDER BY params_version DESC LIMIT 1", (room,)
    ).fetchone()
    return json.loads(row[0]) if row else factory_config(room)


def _latest_readings(connection: sqlite3.Connection, room: str, now: datetime) -> dict:
    """Último promedio por métrica de los últimos 15 minutos."""
    since = (now - timedelta(minutes=15)).strftime("%Y-%m-%d %H:%M")
    rows = connection.execute(
        "SELECT metric, avg, MAX(minute_utc) FROM sensor_minutes WHERE room = ? AND minute_utc >= ? GROUP BY metric",
        (room, since),
    ).fetchall()
    return {metric: value for metric, value, _ in rows}


def _publish(room: str, cfg: dict) -> bool:
    """Publicación corta (conecta, publica retenido, desconecta) con las variables MQTT_*."""
    username = os.getenv("MQTT_USERNAME") or None
    try:
        mqtt_publish.single(
            config_topic(room), json.dumps(cfg, separators=(",", ":")), qos=1, retain=True,
            hostname=os.getenv("MQTT_HOST", "127.0.0.1"), port=int(os.getenv("MQTT_PORT", "1883")),
            auth={"username": username, "password": os.getenv("MQTT_PASSWORD") or None} if username else None,
        )
        return True
    except Exception as error:
        print(f"No se pudo publicar el config de {room}: {error!r}")
        return False


@router.post("/feedback", summary="Registrar feedback del docente y republicar el config del aula")
def post_feedback(body: FeedbackIn) -> dict:
    database_path = _database_path()
    now = datetime.now(timezone.utc)
    try:
        with closing(_connect(database_path)) as connection:
            if body.session_id:
                session = connection.execute(
                    "SELECT id, course, started_at FROM sessions WHERE id = ? AND room = ?",
                    (body.session_id, body.room),
                ).fetchone()
                if session is None:
                    raise HTTPException(status_code=404, detail="Sesión no encontrada en esa aula")
            else:
                session = connection.execute(
                    "SELECT id, course, started_at FROM sessions WHERE room = ? AND ended_at IS NULL "
                    "ORDER BY started_at DESC LIMIT 1",
                    (body.room,),
                ).fetchone()
            session_id, course, started_at = session if session else (None, None, None)

            current = _latest_config(connection, body.room)
            readings = _latest_readings(connection, body.room, now)
            cursor = connection.execute(
                "INSERT INTO feedback (room, session_id, course, kind, created_at, context) VALUES (?, ?, ?, ?, ?, ?)",
                (body.room, session_id, course, body.kind, _iso(now),
                 json.dumps({"readings": readings, "params": current}, separators=(",", ":"))),
            )
            connection.commit()

            latitude, longitude, zone = _room_info(connection, body.room)
            local_now = now.astimezone(zone)
            t_out = _outdoor(latitude, longitude, local_now.date())
            # ponytail: lock por proceso; si la API corre con varios workers, mover a un solo escritor.
            with _MODELS_LOCK:
                models = load_models(database_path, body.room)
                learn_feedback(models, body.kind, course, local_now.hour, t_out, readings, current)
                save_models(database_path, body.room, models)

            start = _parse_utc(started_at) if started_at else now
            cfg = build_config(connection, body.room, course, start, now)
            cfg = store_config(connection, cfg, f"feedback:{body.kind}", now)
    except sqlite3.Error as error:
        raise HTTPException(status_code=503, detail="La base de datos no está disponible") from error
    return {"feedback_id": cursor.lastrowid, "session_id": session_id, "config": cfg,
            "published": _publish(body.room, cfg)}


@router.get("/comfort/params/{room}", summary="Config de confort vigente e historial del aula")
def get_comfort_params(room: str = PathParam(pattern=ROOM_PATTERN, max_length=32), limit: int = 20) -> dict:
    limit = min(max(limit, 1), 200)
    database_file = Path(_database_path())
    history = []
    if database_file.exists():
        try:
            uri = database_file.resolve().as_uri() + "?mode=ro"
            with closing(sqlite3.connect(uri, uri=True, timeout=5)) as connection:
                rows = connection.execute(
                    "SELECT params_version, created_at, reason, payload FROM comfort_params "
                    "WHERE room = ? ORDER BY params_version DESC LIMIT ?",
                    (room, limit),
                ).fetchall()
        except sqlite3.OperationalError as error:
            if "no such table" not in str(error).lower():
                raise HTTPException(status_code=503, detail="La base de datos no está disponible") from error
            rows = []
        history = [{"params_version": v, "created_at": c, "reason": r, "config": json.loads(p)}
                   for v, c, r, p in rows]
    current = history[0]["config"] if history else factory_config(room)
    return {"room": room, "current": current, "history": history}
