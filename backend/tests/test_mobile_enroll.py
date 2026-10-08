import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

import api

TOKEN = "9F2C4A01B7E35D6688C1F0A2B4D6E8F0"


def test_mobile_enroll(tmp_path, monkeypatch):
    database = tmp_path / "classai.db"
    connection = sqlite3.connect(database)
    connection.executescript((Path(__file__).resolve().parents[1] / "schema.sql").read_text())
    connection.execute("INSERT INTO students (code, full_name, created_at) VALUES ('202310123', 'Valeria Quispe', 'x')")
    connection.commit()
    monkeypatch.setenv("DATABASE_PATH", str(database))
    monkeypatch.setenv("LOCAL_TIMEZONE", "America/Lima")
    client = TestClient(api.app)

    body = {"student_code": "202310123", "full_name": "Otro nombre", "token": TOKEN.lower()}
    ok = client.post("/mobile/enroll", json=body)
    assert ok.status_code == 200
    assert ok.json()["full_name"] == "Valeria Quispe" and ok.json()["status"] == "active"
    stored = connection.execute("SELECT type, token, active FROM credentials").fetchall()
    assert stored == [("android_hce", TOKEN, 1)]

    # Segundo teléfono del mismo estudiante: el docente debe revocar primero.
    other = dict(body, token="A" * 32)
    assert client.post("/mobile/enroll", json=other).status_code == 409

    # Código que no está en ninguna clase.
    assert client.post("/mobile/enroll", json=dict(body, student_code="999")).status_code == 404
    # Token con formato inválido.
    assert client.post("/mobile/enroll", json=dict(body, token="Z" * 32)).status_code == 400
