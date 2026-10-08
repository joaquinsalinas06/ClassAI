"""Consultas de solo lectura para resúmenes por minuto, sesiones y asistencia.

Las únicas escrituras son el enrolamiento y la revocación de credenciales.
"""

import json
import os
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dotenv import load_dotenv


HISTORY_COLUMNS = (
    "minute_utc, samples, ambient_min, ambient_max, ambient_avg, "
    "object_min, object_max, object_avg"
)
MAX_HISTORY_LIMIT = 5000
SERIES_METRICS = ("temp_c", "rh_pct", "lux", "noise_rel", "presence", "ir_object_c", "comfort")
CREDENTIAL_LENGTHS = {"nfc_card_uid": (8, 14, 20), "android_hce": (32,)}
MAX_COMPARE_SESSIONS = 10


class TemperatureServiceError(Exception):
    """Base para errores controlados de la capa de consultas."""


class ConfigurationError(TemperatureServiceError):
    """La configuración necesaria para una consulta no es válida."""


class InvalidTimeRangeError(TemperatureServiceError):
    """Un rango o fecha recibidos no se pueden interpretar."""


class DatabaseTemporarilyUnavailableError(TemperatureServiceError):
    """SQLite está temporalmente bloqueada o no disponible."""


@dataclass(frozen=True)
class ServiceSettings:
    database_path: str
    local_timezone: str


@dataclass(frozen=True)
class NormalizedDateTime:
    local: datetime
    utc: datetime


def required_env(name: str) -> str:
    value = os.getenv(name)
    if value is None or not value.strip():
        raise ConfigurationError(f"Falta la variable obligatoria {name}")
    return value.strip()


def load_settings() -> ServiceSettings:
    """Lee la configuración compartida sin exponerla en respuestas HTTP."""
    load_dotenv()
    local_timezone = required_env("LOCAL_TIMEZONE")
    try:
        ZoneInfo(local_timezone)
    except ZoneInfoNotFoundError as error:
        raise ConfigurationError("LOCAL_TIMEZONE no es una zona horaria válida") from error
    return ServiceSettings(
        database_path=required_env("DATABASE_PATH"),
        local_timezone=local_timezone,
    )


def iso_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def normalize_credential(credential_type: object, token: object) -> tuple[str, str]:
    """Valida type/token según docs/contracts.md y devuelve el token en HEX mayúsculas."""
    if not isinstance(credential_type, str) or credential_type not in CREDENTIAL_LENGTHS:
        raise ValueError("credential.type debe ser nfc_card_uid o android_hce")
    if not isinstance(token, str):
        raise ValueError("credential.token debe ser texto")
    normalized = token.strip().upper()
    if len(normalized) not in CREDENTIAL_LENGTHS[credential_type] or any(
        character not in "0123456789ABCDEF" for character in normalized
    ):
        raise ValueError("credential.token no es HEX válido para su tipo")
    if credential_type == "nfc_card_uid" and len(normalized) == 8 and normalized.startswith("08"):
        raise ValueError("UID aleatorio (teléfono): no identifica a nadie")
    return credential_type, normalized


def enroll_credential(
    connection: sqlite3.Connection, code: str, full_name: str, credential_type: str, token: str
) -> dict[str, Any]:
    """Crea (o reutiliza por código) al estudiante y le agrega una credencial activa.

    Lanza sqlite3.IntegrityError si la credencial ya está activa para alguien.
    """
    credential_type, token = normalize_credential(credential_type, token)
    now = iso_utc(datetime.now(timezone.utc))
    connection.execute(
        "INSERT INTO students (code, full_name, created_at) VALUES (?, ?, ?) "
        "ON CONFLICT(code) DO UPDATE SET full_name = excluded.full_name",
        (code, full_name, now),
    )
    student_id = connection.execute("SELECT id FROM students WHERE code = ?", (code,)).fetchone()[0]
    cursor = connection.execute(
        "INSERT INTO credentials (student_id, type, token, created_at) VALUES (?, ?, ?, ?)",
        (student_id, credential_type, token, now),
    )
    connection.commit()
    return {"credential_id": cursor.lastrowid, "student_id": student_id, "code": code, "type": credential_type}


def revoke_credential(connection: sqlite3.Connection, credential_id: int) -> bool:
    cursor = connection.execute(
        "UPDATE credentials SET active = 0, revoked_at = ? WHERE id = ? AND active = 1",
        (iso_utc(datetime.now(timezone.utc)), credential_id),
    )
    connection.commit()
    return cursor.rowcount == 1


def classify_temperature(temp: float) -> str:
    """Clasificación de aplicación; no representa sensación térmica científica."""
    if temp < 18:
        return "frio"
    if temp < 24:
        return "templado"
    if temp < 28:
        return "calido"
    return "caluroso"


class TemperatureService:
    """Servicio sin estado que abre una conexión SQLite de solo lectura por consulta."""

    def __init__(self, database_path: str, local_timezone: str) -> None:
        self.database_path = Path(database_path)
        try:
            self.local_timezone = ZoneInfo(local_timezone)
        except ZoneInfoNotFoundError as error:
            raise ConfigurationError("LOCAL_TIMEZONE no es una zona horaria válida") from error

    @classmethod
    def from_environment(cls) -> "TemperatureService":
        settings = load_settings()
        return cls(settings.database_path, settings.local_timezone)

    def database_available(self) -> bool:
        """Comprueba disponibilidad sin crear ni modificar la base."""
        if not self.database_path.exists():
            return False
        try:
            with self._connect() as connection:
                connection.execute("SELECT 1 FROM temperature_minutes LIMIT 1")
            return True
        except (sqlite3.Error, OSError):
            return False

    def get_latest(self) -> Optional[dict[str, Any]]:
        rows = self._fetch_all(
            f"SELECT {HISTORY_COLUMNS} FROM temperature_minutes "
            "ORDER BY minute_utc DESC LIMIT 1"
        )
        if not rows:
            return None
        row = rows[0]
        return {
            "minute_utc": row["minute_utc"],
            "samples": row["samples"],
            "ambient": {
                "min": row["ambient_min"],
                "max": row["ambient_max"],
                "avg": row["ambient_avg"],
            },
            "object": {
                "min": row["object_min"],
                "max": row["object_max"],
                "avg": row["object_avg"],
            },
        }

    def get_stats(self, start: str, end: str) -> Optional[dict[str, Any]]:
        start_time = self._normalize_datetime(start)
        end_time = self._normalize_datetime(end)
        if start_time.utc >= end_time.utc:
            raise InvalidTimeRangeError("start debe ser anterior a end")

        row = self._fetch_one(
            """
            SELECT
                SUM(samples) AS samples,
                MIN(ambient_min) AS ambient_min,
                MAX(ambient_max) AS ambient_max,
                SUM(ambient_avg * samples) / SUM(samples) AS ambient_avg,
                MIN(object_min) AS object_min,
                MAX(object_max) AS object_max,
                SUM(object_avg * samples) / SUM(samples) AS object_avg
            FROM temperature_minutes
            WHERE minute_utc >= ? AND minute_utc < ?
            """,
            (self._minute_key(start_time.utc), self._minute_key(end_time.utc)),
        )
        if row is None or row["samples"] is None:
            return None

        ambient_avg = float(row["ambient_avg"])
        return {
            "period": self._period_payload(start_time, end_time),
            "samples": int(row["samples"]),
            "ambient": {
                "min": row["ambient_min"],
                "max": row["ambient_max"],
                "avg": ambient_avg,
            },
            "object": {
                "min": row["object_min"],
                "max": row["object_max"],
                "avg": float(row["object_avg"]),
            },
            "classification": classify_temperature(ambient_avg),
        }

    def get_history(self, start: str, end: str, limit: int = 500) -> list[dict[str, Any]]:
        if not 1 <= limit <= MAX_HISTORY_LIMIT:
            raise InvalidTimeRangeError(f"limit debe estar entre 1 y {MAX_HISTORY_LIMIT}")
        start_time = self._normalize_datetime(start)
        end_time = self._normalize_datetime(end)
        if start_time.utc >= end_time.utc:
            raise InvalidTimeRangeError("start debe ser anterior a end")

        rows = self._fetch_all(
            f"""
            SELECT {HISTORY_COLUMNS}
            FROM temperature_minutes
            WHERE minute_utc >= ? AND minute_utc < ?
            ORDER BY minute_utc DESC
            LIMIT ?
            """,
            (self._minute_key(start_time.utc), self._minute_key(end_time.utc), limit),
        )
        return [dict(row) for row in rows]

    def get_daily_summary(self, day: str) -> Optional[dict[str, Any]]:
        try:
            local_date = date.fromisoformat(day)
        except ValueError as error:
            raise InvalidTimeRangeError("date debe tener formato YYYY-MM-DD") from error

        start_local = datetime.combine(local_date, time.min, tzinfo=self.local_timezone)
        end_local = datetime.combine(local_date + timedelta(days=1), time.min, tzinfo=self.local_timezone)
        stats = self.get_stats(start_local.isoformat(), end_local.isoformat())
        if stats is None:
            return None
        stats["date_local"] = local_date.isoformat()
        return stats

    def get_current_class(self, room: str) -> dict[str, Any]:
        """Sesión abierta del aula (si hay) y la última lectura cruda recibida."""
        session = self._fetch_one(
            "SELECT id, room, course, started_at, params_version FROM sessions "
            "WHERE room = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
            (room,),
        )
        reading = self._fetch_one(
            "SELECT received_at, payload FROM readings_raw WHERE room = ? ORDER BY id DESC LIMIT 1",
            (room,),
        )
        result: dict[str, Any] = {"room": room, "session": None, "latest_reading": None}
        if session is not None:
            attendance = self._fetch_one(
                "SELECT COUNT(*) AS total FROM attendance WHERE session_id = ?", (session["id"],)
            )
            result["session"] = {**dict(session), "attendance_count": attendance["total"] if attendance else 0}
        if reading is not None:
            payload = json.loads(reading["payload"])
            result["latest_reading"] = {
                "received_at": reading["received_at"],
                **{key: payload.get(key) for key in (*SERIES_METRICS, "state", "params_version")},
            }
        return result

    def get_session_summary(self, session_id: str) -> Optional[dict[str, Any]]:
        row = self._fetch_one("SELECT * FROM session_summaries WHERE session_id = ?", (session_id,))
        if row is not None:
            return {"status": "finalizada", **dict(row)}
        session = self._fetch_one("SELECT * FROM sessions WHERE id = ?", (session_id,))
        if session is None:
            return None
        return {"status": "en_curso" if session["ended_at"] is None else "sin_resumen", **dict(session)}

    def list_sessions(
        self,
        room: Optional[str] = None,
        course: Optional[str] = None,
        start: Optional[str] = None,
        end: Optional[str] = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        conditions, parameters = [], []
        if room:
            conditions.append("s.room = ?")
            parameters.append(room)
        if course:
            conditions.append("s.course = ?")
            parameters.append(course)
        if start:
            conditions.append("s.started_at >= ?")
            parameters.append(iso_utc(self._normalize_datetime(start).utc))
        if end:
            conditions.append("s.started_at < ?")
            parameters.append(iso_utc(self._normalize_datetime(end).utc))
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        rows = self._fetch_all(
            f"""
            SELECT s.id AS session_id, s.room, s.course, s.started_at, s.ended_at, s.params_version,
                   m.minutes, m.temp_avg, m.comfort_avg, m.alert_minutes, m.attendance_count
            FROM sessions s LEFT JOIN session_summaries m ON m.session_id = s.id
            {where}
            ORDER BY s.started_at DESC
            LIMIT ?
            """,
            (*parameters, limit),
        )
        return [dict(row) for row in rows]

    def compare_sessions(self, session_ids: list[str]) -> list[dict[str, Any]]:
        if not 1 <= len(session_ids) <= MAX_COMPARE_SESSIONS:
            raise InvalidTimeRangeError(f"Se comparan entre 1 y {MAX_COMPARE_SESSIONS} sesiones")
        placeholders = ", ".join("?" for _ in session_ids)
        rows = self._fetch_all(
            f"SELECT * FROM session_summaries WHERE session_id IN ({placeholders}) ORDER BY started_at",
            tuple(session_ids),
        )
        return [dict(row) for row in rows]

    def get_metric_series(self, session_id: str, metric: str, bucket_minutes: int = 5) -> Optional[list[dict[str, Any]]]:
        if metric not in SERIES_METRICS:
            raise InvalidTimeRangeError(f"metric debe ser una de: {', '.join(SERIES_METRICS)}")
        if not 1 <= bucket_minutes <= 60:
            raise InvalidTimeRangeError("bucket_minutes debe estar entre 1 y 60")
        session = self._fetch_one("SELECT room, started_at, ended_at FROM sessions WHERE id = ?", (session_id,))
        if session is None:
            return None
        start = self._minute_key(self._normalize_datetime(session["started_at"]).utc)
        end = self._minute_key(
            self._normalize_datetime(session["ended_at"]).utc
            if session["ended_at"]
            else datetime.now(timezone.utc)
        )
        rows = self._fetch_all(
            """
            SELECT MIN(minute_utc) AS bucket_start, SUM(samples) AS samples,
                   MIN(min) AS min, MAX(max) AS max, SUM(avg * samples) / SUM(samples) AS avg
            FROM sensor_minutes
            WHERE room = ? AND metric = ? AND minute_utc >= ? AND minute_utc <= ?
            GROUP BY CAST(strftime('%s', minute_utc) AS INTEGER) / (? * 60)
            ORDER BY bucket_start
            """,
            (session["room"], metric, start, end, bucket_minutes),
        )
        return [dict(row) for row in rows]

    def get_attendance(self, session_id: str) -> list[dict[str, Any]]:
        """Asistentes de la sesión; nunca devuelve tokens de credenciales."""
        rows = self._fetch_all(
            """
            SELECT st.code, st.full_name, c.type AS credential_type, a.recorded_at
            FROM attendance a
            JOIN students st ON st.id = a.student_id
            JOIN credentials c ON c.id = a.credential_id
            WHERE a.session_id = ?
            ORDER BY a.recorded_at
            """,
            (session_id,),
        )
        return [dict(row) for row in rows]

    def write_connection(self) -> sqlite3.Connection:
        """Conexión de escritura solo para enrolar/revocar credenciales."""
        if not self.database_path.exists():
            raise DatabaseTemporarilyUnavailableError("La base aún no existe; arranca backend.py primero")
        connection = sqlite3.connect(self.database_path, timeout=5)
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _normalize_datetime(self, value: str) -> NormalizedDateTime:
        normalized_value = value.strip()
        if normalized_value.endswith("Z"):
            normalized_value = normalized_value[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(normalized_value)
        except ValueError as error:
            raise InvalidTimeRangeError("Fecha y hora inválidas; usa formato ISO 8601") from error

        local = (
            parsed.replace(tzinfo=self.local_timezone)
            if parsed.tzinfo is None
            else parsed.astimezone(self.local_timezone)
        )
        return NormalizedDateTime(local=local, utc=local.astimezone(timezone.utc))

    @staticmethod
    def _minute_key(value: datetime) -> str:
        return value.strftime("%Y-%m-%d %H:%M")

    @staticmethod
    def _period_payload(start: NormalizedDateTime, end: NormalizedDateTime) -> dict[str, str]:
        return {
            "start_local": start.local.isoformat(),
            "end_local": end.local.isoformat(),
            "start_utc": start.utc.isoformat(),
            "end_utc": end.utc.isoformat(),
        }

    def _connect(self) -> sqlite3.Connection:
        if not self.database_path.exists():
            raise FileNotFoundError
        uri = self.database_path.resolve().as_uri() + "?mode=ro"
        try:
            connection = sqlite3.connect(uri, uri=True, timeout=5)
        except sqlite3.OperationalError as error:
            if "locked" in str(error).lower():
                raise DatabaseTemporarilyUnavailableError from error
            raise
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    def _fetch_one(self, query: str, parameters: tuple[Any, ...] = ()) -> Optional[sqlite3.Row]:
        rows = self._fetch_all(query, parameters)
        return rows[0] if rows else None

    def _fetch_all(self, query: str, parameters: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
        if not self.database_path.exists():
            return []
        try:
            with self._connect() as connection:
                return connection.execute(query, parameters).fetchall()
        except sqlite3.OperationalError as error:
            message = str(error).lower()
            if "locked" in message or "busy" in message:
                raise DatabaseTemporarilyUnavailableError from error
            if "no such table" in message:
                return []
            raise

