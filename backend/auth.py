"""Login de docentes (cookie httpOnly) y utilidades compartidas con el login de alumnos (Bearer)."""
import hashlib
import hmac
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from temperature_service import DatabaseTemporarilyUnavailableError, TemperatureService, iso_utc

COOKIE = "classai_session"
TEACHER_TTL = timedelta(hours=12)
STUDENT_TTL = timedelta(days=30)
# Rutas que no exigen la cookie del docente: tienen su propia auth (Bearer, X-API-Key,
# X-Voice-Key) o son públicas a propósito.
PUBLIC_PATHS = {"/health", "/auth/login", "/auth/logout", "/auth/me", "/mobile/enroll", "/assistant/voice", "/credentials"}
PUBLIC_PREFIXES = ("/student/", "/credentials/")

router = APIRouter(prefix="/auth", tags=["auth"])


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: Optional[str]) -> bool:
    try:
        _, salt, digest = (stored or "scrypt$00$00").split("$")
        candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
    except ValueError:
        return False
    return stored is not None and hmac.compare_digest(candidate.hex(), digest)


def connect() -> sqlite3.Connection:
    try:
        return TemperatureService.from_environment().write_connection()
    except DatabaseTemporarilyUnavailableError as error:
        raise HTTPException(503, "La base de datos no está disponible") from error


def now() -> datetime:
    return datetime.now(timezone.utc)


def issue_token(connection: sqlite3.Connection, role: str, subject_id: int, ttl: timedelta) -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    expires = iso_utc(now() + ttl)
    connection.execute("DELETE FROM auth_tokens WHERE expires_at <= ?", (iso_utc(now()),))
    connection.execute("INSERT INTO auth_tokens VALUES (?,?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), role, subject_id, expires))
    connection.commit()
    return token, expires


def token_subject(connection: sqlite3.Connection, role: str, token: Optional[str]) -> Optional[int]:
    if not token:
        return None
    row = connection.execute(
        "SELECT subject_id FROM auth_tokens WHERE token_hash=? AND role=? AND expires_at>?",
        (hashlib.sha256(token.encode()).hexdigest(), role, iso_utc(now())),
    ).fetchone()
    return row[0] if row else None


def revoke_token(connection: sqlite3.Connection, token: Optional[str]) -> None:
    if token:
        connection.execute("DELETE FROM auth_tokens WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),))
        connection.commit()


def current_teacher(request: Request) -> Optional[dict]:
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    with connect() as connection:
        teacher_id = token_subject(connection, "teacher", token)
        row = teacher_id and connection.execute("SELECT id, username, full_name FROM teachers WHERE id=?", (teacher_id,)).fetchone()
    return dict(zip(("id", "username", "full_name"), row)) if row else None


def teacher_guard(request: Request) -> None:
    """Dependencia global: todo lo que no sea público exige la cookie del docente."""
    path = request.url.path
    if path in PUBLIC_PATHS or path.startswith(PUBLIC_PREFIXES):
        return
    if current_teacher(request) is None:
        raise HTTPException(401, "Inicia sesión como docente")


def create_teacher(connection: sqlite3.Connection, username: str, password: str, full_name: str) -> int:
    if len(password) < 8:
        raise ValueError("La contraseña debe tener al menos 8 caracteres")
    cursor = connection.execute(
        "INSERT INTO teachers(username, full_name, password_hash, created_at) VALUES (?,?,?,?)",
        (username.strip(), full_name.strip() or username.strip(), hash_password(password), iso_utc(now())),
    )
    connection.commit()
    return cursor.lastrowid


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


@router.post("/login", summary="Login del docente; deja una cookie httpOnly")
def login(body: LoginIn, response: Response) -> dict:
    with connect() as connection:
        row = connection.execute("SELECT id, username, full_name, password_hash FROM teachers WHERE username=?", (body.username.strip(),)).fetchone()
        # Se verifica igual sin usuario para no revelar cuáles existen por el tiempo de respuesta.
        if not verify_password(body.password, row[3] if row else None):
            raise HTTPException(401, "Usuario o contraseña incorrectos")
        token, expires = issue_token(connection, "teacher", row[0], TEACHER_TTL)
    response.set_cookie(COOKIE, token, max_age=int(TEACHER_TTL.total_seconds()), httponly=True, secure=True, samesite="lax", path="/")
    return {"teacher": {"id": row[0], "username": row[1], "full_name": row[2]}, "expires_at": expires}


@router.post("/logout", summary="Cerrar la sesión del docente")
def logout(request: Request, response: Response) -> dict:
    with connect() as connection:
        revoke_token(connection, request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE, path="/", secure=True, httponly=True, samesite="lax")
    return {"ok": True}


@router.get("/me", summary="Docente de la sesión actual")
def me(request: Request) -> dict:
    teacher = current_teacher(request)
    if teacher is None:
        raise HTTPException(401, "Inicia sesión como docente")
    return {"teacher": teacher}
