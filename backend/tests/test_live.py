import asyncio
import json
import sqlite3
from datetime import datetime, timezone

from contextlib import closing

import pytest

import live
from backend import SCHEMA_PATH
from temperature_service import enroll_credential, revoke_credential


NOW = datetime(2026, 10, 14, 14, 0, tzinfo=timezone.utc)
HCE = "9F2C4A01B7E35D6688C1F0A2B4D6E8F0"
SESSION = "a101-20261014T140000Z"


@pytest.fixture
def db(tmp_path):
    path = tmp_path / "classai.db"
    connection = sqlite3.connect(path)
    connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    enroll_credential(connection, "2021", "Ana Torres", "android_hce", HCE)
    revoke_credential(connection, enroll_credential(connection, "2022", "Bruno Díaz", "nfc_card_uid", "DEADBEEF")["credential_id"])
    connection.execute("INSERT INTO rooms (id, name, latitude, longitude) VALUES ('a101', 'A101', -12.135, -77.022)")
    connection.execute("INSERT INTO sessions (id, room, device, started_at) VALUES (?, 'a101', 'esp32-a101', '2026-10-14T14:00:00Z')", (SESSION,))
    connection.execute("INSERT INTO sensor_minutes VALUES ('b204', 'esp32-b204', 'temp_c', '2026-10-14 14:00', 12, 19, 19, 19)")
    connection.commit()
    connection.close()
    return str(path)


def push(hub, db, topic, payload):
    raw = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    item = live.to_sse(topic, raw, db, NOW)
    if item is not None:
        hub.publish(*item)


def drain(queue):
    items = []
    while not queue.empty():
        items.append(queue.get_nowait())
    return items


def attendance(event_id, credential_type, token):
    return {"v": 1, "event": "ATTENDANCE_RECORDED", "event_id": event_id, "device": "esp32-a101", "room": "a101",
            "session_id": SESSION, "ts": "2026-10-14T14:01:00Z", "uptime_ms": 1,
            "credential": {"type": credential_type, "token": token}}


def test_hub_filters_by_room_strips_tokens_and_replays_cache(db):
    hub = live.Hub()
    a101, b204 = hub.subscribe("a101"), hub.subscribe("b204")
    push(hub, db, "classai/v1/a101/config", {"v": 1, "params_version": 4, "room": "a101"})
    push(hub, db, "classai/v1/a101/telemetry", {"v": 1, "room": "a101", "temp_c": 23.4, "comfort": 82})
    push(hub, db, "classai/v1/a101/events", attendance("e1", "android_hce", HCE.lower()))
    push(hub, db, "classai/v1/a101/events", attendance("e1", "android_hce", HCE))  # reenvío QoS 1
    push(hub, db, "classai/v1/a101/events", attendance("e2", "nfc_card_uid", "DEADBEEF"))
    push(hub, db, "classai/v1/a101/events", attendance("e3", "nfc_card_uid", "CAFEBABE"))
    push(hub, db, "classai/v1/b204/status", b"online")
    push(hub, db, "classai/v1/b204/status", b"rebooting")  # fuera del contrato: no se reenvía
    push(hub, db, "classai/v1/a101/telemetry", b"{no es json")

    assert drain(b204) == [("status", {"room": "b204", "status": "online"})]
    received = drain(a101)
    assert [name for name, _ in received] == ["config", "telemetry", "event", "event", "event"]
    assert received[1][1]["received_at"] == "2026-10-14T14:00:00Z"
    assert "\"credential\"" not in json.dumps(received) and HCE not in json.dumps(received)
    events = [data for name, data in received if name == "event"]
    assert events[0]["student"] == {"code": "2021", "full_name": "Ana Torres"}
    assert events[1]["rejected"] == {"reason": "revoked_credential"}
    assert events[2]["rejected"] == {"reason": "unknown_credential"}

    late = hub.subscribe("a101")
    assert [name for name, _ in drain(late)] == ["config", "telemetry"]
    hub.unsubscribe("a101", a101)
    hub.unsubscribe("a101", late)
    assert "a101" not in hub.queues


def test_slow_client_drops_oldest():
    hub = live.Hub()
    queue = hub.subscribe("a101")
    for index in range(live.QUEUE_SIZE + 5):
        hub.publish("a101", "telemetry", {"i": index})
    assert queue.qsize() == live.QUEUE_SIZE
    assert queue.get_nowait()[1] == {"i": 5}


def test_sse_stream_replays_and_unsubscribes(monkeypatch):
    hub = live.Hub()
    monkeypatch.setattr(live, "hub", hub)
    hub.publish("a101", "config", {"v": 1, "params_version": 4})

    async def first_chunk():
        response = await live.live("a101")
        chunk = await anext(response.body_iterator)
        await response.body_iterator.aclose()  # el cliente se desconecta
        return response.media_type, chunk

    assert asyncio.run(first_chunk()) == ("text/event-stream", 'event: config\ndata: {"v":1,"params_version":4}\n\n')
    assert hub.queues == {}


def test_rooms_merges_table_sessions_and_live_cache(db, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", db)
    monkeypatch.setenv("LOCAL_TIMEZONE", "America/Lima")
    monkeypatch.setattr(live, "hub", live.Hub())
    live.hub.publish("a101", "status", {"room": "a101", "status": "online"})
    live.hub.publish("a101", "telemetry", {"room": "a101", "temp_c": 23.4})
    assert live.rooms() == [
        {"id": "a101", "name": "A101", "latitude": -12.135, "longitude": -77.022, "current_session_id": SESSION,
         "status": "online", "last_telemetry": {"room": "a101", "temp_c": 23.4}},
        {"id": "b204", "name": None, "latitude": None, "longitude": None, "current_session_id": None,
         "status": None, "last_telemetry": None},
    ]




def raw(connection, device, at, **fields):
    connection.execute("INSERT INTO readings_raw (room, device, session_id, received_at, payload) VALUES ('a101', ?, NULL, ?, ?)",
                       (device, at, json.dumps({"device": device, **fields})))


def test_zone_minutes_per_node_light_and_presence(db, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", db)
    monkeypatch.setenv("LOCAL_TIMEZONE", "America/Lima")
    with closing(sqlite3.connect(db)) as connection:
        raw(connection, "a101-access", "2026-10-14T14:00:05Z", light_rel=.4, presence=True)
        raw(connection, "a101-access", "2026-10-14T14:00:35Z", light_rel=.6, presence=False)
        raw(connection, "a101-access", "2026-10-14T14:01:05Z", light_rel=None, presence=None)  # sensor inválido: no cuenta
        raw(connection, "a101-environment", "2026-10-14T14:00:10Z", light_rel=.8, presence=False, temp_c=23)
        raw(connection, "a101-assistant", "2026-10-14T14:00:10Z", light_rel=.1)  # fuera del promedio
        raw(connection, "a101-environment", "2026-10-14T15:30:00Z", presence=True)  # después de la sesión
        connection.commit()
        result = live.zone_minutes(connection, "a101", "2026-10-14T14:00:00Z", "2026-10-14T15:00:00Z")
    access, environment = result["zones"]
    assert (access["role"], environment["device"]) == ("access", "a101-environment")
    assert access["light"] == [{"bucket_start": "2026-10-14 14:00", "samples": 2, "min": .4, "max": .6, "avg": .5}]
    assert access["presence"] == [{"bucket_start": "2026-10-14 14:00", "samples": 2, "min": 0, "max": 1, "avg": .5}]
    assert environment["presence"][0]["avg"] == 0 and len(environment["presence"]) == 1
    # la sesión acota la ventana; una sesión inexistente es 404
    assert live.session_zones(SESSION)["zones"][1]["presence"][-1]["bucket_start"] == "2026-10-14 15:30"  # sigue abierta
    with pytest.raises(live.HTTPException) as missing:
        live.session_zones("nope")
    assert missing.value.status_code == 404
    assert [z["light"] for z in live.room_zones("a101", 30)["zones"]] == [[], []]  # ventana desde ahora
