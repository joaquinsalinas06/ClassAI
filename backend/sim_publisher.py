"""Simula un nodo ESP32 ClassAI según docs/contracts.md: status, sesión, telemetría y asistencia.

Uso:
    python sim_publisher.py --seed-students            # enrola las credenciales simuladas en DATABASE_PATH
    python sim_publisher.py --host 127.0.0.1 --port 1883 --room a101 --duration 120 --interval 5
    python sim_publisher.py --room a101 --duration 0 --db data/demo.db   # sin fin (Ctrl+C), continúa el histórico de seed_demo.py
"""

import argparse
import json
import os
import random
import signal
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

import paho.mqtt.client as mqtt
from dotenv import load_dotenv

import tuner
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


def from_database(database_path: str, room: str) -> tuple[dict, list]:
    """Promedio histórico por métrica del aula y taps con credenciales activas (una por estudiante) + una desconocida."""
    uri = Path(database_path).resolve().as_uri() + "?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    base = dict(connection.execute(
        "SELECT metric, AVG(avg) FROM sensor_minutes WHERE room = ? GROUP BY metric", (room,)
    ).fetchall())
    credentials = connection.execute(
        "SELECT type, token FROM credentials WHERE active = 1 GROUP BY student_id ORDER BY random() LIMIT 15"
    ).fetchall()
    connection.close()
    return base, [tuple(row) for row in credentials] + [("nfc_card_uid", "04C0FFEE123456")]


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", default=os.getenv("MQTT_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("MQTT_PORT", "1883")))
    parser.add_argument("--room", default="a101")
    parser.add_argument("--course", default="CS5055")
    parser.add_argument("--duration", type=float, default=120, help="segundos de sesión; 0 = hasta Ctrl+C")
    parser.add_argument("--interval", type=float, default=5, help="segundos entre telemetrías")
    parser.add_argument("--seed-students", action="store_true", help="enrolar credenciales simuladas y salir")
    parser.add_argument("--db", help="base de seed_demo.py: valores base del aula y taps con sus credenciales")
    args = parser.parse_args()

    if args.seed_students:
        seed_students(os.environ["DATABASE_PATH"])
        return

    device = f"esp32-{args.room}"
    topic = f"classai/v1/{args.room}"
    boot = time.monotonic()
    cfg = tuner.factory_config(args.room)
    base, taps = from_database(args.db, args.room) if args.db else ({}, list(TAPS))
    signal.signal(signal.SIGTERM, signal.default_int_handler)  # kill también cierra la sesión

    def uptime_ms() -> int:
        return int((time.monotonic() - boot) * 1000)

    def common() -> dict:
        return {"v": 1, "device": device, "room": args.room, "session_id": session_id,
                "ts": iso_utc(datetime.now(timezone.utc)), "uptime_ms": uptime_ms()}

    def publish_event(event: str, **extra) -> dict:
        payload = {**common(), "event": event, "event_id": f"{device}-{uptime_ms()}", **extra}
        client.publish(f"{topic}/events", json.dumps(payload), qos=1).wait_for_publish(5)
        print(f"-> {event} {payload['event_id']}")
        time.sleep(0.01)  # event_id único aunque dos eventos caigan en el mismo ms
        return payload

    def on_message(client: mqtt.Client, userdata: object, message: mqtt.MQTTMessage) -> None:
        nonlocal cfg
        try:
            received = json.loads(message.payload)
            int(received["params_version"])
            tuner.comfort_index(received, 22, 50, 400, 0.3)  # valida rangos y pesos antes de usarlo
            cfg = received
            print(f"<- config params_version={cfg['params_version']}")
        except (ValueError, KeyError, TypeError) as error:
            print(f"<- config ignorado: {error!r}")

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"sim-{device}")
    if os.getenv("MQTT_USERNAME"):
        client.username_pw_set(os.getenv("MQTT_USERNAME"), os.getenv("MQTT_PASSWORD"))
    client.will_set(f"{topic}/status", "offline", qos=1, retain=True)
    client.on_message = on_message
    client.connect(args.host, args.port, keepalive=30)
    client.loop_start()
    client.subscribe(f"{topic}/config", qos=1)
    client.publish(f"{topic}/status", "online", qos=1, retain=True)

    session_id = f"{args.room}-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}"
    started = publish_event("SESSION_STARTED", course=args.course)
    client.publish(f"{topic}/events", json.dumps(started), qos=1).wait_for_publish(5)  # reenvío QoS 1: se deduplica

    base_temp = base.get("temp_c", 22.5)
    temp = base_temp
    end_at = time.monotonic() + args.duration if args.duration > 0 else float("inf")
    try:
        while time.monotonic() < end_at:
            temp += 0.05 * (base_temp - temp) + random.gauss(0.01, 0.08)  # paseo aleatorio que vuelve a la base
            noise = min(1.0, max(0.0, random.gauss(base.get("noise_rel", 0.32), 0.08)))
            rh = random.gauss(base.get("rh_pct", 55), 1.0)
            lux = max(0.0, random.gauss(base.get("lux", 410), 15))
            comfort = tuner.comfort_index(cfg, temp, rh, lux, noise)
            reading = {
                **common(),
                "temp_c": round(temp, 2),
                "rh_pct": round(rh, 1),
                "lux": round(lux, 1),
                "noise_rel": round(noise, 3),
                "presence": random.random() < 0.9,
                "ir_object_c": round(temp + 3.5 + random.gauss(0, 0.3), 2),
                "comfort": comfort if comfort >= 0 else None,
                "state": tuner.comfort_state(cfg, comfort),
                "params_version": cfg["params_version"],
            }
            client.publish(f"{topic}/telemetry", json.dumps(reading), qos=0)
            print(f"-> telemetry temp={reading['temp_c']} noise={reading['noise_rel']} comfort={comfort}")
            if taps:
                credential_type, token = taps.pop(0)
                publish_event("ATTENDANCE_RECORDED", credential={"type": credential_type, "token": token})
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("Cerrando la sesión simulada...")

    publish_event("SESSION_ENDED")
    client.publish(f"{topic}/status", "offline", qos=1, retain=True).wait_for_publish(5)
    client.disconnect()
    client.loop_stop()


if __name__ == "__main__":
    main()
