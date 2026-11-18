import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import api
import auth
import class_sessions
import create_teacher

TOKEN = "9F2C4A01B7E35D6688C1F0A2B4D6E8F0"


@pytest.fixture
def client(tmp_path, monkeypatch):
    database = tmp_path / "classai.db"
    monkeypatch.setenv("DATABASE_PATH", str(database))
    monkeypatch.setenv("LOCAL_TIMEZONE", "America/Lima")
    monkeypatch.setenv("TEACHER_USER", "docente")
    monkeypatch.setenv("TEACHER_PASSWORD", "clave-segura-1")
    assert create_teacher.main(["--from-env"]) == 0
    assert create_teacher.main(["--from-env"]) == 0  # idempotente
    published = []
    monkeypatch.setattr(class_sessions, "publish_session", lambda room, state: published.append(state) or True)
    api.app.dependency_overrides.clear()  # auth real
    test_client = TestClient(api.app, base_url="https://testserver")  # la cookie es Secure
    test_client.database = database
    test_client.published = published
    return test_client


def login(client):
    response = client.post("/auth/login", json={"username": "docente", "password": "clave-segura-1"})
    assert response.status_code == 200
    return response


def test_teacher_login_logout_and_protected_route(client):
    assert client.get("/sessions").status_code == 401  # ruta existente del panel
    assert client.get("/auth/me").status_code == 401
    assert client.post("/auth/login", json={"username": "docente", "password": "otra"}).status_code == 401
    assert client.post("/auth/login", json={"username": "nadie", "password": "x"}).status_code == 401
    cookie = login(client).headers["set-cookie"].lower()
    assert "httponly" in cookie and "secure" in cookie and "samesite=lax" in cookie
    assert client.get("/auth/me").json()["teacher"]["username"] == "docente"
    assert client.get("/sessions").status_code == 200
    stored = sqlite3.connect(client.database).execute("SELECT password_hash FROM teachers").fetchone()[0]
    assert stored.startswith("scrypt$") and "clave-segura-1" not in stored
    client.post("/auth/logout")
    assert client.get("/sessions").status_code == 401
    assert client.get("/health").status_code == 200  # pública


def test_session_crud_and_votes_of_registered_student(client):
    login(client)
    created = client.post("/sessions", json={"room": "a101", "course": "CS5055 IoT"})
    assert created.status_code == 201
    session = created.json()
    sid = session["session_id"]
    assert session["open"] and session["course"] == "CS5055 IoT"
    assert client.published[-1]["session_id"] == sid  # el nodo de acceso recibe el retenido
    assert client.post("/sessions", json={"room": "a101", "course": "Otro"}).status_code == 409
    assert client.post("/sessions", json={"room": "a101"}).status_code == 422  # el curso es obligatorio
    assert client.get("/sessions").json()["data"][0]["session_id"] == sid

    # Alumno nuevo: se registra y el servidor lo reconoce de inmediato.
    student = TestClient(api.app, base_url="https://testserver")
    body = {"code": "202310123", "full_name": "Valeria Quispe", "password": "secreta1", "nfc_token": TOKEN.lower()}
    registered = student.post("/student/register", json=body)
    assert registered.status_code == 201
    assert registered.json()["student"] == {"code": "202310123", "full_name": "Valeria Quispe", "phone_linked": True}
    assert student.post("/student/register", json=body).status_code == 409
    assert student.post("/student/login", json={"code": "202310123", "password": "mala"}).status_code == 401
    bearer = {"Authorization": "Bearer " + student.post("/student/login", json={"code": "202310123", "password": "secreta1"}).json()["access_token"]}
    assert student.get("/student/classes").status_code == 401
    classes = student.get("/student/classes", headers=bearer).json()["classes"]
    assert [c["id"] for c in classes] == [sid] and classes[0]["course"] == "CS5055 IoT"

    # El token HCE registrado es el que resuelve la asistencia del nodo de acceso.
    import json
    from datetime import datetime, timezone
    from types import SimpleNamespace

    import backend
    import multinode
    database = backend.Database(str(client.database))
    assert database.ensure_ready()
    sent = []
    mqtt_client = SimpleNamespace(publish=lambda topic, payload, **kw: sent.append((topic, json.loads(payload))))
    tap = {"v": 1, "room": "a101", "device": "a101-access", "role": "access", "event": "ATTENDANCE_RECORDED",
           "event_id": "a101-access-1-1", "session_id": sid, "ts": None, "uptime_ms": 1,
           "credential": {"type": "android_hce", "token": TOKEN}}
    message = SimpleNamespace(topic="classai/v1/a101/nodes/a101-access/events", payload=json.dumps(tap).encode())
    assert multinode.handle(message, datetime.now(timezone.utc), database, backend.SensorMinuteAccumulator(), mqtt_client)
    ack = next(body for topic, body in sent if topic.endswith("/ack"))
    assert ack["accepted"] is True and ack["outcome"] == "new" and ack["attendance_count"] == 1
    database.close()
    assert student.get(f"/student/classes/{sid}", headers=bearer).json()["attended"] is True

    # El alumno ve el aula completa: zonas PIR, ventilador, presentes, rangos y tendencia.
    fresh = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    minute = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    with sqlite3.connect(client.database) as db:
        db.execute("INSERT OR REPLACE INTO node_state VALUES ('a101','a101-environment','environment','online',?,?,?)",
                   (fresh, json.dumps({"temp_c": 24.5, "rh_pct": 52, "noise_rel": 0.08, "light_rel": 0.6, "comfort": 86,
                                       "state": "OK", "presence": True, "fan_on": False, "fan_enabled": True}), fresh))
        db.execute("INSERT OR REPLACE INTO node_state VALUES ('a101','a101-access','access','online',?,?,?)",
                   (fresh, json.dumps({"presence": False, "comfort": None}), fresh))
        db.execute("INSERT OR REPLACE INTO sensor_minutes VALUES ('a101','a101-environment','comfort',?,6,80,90,85)", (minute,))
    live = student.get(f"/student/classes/{sid}", headers=bearer).json()
    assert live["metrics"]["zones"] == {"entrance": False, "interior": True}
    assert live["metrics"]["presence"] is False and live["metrics"]["fan_on"] is False
    assert live["present_count"] == 1 and live["targets"]["temp_c"] == [21, 24]
    assert live["trend"][-1]["comfort"] == 85
    assert student.get("/student/classes", headers=bearer).json()["classes"][0]["metrics"]["comfort"] == 86
    history = student.get("/student/history", headers=bearer).json()["history"]
    assert [h["session_id"] for h in history] == [sid] and history[0]["course"] == "CS5055 IoT"
    assert student.get("/student/history").status_code == 401

    assert student.post(f"/student/classes/{sid}/feedback", json={"kind": "hot"}, headers=bearer).json()["saved"]
    assert student.post(f"/student/classes/{sid}/feedback", json={"kind": "cold"}, headers=bearer).status_code == 200
    assert student.post(f"/student/classes/{sid}/feedback", json={"kind": "tibio"}, headers=bearer).status_code == 422
    # Votos por dimensión: uno por sensor; temp sigue en el voto clásico.
    for dimension, value in (("light", "low"), ("noise", "high"), ("noise", "ok"), ("motion", "high")):
        assert student.post(f"/student/classes/{sid}/feedback", json={"dimension": dimension, "value": value}, headers=bearer).json()["saved"]
    assert student.post(f"/student/classes/{sid}/feedback", json={"dimension": "light"}, headers=bearer).status_code == 422
    assert student.post(f"/student/classes/{sid}/feedback", json={"dimension": "olor", "value": "ok"}, headers=bearer).status_code == 422
    mine = student.get(f"/student/classes/{sid}", headers=bearer).json()["my_votes"]
    assert mine == {"temp": "low", "light": "low", "noise": "ok", "motion": "high"}
    votes = client.get(f"/sessions/{sid}/votes").json()
    assert votes["counts"] == {"ok": 0, "hot": 0, "cold": 1} and votes["data"][0]["full_name"] == "Valeria Quispe"
    assert votes["dimensions"]["noise"] == {"low": 0, "ok": 1, "high": 0} and votes["dimensions"]["humidity"]["ok"] == 0
    assert {(v["dimension"], v["value"]) for v in votes["dimension_data"]} == {("light", "low"), ("noise", "ok"), ("motion", "high")}
    detail = client.get(f"/sessions/{sid}").json()
    assert detail["attendance_count"] == 1 and detail["votes"]["cold"] == 1

    closed = client.post(f"/sessions/{sid}/close")
    assert closed.status_code == 200 and not closed.json()["open"]
    assert client.published[-1]["session_id"] is None
    assert client.post(f"/sessions/{sid}/close").status_code == 409
    assert student.get("/student/classes", headers=bearer).json()["classes"] == []
    assert student.post(f"/student/classes/{sid}/feedback", json={"kind": "ok"}, headers=bearer).status_code == 409

    assert client.delete(f"/sessions/{sid}").json()["deleted"]
    assert client.get(f"/sessions/{sid}").status_code == 404
    with sqlite3.connect(client.database) as db:
        assert db.execute("SELECT COUNT(*) FROM attendance").fetchone()[0] == 0


def test_register_claims_roster_code_and_relinks_phone(client):
    with sqlite3.connect(client.database) as db:
        db.execute("INSERT INTO students(code, full_name, created_at) VALUES ('U1', 'Nombre del padrón', 'x')")
        # Teléfono que ya estaba vinculado a otra cuenta (p.ej. registro de la demo anterior).
        db.execute("INSERT INTO students(code, full_name, created_at) VALUES ('demo-1', 'Viejo', 'x')")
        db.execute("INSERT INTO credentials(student_id, type, token, created_at) VALUES (2, 'android_hce', ?, 'x')", (TOKEN,))
    student = TestClient(api.app, base_url="https://testserver")
    body = {"code": "U1", "full_name": "Otro", "password": "secreta1", "nfc_token": TOKEN}
    created = student.post("/student/register", json=body).json()
    assert created["student"]["full_name"] == "Nombre del padrón"
    with sqlite3.connect(client.database) as db:
        assert db.execute("SELECT student_id FROM credentials WHERE active=1").fetchall() == [(1,)]
    # Login desde otro teléfono: el nuevo token reemplaza al anterior.
    student.post("/student/login", json={"code": "U1", "password": "secreta1", "nfc_token": "A" * 32})
    with sqlite3.connect(client.database) as db:
        assert db.execute("SELECT token FROM credentials WHERE active=1").fetchall() == [("A" * 32,)]


def test_startup_over_previous_demo_schema(tmp_path, monkeypatch):
    """La VM ya tiene tablas del despliegue anterior: el esquema nuevo debe aplicarse encima."""
    import subprocess
    old = subprocess.run(["git", "show", "origin/codex/three-node-local-smoke:backend/schema.sql"],
                         capture_output=True, text=True, cwd=Path(__file__).parent)
    if old.returncode:
        pytest.skip("rama del despliegue anterior no disponible")
    database = tmp_path / "old.db"
    sqlite3.connect(database).executescript(old.stdout)
    monkeypatch.setenv("DATABASE_PATH", str(database))
    monkeypatch.setenv("LOCAL_TIMEZONE", "America/Lima")
    monkeypatch.setenv("TEACHER_USER", "docente")
    monkeypatch.setenv("TEACHER_PASSWORD", "clave-segura-1")
    assert create_teacher.main(["--from-env"]) == 0
    api.app.dependency_overrides.clear()
    client = TestClient(api.app, base_url="https://testserver")
    assert client.post("/student/register", json={"code": "X1", "full_name": "Ana", "password": "secreta1"}).status_code == 201
    assert auth.verify_password("clave-segura-1", sqlite3.connect(database).execute("SELECT password_hash FROM teachers").fetchone()[0])


def test_assistant_tools_reach_protected_routes(client, monkeypatch):
    """llm_tools llama a la API por HTTP sin cookie: la clave interna del proceso la deja pasar."""
    import llm_tools

    monkeypatch.setattr(llm_tools.requests, "get", lambda url, params=None, timeout=None, headers=None:
                        client.get(url.replace("http://api", ""), params=params, headers=headers))
    assert "error" not in llm_tools._get("http://api", "/sessions")
    assert client.get("/sessions", headers={auth.INTERNAL_HEADER: "otra"}).status_code == 401
