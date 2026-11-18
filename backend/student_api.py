"""Registro, login (Bearer), clases abiertas y votos de los alumnos para la app Android."""
import json
import sqlite3
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, model_validator

from auth import STUDENT_TTL, connect, hash_password, issue_token, now, revoke_token, token_subject, verify_password
from temperature_service import iso_utc, normalize_credential

router = APIRouter(prefix="/student", tags=["student"])

CODE = r"^[A-Za-z0-9-]{1,32}$"


class RegisterIn(BaseModel):
    code: str = Field(pattern=CODE)
    full_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=6, max_length=128)
    nfc_token: Optional[str] = Field(default=None, min_length=32, max_length=32)


class LoginIn(BaseModel):
    code: str = Field(pattern=CODE)
    password: str = Field(min_length=1, max_length=128)
    nfc_token: Optional[str] = Field(default=None, min_length=32, max_length=32)


class VoteIn(BaseModel):
    """`kind` (temperatura, como siempre) o `dimension` + `value` para cualquier sensor del aula."""
    kind: Optional[Literal["ok", "hot", "cold", "noisy", "dark"]] = None
    dimension: Optional[Literal["temp", "light", "noise", "motion", "humidity"]] = None
    value: Optional[Literal["low", "ok", "high"]] = None

    @model_validator(mode="after")
    def one_form(self):
        if (self.kind is None) == (self.dimension is None or self.value is None):
            raise ValueError("envía kind, o dimension y value")
        return self


TEMP_KIND = {"low": "cold", "ok": "ok", "high": "hot"}
KIND_TEMP = {v: k for k, v in TEMP_KIND.items()}


def my_votes(db: sqlite3.Connection, session_id: str, student: int, temp_kind: Optional[str]) -> dict:
    votes = {"temp": KIND_TEMP[temp_kind]} if temp_kind in KIND_TEMP else {}
    try:
        votes.update(db.execute("SELECT dimension, value FROM student_votes WHERE session_id=? AND student_id=?",
                                (session_id, student)).fetchall())
    except sqlite3.OperationalError:  # BD aún sin la tabla (schema.sql se aplica al arrancar la ingesta)
        pass
    return votes


def bearer(authorization: Optional[str]) -> Optional[str]:
    return authorization[7:] if authorization and authorization.startswith("Bearer ") else None


def identity(connection: sqlite3.Connection, authorization: Optional[str]) -> int:
    student = token_subject(connection, "student", bearer(authorization))
    if student is None:
        raise HTTPException(401, "Inicia sesión")
    return student


def link_phone(connection: sqlite3.Connection, student_id: int, nfc_token: Optional[str]) -> None:
    """Vincula el token HCE del teléfono. Quien tiene la contraseña y el teléfono manda:
    se revoca el teléfono anterior del alumno y cualquier vínculo previo de ese token."""
    if nfc_token is None:
        return
    try:
        _, token = normalize_credential("android_hce", nfc_token)
    except ValueError as error:
        raise HTTPException(422, "nfc_token debe ser HEX de 32 caracteres") from error
    at = iso_utc(now())
    current = connection.execute(
        "SELECT student_id FROM credentials WHERE type='android_hce' AND token=? AND active=1", (token,)
    ).fetchone()
    if current and current[0] == student_id:
        return
    connection.execute(
        "UPDATE credentials SET active=0, revoked_at=? WHERE type='android_hce' AND active=1 AND (token=? OR student_id=?)",
        (at, token, student_id),
    )
    connection.execute(
        "INSERT INTO credentials(student_id, type, token, created_at) VALUES (?, 'android_hce', ?, ?)", (student_id, token, at)
    )


def profile(connection: sqlite3.Connection, student_id: int) -> dict:
    code, full_name = connection.execute("SELECT code, full_name FROM students WHERE id=?", (student_id,)).fetchone()
    phone = connection.execute(
        "SELECT 1 FROM credentials WHERE student_id=? AND type='android_hce' AND active=1", (student_id,)
    ).fetchone()
    return {"code": code, "full_name": full_name, "phone_linked": phone is not None}


def session_response(connection: sqlite3.Connection, student_id: int) -> dict:
    token, expires = issue_token(connection, "student", student_id, STUDENT_TTL)
    return {"access_token": token, "token_type": "bearer", "expires_at": expires, "student": profile(connection, student_id)}


@router.post("/register", status_code=201, summary="Crear la cuenta del alumno (código, nombre, contraseña)")
def register(body: RegisterIn) -> dict:
    code, full_name = body.code.strip(), body.full_name.strip()
    if not full_name:
        raise HTTPException(422, "Escribe tu nombre completo")
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT id FROM students WHERE code=?", (code,)).fetchone()
        if row and db.execute("SELECT 1 FROM student_passwords WHERE student_id=?", (row[0],)).fetchone():
            raise HTTPException(409, "Ese código ya tiene cuenta; inicia sesión")
        # Si el docente ya cargó el código en el padrón se conserva ese nombre.
        student_id = row[0] if row else db.execute(
            "INSERT INTO students(code, full_name, created_at) VALUES (?,?,?)", (code, full_name, iso_utc(now()))
        ).lastrowid
        db.execute("INSERT INTO student_passwords VALUES (?,?,?)", (student_id, hash_password(body.password), iso_utc(now())))
        link_phone(db, student_id, body.nfc_token)
        return session_response(db, student_id)


@router.post("/login", summary="Login del alumno; devuelve un token Bearer")
def login(body: LoginIn) -> dict:
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            "SELECT s.id, p.password_hash FROM students s JOIN student_passwords p ON p.student_id=s.id WHERE s.code=?",
            (body.code.strip(),),
        ).fetchone()
        if not verify_password(body.password, row[1] if row else None):
            raise HTTPException(401, "Código o contraseña incorrectos")
        link_phone(db, row[0], body.nfc_token)
        return session_response(db, row[0])


@router.post("/logout", summary="Cerrar la sesión del alumno")
def logout(authorization: Optional[str] = Header(default=None)) -> dict:
    with connect() as db:
        revoke_token(db, bearer(authorization))
    return {"ok": True}


@router.get("/me", summary="Perfil del alumno autenticado")
def me(authorization: Optional[str] = Header(default=None)) -> dict:
    with connect() as db:
        return {"student": profile(db, identity(db, authorization))}


CLASS_SQL = """
SELECT s.id, s.room, s.course, s.started_at, s.ended_at, a.recorded_at, f.kind
FROM sessions s
LEFT JOIN attendance a ON a.session_id=s.id AND a.student_id=:student
LEFT JOIN student_feedback f ON f.session_id=s.id AND f.student_id=:student
"""


def class_row(row) -> dict:
    session_id, room, course, started, ended, attended_at, vote = row
    return {"id": session_id, "room": room, "course": course, "started_at": started, "ended": ended is not None,
            "attended": attended_at is not None, "attended_at": attended_at, "my_vote": vote}


@router.get("/classes", summary="Clases abiertas ahora")
def classes(authorization: Optional[str] = Header(default=None)) -> dict:
    with connect() as db:
        student = identity(db, authorization)
        rows = db.execute(CLASS_SQL + "WHERE s.ended_at IS NULL ORDER BY s.started_at DESC", {"student": student}).fetchall()
        result = [class_row(row) for row in rows]
        for item in result:
            item["metrics"] = live_metrics(db, item["room"])
        return {"classes": result}


@router.get("/history", summary="Últimas asistencias del alumno")
def history(authorization: Optional[str] = Header(default=None)) -> dict:
    with connect() as db:
        student = identity(db, authorization)
        rows = db.execute(
            "SELECT s.id, s.room, s.course, s.started_at, a.recorded_at FROM attendance a "
            "JOIN sessions s ON s.id=a.session_id WHERE a.student_id=? ORDER BY a.recorded_at DESC LIMIT 20",
            (student,),
        ).fetchall()
        return {"history": [{"session_id": r[0], "room": r[1], "course": r[2], "started_at": r[3], "attended_at": r[4]}
                            for r in rows]}


def live_metrics(db: sqlite3.Connection, room: str) -> dict:
    """Última lectura fresca (≤15 s) del nodo de ambiente y la presencia del de acceso."""
    metrics = {}
    for role, status, raw, received in db.execute("SELECT role,status,telemetry,received_at FROM node_state WHERE room=?", (room,)):
        if not raw or not received or status != "online":
            continue
        try:
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(received.replace("Z", "+00:00"))).total_seconds()
            data = json.loads(raw)
        except (ValueError, TypeError):
            continue
        if not 0 <= age <= 15:
            continue
        keys = ("temp_c", "rh_pct", "noise_rel", "light_rel", "comfort", "state", "fan_on", "fan_enabled", "fan_mode") \
            if role == "environment" else ("presence",) if role == "access" else ()
        metrics.update({key: data[key] for key in keys if data.get(key) is not None})
        # PIR por zona: el de acceso vigila la entrada y el de ambiente el interior.
        zone = {"access": "entrance", "environment": "interior"}.get(role)
        if zone and data.get("presence") is not None:
            metrics.setdefault("zones", {})[zone] = data["presence"]
    return metrics


def room_config(db: sqlite3.Connection, room: str) -> dict:
    """Rangos objetivo vigentes del aula (último comfort_params o los de fábrica)."""
    from tuner import factory_config
    row = db.execute("SELECT payload FROM comfort_params WHERE room=? ORDER BY params_version DESC LIMIT 1", (room,)).fetchone()
    cfg = json.loads(row[0]) if row else factory_config(room)
    return {key: cfg.get(key) for key in ("temp_c", "rh_pct", "noise_rel_max", "ok_min", "regular_min")}


def class_trend(db: sqlite3.Connection, room: str, started_at: str) -> list:
    """Promedio por minuto de confort y temperatura desde el inicio (últimos 30 minutos)."""
    try:
        since = datetime.fromisoformat(started_at.replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M")
    except (ValueError, AttributeError):
        return []
    rows = db.execute(
        "SELECT minute_utc, metric, AVG(avg) FROM sensor_minutes WHERE room=? AND metric IN ('comfort','temp_c') "
        "AND minute_utc>=? GROUP BY minute_utc, metric ORDER BY minute_utc DESC LIMIT 60",
        (room, since),
    ).fetchall()
    points: dict = {}
    for minute, metric, value in rows:
        points.setdefault(minute, {"minute": minute.replace(" ", "T") + ":00Z"})[metric] = round(value, 2)
    return sorted(points.values(), key=lambda p: p["minute"])[-30:]


@router.get("/classes/{session_id}", summary="Detalle de una clase para el alumno")
def class_detail(session_id: str, authorization: Optional[str] = Header(default=None)) -> dict:
    with connect() as db:
        student = identity(db, authorization)
        row = db.execute(CLASS_SQL + "WHERE s.id=:id", {"student": student, "id": session_id}).fetchone()
        if row is None:
            raise HTTPException(404, "Clase no encontrada")
        result = class_row(row)
        result["metrics"] = live_metrics(db, result["room"]) if not result["ended"] else {}
        result["my_votes"] = my_votes(db, session_id, student, result["my_vote"])
        result["present_count"] = db.execute("SELECT COUNT(*) FROM attendance WHERE session_id=?", (session_id,)).fetchone()[0]
        result["targets"] = room_config(db, result["room"])
        result["trend"] = class_trend(db, result["room"], result["started_at"])
        return result


@router.post("/classes/{session_id}/feedback", summary="Votar cómo se siente el aula (uno por clase; se reemplaza)")
def vote(session_id: str, body: VoteIn, authorization: Optional[str] = Header(default=None)) -> dict:
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        student = identity(db, authorization)
        session = db.execute("SELECT ended_at FROM sessions WHERE id=?", (session_id,)).fetchone()
        if session is None:
            raise HTTPException(404, "Clase no encontrada")
        if session[0] is not None:
            raise HTTPException(409, "La clase ya terminó")
        at = iso_utc(now())
        kind = body.kind or (TEMP_KIND[body.value] if body.dimension == "temp" else None)
        if kind:
            db.execute(
                "INSERT INTO student_feedback VALUES (?,?,?,?) ON CONFLICT(session_id,student_id) "
                "DO UPDATE SET kind=excluded.kind, created_at=excluded.created_at",
                (session_id, student, kind, at),
            )
        else:
            db.execute(
                "INSERT INTO student_votes VALUES (?,?,?,?,?) ON CONFLICT(session_id,student_id,dimension) "
                "DO UPDATE SET value=excluded.value, created_at=excluded.created_at",
                (session_id, student, body.dimension, body.value, at),
            )
        db.commit()
        result = {"saved": True, "session_id": session_id, "created_at": at}
        result.update({"kind": kind} if kind else {"dimension": body.dimension, "value": body.value})
        return result
