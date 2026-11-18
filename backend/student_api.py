"""Registro, login (Bearer), clases abiertas y votos de los alumnos para la app Android."""
import json
import sqlite3
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

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
    kind: Literal["ok", "hot", "cold", "noisy", "dark"]


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
        return {"classes": [class_row(row) for row in rows]}


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
        keys = ("temp_c", "rh_pct", "noise_rel", "light_rel", "comfort", "state") if role == "environment" else ("presence",) if role == "access" else ()
        metrics.update({key: data[key] for key in keys if data.get(key) is not None})
    return metrics


@router.get("/classes/{session_id}", summary="Detalle de una clase para el alumno")
def class_detail(session_id: str, authorization: Optional[str] = Header(default=None)) -> dict:
    with connect() as db:
        student = identity(db, authorization)
        row = db.execute(CLASS_SQL + "WHERE s.id=:id", {"student": student, "id": session_id}).fetchone()
        if row is None:
            raise HTTPException(404, "Clase no encontrada")
        result = class_row(row)
        result["metrics"] = live_metrics(db, result["room"]) if not result["ended"] else {}
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
        db.execute(
            "INSERT INTO student_feedback VALUES (?,?,?,?) ON CONFLICT(session_id,student_id) "
            "DO UPDATE SET kind=excluded.kind, created_at=excluded.created_at",
            (session_id, student, body.kind, at),
        )
        db.commit()
        return {"saved": True, "session_id": session_id, "kind": body.kind, "created_at": at}
