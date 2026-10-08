"""Simula un nodo ESP32 ClassAI según docs/contracts.md: status, sesión, telemetría y asistencia.

Uso:
    python sim_publisher.py --seed-students            # enrola las credenciales simuladas en DATABASE_PATH
    python sim_publisher.py --host 127.0.0.1 --port 1883 --room a101 --duration 120 --interval 5
"""

import argparse
import json
import os
import random
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

import paho.mqtt.client as mqtt
from dotenv import load_dotenv

from temperature_service import enroll_credential, iso_utc


# (código, nombre, tipo, token). Ana tiene tarjeta y teléfono: su segunda lectura no duplica asistencia.
STUDENTS = [
    ("20201001", "Ana Torres", "nfc_card_uid", "04A1B2C3D4E5F6"),
    ("20201001", "Ana Torres", "android_hce", "9F2C4A01B7E35D6688C1F0A2B4D6E8F0"),
    ("20201002", "Bruno Díaz", "android_hce", "00112233445566778899AABBCCDDEEFF"),
]
TAPS = [STUDENTS[0][2:], STUDENTS[2][2:], STUDENTS[1][2:], ("nfc_card_uid", "CAFEBABE")]  # el último no está enrolado


def seed_students(database_path: str) -> None:
    Path(database_path).parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.executescript(Path(__file__).with_name("schema.sql").read_text(encoding="utf-8"))
    for code, name, credential_type, token in STUDENTS:
        try:
            enroll_credential(connection, code, name, credential_type, token)
            print(f"Enrolado {code} {name} ({credential_type})")
        except sqlite3.IntegrityError:
            print(f"Ya existía {code} ({credential_type})")
    connection.close()


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", default=os.getenv("MQTT_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("MQTT_PORT", "1883")))
    parser.add_argument("--room", default="a101")
    parser.add_argument("--course", default="CS5055")
    parser.add_argument("--duration", type=float, default=120, help="segundos de sesión")
    parser.add_argument("--interval", type=float, default=5, help="segundos entre telemetrías")
    parser.add_argument("--seed-students", action="store_true", help="enrolar credenciales simuladas y salir")
    args = parser.parse_args()

    if args.seed_students:
        seed_students(os.environ["DATABASE_PATH"])
        return

    device = f"esp32-{args.room}"
    base = f"classai/v1/{args.room}"
    boot = time.monotonic()
    params_version = 0

    def uptime_ms() -> int:
        return int((time.monotonic() - boot) * 1000)

    def common() -> dict:
        return {"v": 1, "device": device, "room": args.room, "session_id": session_id,
                "ts": iso_utc(datetime.now(timezone.utc)), "uptime_ms": uptime_ms()}

    def publish_event(event: str, **extra) -> dict:
        payload = {**common(), "event": event, "event_id": f"{device}-{uptime_ms()}", **extra}
        client.publish(f"{base}/events", json.dumps(payload), qos=1).wait_for_publish(5)
        print(f"-> {event} {payload['event_id']}")
        time.sleep(0.01)  # event_id único aunque dos eventos caigan en el mismo ms
        return payload

    def on_message(client: mqtt.Client, userdata: object, message: mqtt.MQTTMessage) -> None:
        nonlocal params_version
        try:
            params_version = int(json.loads(message.payload)["params_version"])
            print(f"<- config params_version={params_version}")
        except (ValueError, KeyError, TypeError) as error:
            print(f"<- config ignorado: {error!r}")

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"sim-{device}")
    if os.getenv("MQTT_USERNAME"):
        client.username_pw_set(os.getenv("MQTT_USERNAME"), os.getenv("MQTT_PASSWORD"))
    client.will_set(f"{base}/status", "offline", qos=1, retain=True)
    client.on_message = on_message
    client.connect(args.host, args.port, keepalive=30)
    client.loop_start()
    client.subscribe(f"{base}/config", qos=1)
    client.publish(f"{base}/status", "online", qos=1, retain=True)

    session_id = f"{args.room}-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}"
    started = publish_event("SESSION_STARTED", course=args.course)
    client.publish(f"{base}/events", json.dumps(started), qos=1).wait_for_publish(5)  # reenvío QoS 1: se deduplica

    temp, taps = 22.5, list(TAPS)
    end_at = time.monotonic() + args.duration
    while time.monotonic() < end_at:
        temp = min(28.0, max(19.0, temp + random.gauss(0.02, 0.08)))
        noise = min(1.0, max(0.0, random.gauss(0.32, 0.08)))
        comfort = int(max(0, min(100, 100 - abs(temp - 22.5) * 12 - max(0.0, noise - 0.5) * 150 + random.gauss(0, 2))))
        reading = {
            **common(),
            "temp_c": round(temp, 2),
            "rh_pct": round(random.gauss(55, 1.5), 1),
            "lux": round(random.gauss(410, 20), 1),
            "noise_rel": round(noise, 3),
            "presence": random.random() < 0.9,
            "ir_object_c": round(temp + 4 + random.gauss(0, 0.3), 2),
            "comfort": comfort,
            "state": "OK" if comfort >= 80 else "REGULAR" if comfort >= 60 else "ALERT",
            "params_version": params_version,
        }
        client.publish(f"{base}/telemetry", json.dumps(reading), qos=0)
        print(f"-> telemetry temp={reading['temp_c']} noise={reading['noise_rel']} comfort={comfort}")
        if taps:
            credential_type, token = taps.pop(0)
            publish_event("ATTENDANCE_RECORDED", credential={"type": credential_type, "token": token})
        time.sleep(args.interval)

    publish_event("SESSION_ENDED")
    client.publish(f"{base}/status", "offline", qos=1, retain=True).wait_for_publish(5)
    client.disconnect()
    client.loop_stop()


if __name__ == "__main__":
    main()
