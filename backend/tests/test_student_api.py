import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient
import api


def test_student_journey(tmp_path, monkeypatch):
    database = tmp_path / "demo.db"
    with sqlite3.connect(database) as db:
        db.executescript((Path(__file__).resolve().parents[1] / "schema.sql").read_text())
        db.executemany("INSERT INTO sessions(id,room,device,started_at) VALUES (?,?,?,?)", [("class-a", "a", "a-access", "x"), ("class-b", "b", "b-access", "x")])
    monkeypatch.setenv("DATABASE_PATH", str(database))
    monkeypatch.setenv("LOCAL_TIMEZONE", "America/Lima")
    client = TestClient(api.app, base_url="https://testserver")
    body = {"first_name": "Ana", "last_name": "Pérez", "email": "ana@example.com", "password": "demo-password-123", "nfc_token": "A" * 32}
    created = client.post("/student/register", json=body)
    assert created.status_code == 201
    auth = {"Authorization": "Bearer " + created.json()["access_token"]}
    assert client.post("/student/register", json={**body, "nfc_token": "B" * 32}).status_code == 409
    assert client.post("/student/login", json={"email": body["email"], "password": "incorrect", "nfc_token": body["nfc_token"]}).status_code == 401
    assert client.post("/student/login", json={"email": body["email"], "password": body["password"], "nfc_token": body["nfc_token"]}).status_code == 200
    assert len(client.get("/student/classes", headers=auth).json()["classes"]) == 2
    assert not client.get("/student/classes/class-a", headers=auth).json()["attended"]
    assert client.post("/student/classes/class-a/feedback", json={"kind": "hot"}, headers=auth).status_code == 409
    with sqlite3.connect(database) as db:
        student, credential = db.execute("SELECT student_id,id FROM credentials").fetchone()
        db.execute("INSERT INTO attendance(session_id,student_id,credential_id,recorded_at) VALUES (?,?,?,?)", ("class-b", student, credential, "x"))
        db.execute("INSERT INTO node_state(room,device,role,status,telemetry,received_at) VALUES (?,?,?,?,?,?)", ("a", "a-environment", "environment", "online", json.dumps({"temp_c": 24}), datetime.now(timezone.utc).isoformat()))
    assert not client.get("/student/classes/class-a", headers=auth).json()["attended"]
    with sqlite3.connect(database) as db:
        db.execute("INSERT INTO attendance(session_id,student_id,credential_id,recorded_at) VALUES (?,?,?,?)", ("class-a", student, credential, "x"))
    detail = client.get("/student/classes/class-a", headers=auth).json()
    assert detail["attended"] and detail["metrics"]["temp_c"] == 24
    assert client.post("/student/classes/class-a/feedback", json={"kind": "hot"}, headers=auth).json() == {"saved": True}
    assert client.post("/student/classes/class-a/feedback", json={"kind": "cold"}, headers=auth).status_code == 200
    feedback = client.get("/student/classes/class-a/feedback").json()["data"]
    assert len(feedback) == 1 and feedback[0]["full_name"] == "Ana Pérez" and feedback[0]["kind"] == "cold"
    with sqlite3.connect(database) as db:
        db.execute("UPDATE node_state SET received_at=?", ((datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(),))
        stored = db.execute("SELECT password_hash FROM student_accounts").fetchone()[0]
        db.execute("UPDATE sessions SET ended_at='x' WHERE id='class-a'")
    assert body["password"] not in stored
    assert client.get("/student/classes/class-a", headers=auth).json()["metrics"] == {}
    assert client.post("/student/classes/class-a/feedback", json={"kind": "hot"}, headers=auth).status_code == 409
    assert client.get("/student/classes").status_code == 401


def test_existing_credential_can_be_linked_without_changing_student(tmp_path, monkeypatch):
    database = tmp_path / "existing.db"
    with sqlite3.connect(database) as db:
        db.executescript((Path(__file__).resolve().parents[1] / "schema.sql").read_text())
        db.execute("INSERT INTO students(code,full_name,created_at) VALUES ('old','Nombre Existente','x')")
        db.execute("INSERT INTO credentials(student_id,type,token,created_at) VALUES (1,'android_hce',?,'x')", ("B" * 32,))
    monkeypatch.setenv("DATABASE_PATH", str(database))
    monkeypatch.setenv("LOCAL_TIMEZONE", "America/Lima")
    body = {"first_name": "Otro", "last_name": "Nombre", "email": "otro@example.com", "password": "demo-password-123", "nfc_token": "B" * 32}
    assert TestClient(api.app).post("/student/register", json=body).status_code == 426
    client = TestClient(api.app, base_url="https://testserver")
    response = client.post("/student/register", json=body)
    assert response.status_code == 201
    auth = {"Authorization": "Bearer " + response.json()["access_token"]}
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT count(*),full_name FROM students").fetchone() == (1, "Nombre Existente")
        db.execute("UPDATE credentials SET active=0")
    assert client.get("/student/classes", headers=auth).status_code == 401
