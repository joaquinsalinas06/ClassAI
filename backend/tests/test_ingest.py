import json
import math
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pytest

from backend import (
    SCHEMA_PATH,
    SensorMinuteAccumulator,
    parse_event,
    parse_telemetry,
    save_sensor_minutes,
    store_event,
)
from temperature_service import enroll_credential, revoke_credential


ROOM = "a101"
SESSION = "a101-20261014T140000Z"
CARD_A = "04A1B2C3D4E5F6"
HCE_A = "9F2C4A01B7E35D6688C1F0A2B4D6E8F0"
HCE_B = "00112233445566778899AABBCCDDEEFF"
CARD_REVOKED = "DEADBEEF"


@pytest.fixture
def db(tmp_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(tmp_path / "classai.db")
    connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    return connection


def telemetry(**overrides) -> dict:
    data = {"v": 1, "device": "esp32-a101", "room": ROOM, "session_id": SESSION, "ts": None,
            "uptime_ms": 1000, "temp_c": 23.4, "rh_pct": None, "presence": True, "comfort": 82,
            "state": "OK", "params_version": 0}
    return {**data, **overrides}


def send(db: sqlite3.Connection, event: str, event_id: str, ts: str, **extra) -> str:
    data = {"v": 1, "event": event, "event_id": event_id, "device": "esp32-a101", "room": ROOM,
            "session_id": SESSION, "ts": ts, "uptime_ms": 1, **extra}
    result = store_event(db, parse_event(ROOM, data), json.dumps(data), "2026-10-14T14:00:00Z")
    db.commit()
    return result


def attend(db: sqlite3.Connection, event_id: str, credential_type: str, token: str, ts: str = "2026-10-14T14:01:00Z") -> str:
    return send(db, "ATTENDANCE_RECORDED", event_id, ts, credential={"type": credential_type, "token": token})


def test_telemetry_parse_skips_null_and_rejects_bad_values() -> None:
    device, session_id, values = parse_telemetry(ROOM, telemetry())
    assert (device, session_id) == ("esp32-a101", SESSION)
    assert values == {"temp_c": 23.4, "presence": 1.0, "comfort": 82.0}

    for bad in (telemetry(temp_c=True), telemetry(temp_c=math.nan), telemetry(temp_c="23"),
                telemetry(presence=1), telemetry(room="b202"), telemetry(v=True), telemetry(device="")):
        with pytest.raises(ValueError):
            parse_telemetry(ROOM, bad)
    with pytest.raises(ValueError):
        parse_event(ROOM, {"v": 1, "event": "OTRO", "event_id": "x", "device": "d", "room": ROOM, "session_id": "s"})


def test_long_format_accumulator_and_weighted_upsert(db: sqlite3.Connection) -> None:
    accumulator = SensorMinuteAccumulator()
    minute = datetime(2026, 10, 14, 14, 5, 10, tzinfo=timezone.utc)
    accumulator.add(ROOM, "esp32-a101", {"temp_c": 22.0, "lux": 400.0}, minute)
    accumulator.add(ROOM, "esp32-a101", {"temp_c": 24.0}, minute.replace(second=40))
    accumulator.finish_expired(minute.replace(second=59))
    assert accumulator.take_pending() == []  # el minuto aún no termina
    accumulator.finish_current()
    save_sensor_minutes(db, accumulator.take_pending())
    # El proceso se reinició dentro del mismo minuto: se combina ponderando por muestras.
    accumulator.add(ROOM, "esp32-a101", {"temp_c": 26.0}, minute.replace(second=50))
    accumulator.finish_current()
    save_sensor_minutes(db, accumulator.take_pending())

    rows = db.execute(
        "SELECT metric, minute_utc, samples, min, max, avg FROM sensor_minutes ORDER BY metric"
    ).fetchall()
    assert rows == [
        ("lux", "2026-10-14 14:05", 1, 400.0, 400.0, 400.0),
        ("temp_c", "2026-10-14 14:05", 3, 22.0, 26.0, 24.0),
    ]


def test_attendance_resolution_cases(db: sqlite3.Connection) -> None:
    enroll_credential(db, "2020001", "Ana", "nfc_card_uid", CARD_A.lower())  # se normaliza a mayúsculas
    enroll_credential(db, "2020001", "Ana", "android_hce", HCE_A)
    enroll_credential(db, "2020002", "Beto", "android_hce", HCE_B)
    revoked = enroll_credential(db, "2020003", "Caro", "nfc_card_uid", CARD_REVOKED)
    assert revoke_credential(db, revoked["credential_id"])

    assert attend(db, "e0", "nfc_card_uid", CARD_A) == "asistencia unknown_session"
    assert send(db, "SESSION_STARTED", "e1", "2026-10-14T14:00:00Z", course="CS5055") == "sesión iniciada"
    assert send(db, "SESSION_STARTED", "e1", "2026-10-14T14:00:00Z") == "duplicado, ignorado"
    assert attend(db, "e2", "nfc_card_uid", CARD_A) == "asistencia registrada"
    assert attend(db, "e3", "android_hce", HCE_A) == "asistencia duplicada (mismo estudiante)"
    assert attend(db, "e4", "android_hce", HCE_B) == "asistencia registrada"
    assert attend(db, "e5", "nfc_card_uid", "CAFEBABE") == "asistencia unknown_credential"
    assert attend(db, "e6", "nfc_card_uid", CARD_REVOKED) == "asistencia revoked_credential"
    assert attend(db, "e7", "nfc_card_uid", "XYZ") == "asistencia invalid_payload"
    assert attend(db, "e4", "nfc_card_uid", "CAFEBABE") == "duplicado, ignorado"  # reenvío QoS 1
    send(db, "SESSION_ENDED", "e8", "2026-10-14T15:30:00Z")
    assert attend(db, "e9", "android_hce", HCE_B, ts="2026-10-14T15:31:00Z") == "asistencia closed_session"

    attendance = db.execute(
        "SELECT st.code FROM attendance a JOIN students st ON st.id = a.student_id ORDER BY st.code"
    ).fetchall()
    assert attendance == [("2020001",), ("2020002",)]
    reasons = [row[0] for row in db.execute("SELECT reason FROM attendance_rejections ORDER BY id")]
    assert reasons == ["unknown_session", "unknown_credential", "revoked_credential", "invalid_payload", "closed_session"]
    assert db.execute("SELECT COUNT(*) FROM events").fetchone()[0] == 10
    assert "DEADBEEF" not in json.dumps(db.execute("SELECT * FROM attendance").fetchall())


def test_session_summary_materialization(db: sqlite3.Connection) -> None:
    db.execute(
        "INSERT INTO comfort_params VALUES (?, 2, '2026-10-14T13:59:00Z', 'test', ?)",
        (ROOM, json.dumps({"noise_rel_max": 0.4, "regular_min": 70})),
    )
    rows = [
        ("temp_c", "2026-10-14 14:00", 10, 22.0, 23.0, 22.5),
        ("temp_c", "2026-10-14 14:01", 30, 24.0, 25.0, 24.5),
        ("temp_c", "2026-10-14 15:00", 10, 40.0, 40.0, 40.0),  # fuera de la sesión
        ("noise_rel", "2026-10-14 14:00", 10, 0.2, 0.5, 0.45),
        ("noise_rel", "2026-10-14 14:01", 10, 0.1, 0.3, 0.2),
        ("comfort", "2026-10-14 14:00", 10, 60, 70, 65),
        ("comfort", "2026-10-14 14:01", 10, 80, 90, 85),
        ("presence", "2026-10-14 14:00", 10, 0, 1, 0.5),
    ]
    db.executemany(
        "INSERT INTO sensor_minutes VALUES (?, 'esp32-a101', ?, ?, ?, ?, ?, ?)",
        [(ROOM, *row) for row in rows],
    )
    send(db, "SESSION_STARTED", "s1", "2026-10-14T14:00:00Z", course="CS5055")
    db.execute("UPDATE sessions SET params_version = 2")
    enroll_credential(db, "2020001", "Ana", "nfc_card_uid", CARD_A)
    attend(db, "s2", "nfc_card_uid", CARD_A)
    send(db, "SESSION_ENDED", "s3", "2026-10-14T14:02:30Z")

    db.row_factory = sqlite3.Row
    summary = dict(db.execute("SELECT * FROM session_summaries").fetchone())
    assert summary["minutes"] == 2
    assert summary["temp_avg"] == pytest.approx(24.0)
    assert (summary["temp_min"], summary["temp_max"]) == (22.0, 25.0)
    assert summary["noise_high_minutes"] == 1
    assert summary["alert_minutes"] == 1
    assert summary["comfort_min"] == 60
    assert summary["presence_ratio"] == 0.5
    assert summary["rh_avg"] is None
    assert summary["attendance_count"] == 1
    assert (summary["course"], summary["params_version"]) == ("CS5055", 2)
