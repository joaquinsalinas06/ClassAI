"""Opt-in smoke: real Mosquitto + backend process; never uses an existing broker/DB."""

import json
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import sys
import threading
import time

import paho.mqtt.client as mqtt
import pytest
from fastapi.testclient import TestClient

import api
from sim_publisher import STUDENTS, TAPS, seed_students

pytestmark = pytest.mark.skipif(
    os.getenv("CLASSAI_MQTT_SMOKE") != "1", reason="run scripts/ci/smoke.sh explicitly"
)
BACKEND = Path(__file__).resolve().parents[1]


def wait_for(check, processes, timeout=20):
    """Bounded condition polling, also fail immediately if a child exits."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for process in processes:
            assert process.poll() is None, f"child exited: {process.args} ({process.returncode})"
        if check():
            return
        threading.Event().wait(0.05)
    pytest.fail(f"condition not met within {timeout}s")


def test_mqtt_to_sqlite_and_api(tmp_path, monkeypatch):
    broker_bin = shutil.which("mosquitto")
    assert broker_bin, "Install Mosquitto (apt-get install mosquitto / brew install mosquitto)"
    # No fixed ports, no shared broker, and no credentials from the developer's .env.
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    config = tmp_path / "mosquitto.conf"
    config.write_text(f"listener {port} 127.0.0.1\nallow_anonymous true\npersistence false\n")
    db_path = tmp_path / "classai.db"
    seed_students(str(db_path))
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    monkeypatch.setenv("LOCAL_TIMEZONE", "America/Lima")
    monkeypatch.setenv("PYTHON_DOTENV_DISABLED", "1")
    monkeypatch.setenv("MQTT_HOST", "127.0.0.1")
    monkeypatch.setenv("MQTT_TLS", "0")
    monkeypatch.setenv("MQTT_PORT", str(port))
    monkeypatch.setenv("MQTT_USERNAME", "")
    monkeypatch.setenv("MQTT_PASSWORD", "")
    ready = threading.Event()
    connected = threading.Event()
    lines = []
    processes = []
    publisher = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="smoke-publisher")

    def on_connect(client, userdata, flags, reason, properties):
        if not reason.is_failure:
            connected.set()

    publisher.on_connect = on_connect

    def publish(kind, payload):
        data = payload if isinstance(payload, bytes) else json.dumps(payload)
        # Exercise firmware's actual publish QoS 0; no delivery guarantee is claimed.
        info = publisher.publish(f"classai/v1/a101/{kind}", data, qos=0)
        info.wait_for_publish(timeout=5)
        assert info.is_published()

    def rows(query):
        with sqlite3.connect(db_path) as connection:
            return connection.execute(query).fetchall()

    def read_logs(process):
        for line in process.stdout:
            lines.append(line)
            if "Suscripciones MQTT confirmadas" in line:
                ready.set()

    try:
        with (tmp_path / "broker.log").open("w+") as broker_log:
            broker = subprocess.Popen([broker_bin, "-c", str(config)], stdout=broker_log, stderr=subprocess.STDOUT)
            processes.append(broker)

            def connect():
                try:
                    publisher.connect("127.0.0.1", port, keepalive=10)
                    return True
                except ConnectionRefusedError:
                    return False

            wait_for(connect, processes)
            publisher.loop_start()
            wait_for(connected.is_set, processes)
            from nfc_lab import lab_environment
            env = {
                **lab_environment(db_path, "127.0.0.1", port),
                "MQTT_CLIENT_ID": "smoke-ingest",
                "MQTT_USERNAME": "", "MQTT_PASSWORD": "", "PYTHONUNBUFFERED": "1",
            }
            # cwd is temporary: load_dotenv cannot pick up the repository's .env.
            ingest = subprocess.Popen(
                [sys.executable, str(BACKEND / "backend.py")], cwd=tmp_path, env=env,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            )
            processes.append(ingest)
            reader = threading.Thread(target=read_logs, args=(ingest,), daemon=True)
            reader.start()
            wait_for(ready.is_set, processes)

            # Real mobile enrolment route, same token delivered by the HCE protocol later.
            with sqlite3.connect(db_path) as connection:
                connection.execute("INSERT INTO students (code, full_name, created_at) VALUES ('202999001', 'HCE Lab Test', '2026-01-01T00:00:00Z')")
            phone_token = bytes(range(16)).hex().upper()  # generated synthetic fixture, never a real phone
            with TestClient(api.app) as client:
                phone = {"student_code": "202999001", "full_name": "HCE Lab Test", "token": phone_token}
                linked = client.post("/mobile/enroll", json=phone)
                assert linked.status_code == 200
                assert client.post("/mobile/enroll", json=phone).json() == linked.json()
                assert phone_token not in linked.text

            common = {"v": 1, "device": "esp32-a101", "room": "a101",
                      "session_id": "a101-u1000", "ts": None, "uptime_ms": 1000}
            counter = 0

            def event(name, **extra):
                nonlocal counter
                counter += 1
                payload = {**common, "event": name, "event_id": f"smoke-{counter}", **extra}
                publish("events", payload)
                return payload

            publish("status", b"online")
            started = event("SESSION_STARTED", course="CS5055")
            publish("events", started)  # duplicate event_id
            reading = {**common, "temp_c": 23.4, "rh_pct": 55.0, "lux": 410.0,
                       "noise_rel": 0.3, "presence": True, "ir_object_c": None,
                       "comfort": 90, "state": "OK", "params_version": 0}
            publish("telemetry", reading)
            for credential_type, token in TAPS:
                tap = event("ATTENDANCE_RECORDED", credential={"type": credential_type, "token": token})
            publish("events", tap)  # duplicated unknown credential is rejected just once
            event("ATTENDANCE_RECORDED", credential={"type": "nfc_card_uid", "token": "XYZ"})
            publish("telemetry", b"{broken")
            publish("telemetry", {**reading, "room": "b202"})
            publish("telemetry", {**reading, "temp_c": "invalid"})
            publish("events", {**started, "event_id": "bad-version", "v": 2})
            event("ATTENDANCE_RECORDED", credential={"type": "android_hce", "token": phone_token})
            event("ATTENDANCE_RECORDED", credential={"type": "android_hce", "token": phone_token})
            event("SESSION_ENDED")  # ordered barrier; flushes minute summaries
            wait_for(lambda: rows("SELECT COUNT(*) FROM session_summaries")[0][0] == 1, processes)

            wait_for(lambda: any("sesión finalizada y resumida" in line for line in lines), processes)
            assert rows("SELECT c.type FROM attendance a JOIN credentials c ON c.id = a.credential_id ORDER BY c.type") == [
                ("android_hce",), ("android_hce",), ("nfc_card_uid",),
            ]
            assert rows("SELECT COUNT(*) FROM events") == [(9,)]
            assert rows("SELECT COUNT(*) FROM readings_raw") == [(1,)]
            assert rows("SELECT COUNT(*) FROM attendance") == [(3,)]
            assert rows("SELECT reason FROM attendance_rejections ORDER BY id") == [
                ("unknown_credential",), ("invalid_payload",),
            ]
            assert rows("SELECT samples, avg FROM sensor_minutes WHERE metric = 'temp_c'") == [(1, 23.4)]
            assert rows("SELECT COUNT(*) FROM sensor_minutes WHERE metric = 'ir_object_c'") == [(0,)]
            assert rows("SELECT attendance_count FROM session_summaries") == [(3,)]
            assert sum("Mensaje MQTT ignorado" in line for line in lines) == 4
            assert any("asistencia duplicada (mismo estudiante)" in line for line in lines)

            with TestClient(api.app) as client:
                assert client.get("/health").json()["database"] == "available"
                response = client.get("/sessions/a101-u1000/attendance")
                assert response.status_code == 200
                assert response.json()["count"] == 3
                assert all(token not in response.text for _, _, _, token in STUDENTS)
                assert phone_token not in response.text
                assert sum(row["code"] == "202999001" for row in response.json()["data"]) == 1
                summary = client.get("/sessions/a101-u1000/summary")
                assert summary.status_code == 200
                assert summary.json()["attendance_count"] == 3
            # Three-node extension: same real broker/process, isolated identities.
            snapshots = {}
            coordinated = []
            subscribed = threading.Event()
            publisher.on_subscribe = lambda *args: subscribed.set()

            def received_node(client, userdata, message):
                try:
                    body = json.loads(message.payload)
                except ValueError:
                    return
                if message.topic.endswith('/snapshot'):
                    snapshots[body['device']] = body
                if message.topic.endswith('/session'):
                    coordinated.append(body)

            publisher.on_message = received_node
            publisher.subscribe('classai/v1/a101/#', qos=1)
            wait_for(subscribed.is_set, processes)
            request = dict(v=1, room='a101', device='a101-access', role='access', request_id='three-start', action='start')
            publish('nodes/a101-access/commands', request)
            wait_for(lambda: bool(coordinated) and coordinated[-1]['session_id'], processes)
            shared_session = coordinated[-1]['session_id']
            publish('nodes/a101-access/commands', request)
            for role in ('access', 'environment', 'assistant'):
                body = dict(v=1, room='a101', device=f'a101-{role}', role=role, session_id=shared_session,
                            ts=None, uptime_ms=100, lux=None, comfort=None, state='REGULAR', params_version=0)
                if role == 'environment':
                    body.update(temp_c=24, rh_pct=50, noise_rel=.2, comfort=85, light_rel=.6)
                if role == 'assistant':
                    body['light_rel'] = .3
                publish(f'nodes/a101-{role}/telemetry', body)
            wait_for(lambda: len(snapshots) == 3, processes)
            fixture_type, fixture_token = TAPS[0]
            tap = dict(v=1, room='a101', device='a101-access', role='access', session_id=shared_session,
                       ts=None, uptime_ms=101, event='ATTENDANCE_RECORDED', event_id='three-tap',
                       credential={'type': fixture_type, 'token': fixture_token})
            publish('nodes/a101-access/events', tap)
            publish('nodes/a101-access/events', tap)
            wait_for(lambda: rows(f"SELECT COUNT(*) FROM attendance WHERE session_id='{shared_session}'") == [(1,)], processes)
            publish('nodes/a101-access/status', dict(v=1, room='a101', device='a101-access', role='access', status='offline'))
            wait_for(lambda: snapshots['a101-access']['status'] == 'offline', processes)
            assert snapshots['a101-environment']['status'] == snapshots['a101-assistant']['status'] == 'online'
            with TestClient(api.app) as client:
                nodes = client.get('/rooms/a101/nodes')
                assert nodes.status_code == 200 and len(nodes.json()) == 3
                assert client.get('/classes/current?room=a101').json()['latest_reading']['temp_c'] == 24
                assert 'credential' not in nodes.text and fixture_token not in nodes.text
            publish('nodes/a101-access/commands', {**request, 'request_id': 'three-stop', 'action': 'stop', 'session_id': shared_session})
            wait_for(lambda: coordinated[-1]['session_id'] is None, processes)
            assert rows(f"SELECT COUNT(*) FROM sessions WHERE id='{shared_session}'") == [(1,)]
            assert rows(f"SELECT attendance_count FROM session_summaries WHERE session_id='{shared_session}'") == [(1,)]

            # Check graceful shutdown flush/exit as well as live persisted state.
            ingest.terminate()
            assert ingest.wait(timeout=10) == 0
            reader.join(timeout=2)
    finally:
        publisher.disconnect()
        publisher.loop_stop()
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
        print("".join(lines))
        print((tmp_path / "broker.log").read_text())
