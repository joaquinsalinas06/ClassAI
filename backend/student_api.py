"""Cuentas y opiniones de alumnos para el laboratorio; requiere HTTPS en el cliente."""
import hashlib
import hmac
import json
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field
from temperature_service import TemperatureService, normalize_credential, iso_utc

router = APIRouter(prefix="/student", tags=["student"])


def connect():
    return TemperatureService.from_environment().write_connection()


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 600_000).hex()
    return f"{salt}${digest}"


def identity(connection, authorization):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Inicia sesión")
    token_hash = hashlib.sha256(authorization[7:].encode()).hexdigest()
    row = connection.execute("SELECT a.student_id FROM student_sessions s JOIN student_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>? AND EXISTS (SELECT 1 FROM credentials c WHERE c.student_id=a.student_id AND c.type='android_hce' AND c.active=1)", (token_hash, iso_utc(datetime.now(timezone.utc)))).fetchone()
    if not row:
        raise HTTPException(401, "Sesión vencida")
    return row[0]


def issue(connection, account_id):
    token = secrets.token_urlsafe(32)
    expiry = iso_utc(datetime.now(timezone.utc) + timedelta(days=7))
    connection.execute("INSERT INTO student_sessions VALUES (?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), account_id, expiry))
    connection.commit()
    return {"access_token": token, "expires_at": expiry}


class Register(BaseModel):
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(min_length=1, max_length=60)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=10, max_length=128)
    nfc_token: str = Field(min_length=32, max_length=32)


class Login(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)
    nfc_token: str = Field(min_length=32, max_length=32)


def normalize_email(email):
    email = email.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(422, "Correo inválido")
    return email


@router.post("/register", status_code=201)
def register(body: Register, request: Request):
    if request.url.scheme != "https":
        raise HTTPException(426, "Se requiere HTTPS")
    email = normalize_email(body.email)
    first, last = body.first_name.strip(), body.last_name.strip()
    if not first or not last:
        raise HTTPException(422, "Escribe tu nombre y apellidos")
    try:
        _, nfc = normalize_credential("android_hce", body.nfc_token)
    except ValueError as error:
        raise HTTPException(422, "Credencial inválida") from error
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        credential = db.execute("SELECT student_id,active FROM credentials WHERE type='android_hce' AND token=?", (nfc,)).fetchone()
        try:
            if credential:
                student, active = credential
                if not active or db.execute("SELECT 1 FROM student_accounts WHERE student_id=?", (student,)).fetchone():
                    raise HTTPException(409, "Este teléfono ya está vinculado o fue revocado")
            else:
                student = db.execute("INSERT INTO students(code,full_name,created_at) VALUES (?,?,?)", ("demo-" + secrets.token_hex(12), f"{first} {last}", iso_utc(datetime.now(timezone.utc)))).lastrowid
                db.execute("INSERT INTO credentials(student_id,type,token,created_at) VALUES (?,'android_hce',?,?)", (student, nfc, iso_utc(datetime.now(timezone.utc))))
            account = db.execute("INSERT INTO student_accounts(student_id,email,password_hash) VALUES (?,?,?)", (student, email, password_hash(body.password))).lastrowid
        except sqlite3.IntegrityError as error:
            raise HTTPException(409, "Correo o credencial ya registrado") from error
        return issue(db, account)


@router.post("/login")
def login(body: Login, request: Request):
    if request.url.scheme != "https":
        raise HTTPException(426, "Se requiere HTTPS")
    email = normalize_email(body.email)
    try:
        _, nfc = normalize_credential("android_hce", body.nfc_token)
    except ValueError as error:
        raise HTTPException(422, "Credencial inválida") from error
    with connect() as db:
        row = db.execute("SELECT id,password_hash,student_id FROM student_accounts WHERE email=?", (email,)).fetchone()
        expected = row[1] if row else password_hash("invalid-demo-password")
        if not hmac.compare_digest(password_hash(body.password, expected.split('$')[0]), expected) or not row:
            raise HTTPException(401, "Correo o contraseña incorrectos")
        existing = db.execute("SELECT token FROM credentials WHERE student_id=? AND type='android_hce' AND active=1", (row[2],)).fetchone()
        if not existing or not hmac.compare_digest(existing[0], nfc):
            raise HTTPException(409, "Esta cuenta está vinculada a otro teléfono")
        return issue(db, row[0])


@router.get("/classes")
def classes(authorization: str | None = Header(default=None)):
    with connect() as db:
        identity(db, authorization)
        rows = db.execute("SELECT id,room,course,started_at FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC").fetchall()
        return {"classes": [dict(zip(("id", "room", "course", "started_at"), row)) for row in rows]}


def eligible(db, student, session_id):
    row = db.execute("SELECT s.room,s.course,s.started_at,s.ended_at,a.recorded_at FROM sessions s LEFT JOIN attendance a ON a.session_id=s.id AND a.student_id=? WHERE s.id=?", (student, session_id)).fetchone()
    if not row:
        raise HTTPException(404, "Clase no encontrada")
    return row


@router.get("/classes/{session_id}")
def class_detail(session_id: str, authorization: str | None = Header(default=None)):
    with connect() as db:
        student = identity(db, authorization)
        room, course, started, ended, attendance = eligible(db, student, session_id)
        result = {"room": room, "course": course, "started_at": started, "ended": bool(ended), "attended": bool(attendance), "metrics": {}}
        if not attendance:
            return result
        now = datetime.now(timezone.utc)
        for role, status, raw, received in db.execute("SELECT role,status,telemetry,received_at FROM node_state WHERE room=?", (room,)):
            if not raw or not received or status != "online":
                continue
            try:
                age = (now - datetime.fromisoformat(received.replace('Z', '+00:00'))).total_seconds()
                if not 0 <= age <= 15:
                    continue
                data = json.loads(raw)
            except (ValueError, TypeError):
                continue
            keys = ("temp_c", "noise_rel", "lux", "light_rel") if role == "environment" else ("presence",) if role == "access" else ()
            result["metrics"].update({key: data.get(key) for key in keys if data.get(key) is not None})
        return result


class Feedback(BaseModel):
    kind: Literal["ok", "hot", "cold", "noisy", "dark"]


@router.post("/classes/{session_id}/feedback")
def feedback(session_id: str, body: Feedback, authorization: str | None = Header(default=None)):
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        student = identity(db, authorization)
        _, _, _, ended, attendance = eligible(db, student, session_id)
        if ended or not attendance:
            raise HTTPException(409, "Marca asistencia en una clase activa")
        db.execute("INSERT INTO student_feedback VALUES (?,?,?,?) ON CONFLICT(session_id,student_id) DO UPDATE SET kind=excluded.kind,created_at=excluded.created_at", (session_id, student, body.kind, iso_utc(datetime.now(timezone.utc))))
        db.commit()
        return {"saved": True}


@router.get("/classes/{session_id}/feedback")
def feedback_list(session_id: str):
    with connect() as db:
        rows = db.execute("SELECT s.full_name,f.kind,f.created_at FROM student_feedback f JOIN students s ON s.id=f.student_id WHERE f.session_id=? ORDER BY f.created_at DESC", (session_id,)).fetchall()
        return {"data": [dict(zip(("full_name", "kind", "created_at"), row)) for row in rows]}
