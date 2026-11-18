"""CRUD de sesiones de clase para el docente. Misma autoridad que el nodo de acceso:
la fila en sessions + room_runtime, y después del commit el retenido classai/v1/{room}/session."""
import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import multinode
from auth import connect, now
from temperature_service import iso_utc

router = APIRouter(prefix="/sessions", tags=["classes"])


class SessionIn(BaseModel):
    room: str = Field(pattern="^[a-z0-9-]{1,32}$")
    course: str = Field(min_length=1, max_length=80)
    started_at: Optional[datetime] = None  # hora de inicio; por defecto, ahora


def publish_session(room: str, state: dict) -> bool:
    """Publicación corta con las variables MQTT_* (TLS si MQTT_TLS=1). Si falla, SQLite sigue
    siendo la autoridad y la ingesta reconstruye el retenido al reconectar."""
    import paho.mqtt.publish as mqtt_publish

    username = os.getenv("MQTT_USERNAME") or None
    try:
        mqtt_publish.single(
            f"classai/v1/{room}/session", json.dumps(state, separators=(",", ":")), qos=1, retain=True,
            hostname=os.getenv("MQTT_HOST", "127.0.0.1"), port=int(os.getenv("MQTT_PORT", "1883")),
            auth={"username": username, "password": os.getenv("MQTT_PASSWORD") or None} if username else None,
            tls={"ca_certs": os.getenv("MQTT_CA_FILE") or None} if os.getenv("MQTT_TLS", "0") == "1" else None,
        )
        return True
    except Exception as error:
        print(f"No se pudo publicar la sesión de {room}: {error!r}")
        return False


def end_session(db: sqlite3.Connection, session_id: str, room: str, at: str) -> None:
    from backend import materialize_session_summary

    db.execute("UPDATE sessions SET ended_at=? WHERE id=? AND ended_at IS NULL", (at, session_id))
    materialize_session_summary(db, session_id)
    db.execute("INSERT OR IGNORE INTO room_runtime(room, revision) VALUES (?, 0)", (room,))
    db.execute("UPDATE room_runtime SET revision=revision+1, session_id=NULL WHERE room=? AND session_id=?", (room, session_id))


def detail(db: sqlite3.Connection, session_id: str) -> dict:
    row = db.execute("SELECT id, room, course, device, started_at, ended_at FROM sessions WHERE id=?", (session_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "La sesión no existe")
    result = dict(zip(("session_id", "room", "course", "device", "started_at", "ended_at"), row))
    result["open"] = result["ended_at"] is None
    result["attendance_count"] = db.execute("SELECT COUNT(*) FROM attendance WHERE session_id=?", (session_id,)).fetchone()[0]
    result["votes"] = vote_counts(db, session_id)
    result["votes_by_dimension"] = dimension_counts(db, session_id)
    return result


def vote_counts(db: sqlite3.Connection, session_id: str) -> dict:
    counts = {"ok": 0, "hot": 0, "cold": 0}
    for kind, count in db.execute("SELECT kind, COUNT(*) FROM student_feedback WHERE session_id=? GROUP BY kind", (session_id,)):
        counts[kind] = count
    return counts


def dimension_counts(db: sqlite3.Connection, session_id: str) -> dict:
    """Votos de luz, ruido, movimiento y humedad: {"light": {"low": 1, "ok": 0, "high": 2}, ...}."""
    counts = {d: {"low": 0, "ok": 0, "high": 0} for d in ("light", "noise", "motion", "humidity")}
    for dimension, value, count in db.execute(
            "SELECT dimension, value, COUNT(*) FROM student_votes WHERE session_id=? GROUP BY dimension, value", (session_id,)):
        counts[dimension][value] = count
    return counts


@router.post("", status_code=201, summary="Crear (abrir) una sesión de clase en un aula")
def create_session(body: SessionIn) -> dict:
    room, course = body.room, body.course.strip()
    if not course:
        raise HTTPException(422, "Indica el curso")
    started = iso_utc(body.started_at.replace(tzinfo=body.started_at.tzinfo or timezone.utc)) if body.started_at else iso_utc(now())
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        if db.execute("SELECT 1 FROM sessions WHERE room=? AND ended_at IS NULL", (room,)).fetchone():
            raise HTTPException(409, f"Ya hay una clase abierta en {room.upper()}; ciérrala primero")
        session_id = f"{room}-{uuid4().hex}"
        db.execute(
            "INSERT INTO sessions(id, room, device, course, started_at, params_version) "
            "VALUES (?, ?, 'web', ?, ?, COALESCE((SELECT MAX(params_version) FROM comfort_params WHERE room=?), 0))",
            (session_id, room, course, started, room),
        )
        db.execute("INSERT OR IGNORE INTO room_runtime(room, revision) VALUES (?, 0)", (room,))
        db.execute("UPDATE room_runtime SET revision=revision+1, session_id=? WHERE room=?", (session_id, room))
        db.commit()
        state = multinode.session_state(db, room)
        result = detail(db, session_id)
    return {**result, "published": publish_session(room, state)}


@router.get("/{session_id}", summary="Ver una sesión: estado, asistencia y votos")
def get_session(session_id: str) -> dict:
    with connect() as db:
        return detail(db, session_id)


@router.post("/{session_id}/close", summary="Cerrar (finalizar) una sesión abierta")
def close_session(session_id: str) -> dict:
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT room, ended_at FROM sessions WHERE id=?", (session_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "La sesión no existe")
        if row[1] is not None:
            raise HTTPException(409, "La sesión ya está cerrada")
        end_session(db, session_id, row[0], iso_utc(now()))
        db.commit()
        state = multinode.session_state(db, row[0])
        result = detail(db, session_id)
    return {**result, "published": publish_session(row[0], state)}


@router.delete("/{session_id}", summary="Eliminar una sesión con su asistencia, votos y resumen")
def delete_session(session_id: str) -> dict:
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT room, ended_at FROM sessions WHERE id=?", (session_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "La sesión no existe")
        was_open = row[1] is None
        if was_open:
            db.execute("UPDATE room_runtime SET revision=revision+1, session_id=NULL WHERE room=? AND session_id=?", (row[0], session_id))
        for table in ("attendance", "student_feedback", "student_votes", "session_summaries"):
            db.execute(f"DELETE FROM {table} WHERE session_id=?", (session_id,))
        db.execute("DELETE FROM sessions WHERE id=?", (session_id,))
        db.commit()
        state = multinode.session_state(db, row[0])
    return {"deleted": True, "session_id": session_id, "published": publish_session(row[0], state) if was_open else None}


@router.get("/{session_id}/votes", summary="Votos de los alumnos en una sesión")
def session_votes(session_id: str) -> dict:
    with connect() as db:
        rows = db.execute(
            "SELECT s.code, s.full_name, f.kind, f.created_at FROM student_feedback f JOIN students s ON s.id=f.student_id "
            "WHERE f.session_id=? ORDER BY f.created_at DESC",
            (session_id,),
        ).fetchall()
        others = db.execute(
            "SELECT s.code, s.full_name, v.dimension, v.value, v.created_at FROM student_votes v JOIN students s ON s.id=v.student_id "
            "WHERE v.session_id=? ORDER BY v.created_at DESC",
            (session_id,),
        ).fetchall()
        return {"counts": vote_counts(db, session_id), "count": len(rows),
                "data": [dict(zip(("student_code", "full_name", "kind", "created_at"), row)) for row in rows],
                "dimensions": dimension_counts(db, session_id),
                "dimension_data": [dict(zip(("student_code", "full_name", "dimension", "value", "created_at"), row)) for row in others]}
