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

    # Retry / lost HTTP response: same phone is idempotent and does not rename the student.
    again = client.post("/mobile/enroll", json=body)
    assert again.status_code == 200 and again.json() == ok.json()
    assert connection.execute("SELECT COUNT(*) FROM credentials").fetchone() == (1,)
    assert TOKEN not in again.text

    # Revocation is never silently undone by retrying the old token.
    connection.execute("UPDATE credentials SET active = 0, revoked_at = 'x'")
    connection.commit()
    assert client.post("/mobile/enroll", json=body).status_code == 409
    assert connection.execute("SELECT active FROM credentials").fetchall() == [(0,)]


def test_concurrent_same_student_cannot_enroll_two_phones(tmp_path, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    database = tmp_path / "classai.db"
    with sqlite3.connect(database) as connection:
        connection.executescript((Path(__file__).resolve().parents[1] / "schema.sql").read_text())
        connection.execute("INSERT INTO students (code, full_name, created_at) VALUES ('202999001','Lab','x')")
    monkeypatch.setenv("DATABASE_PATH", str(database))
    monkeypatch.setenv("LOCAL_TIMEZONE", "America/Lima")
    def enroll(token):
        with TestClient(api.app) as client:
            return client.post("/mobile/enroll", json={"student_code":"202999001", "full_name":"Lab", "token":token}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(enroll, ["A" * 32, "B" * 32])) == [200, 409]
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT COUNT(*) FROM credentials WHERE active = 1").fetchone() == (1,)
