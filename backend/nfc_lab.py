"""Local NFC/HCE lab: isolated DB, existing broker, real API/web. Never flashes hardware."""

import argparse
import getpass
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from urllib.request import urlopen

from backend import Database
from temperature_service import iso_utc
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
LAB_DB = ROOT / "backend/data/nfc-hce-lab.db"
ROOM = "nfc-lab"
NETWORK_FILE = Path.home() / ".config/classai/network.json"


def local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("192.0.2.1", 9))  # routing lookup; no packet is sent
            return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def prepare(database, code=None, name=None):
    db = Database(str(database))
    if not db.ensure_ready():
        raise RuntimeError("No se pudo preparar la base local")
    connection = db.connection
    try:
        connection.execute(
            "INSERT INTO rooms (id, name, timezone) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING",
            (ROOM, "Banco NFC local", "America/Lima"),
        )
        if code is not None:
            if not re.fullmatch(r"\d{5,12}", code) or not name or len(name.strip()) < 3:
                raise ValueError("Código: 5–12 dígitos; nombre: al menos 3 caracteres")
            connection.execute(
                "INSERT INTO students (code, full_name, created_at) VALUES (?, ?, ?) ON CONFLICT(code) DO NOTHING",
                (code, name.strip(), iso_utc(datetime.now(timezone.utc))),
            )
        connection.commit()
    finally:
        connection.close()


def configure_firmware(address, port=1883):
    target = ROOT / "firmware/classai_node/secrets.h"
    if target.exists():
        raise ValueError("secrets.h ya existe: se conserva. Revísalo localmente; no se sobrescribe.")
    network = {}
    if NETWORK_FILE.exists():
        if NETWORK_FILE.stat().st_mode & 0o077:
            raise ValueError("El perfil privado de red debe tener permisos 600")
        network = json.loads(NETWORK_FILE.read_text())
        if not isinstance(network, dict):
            raise ValueError("Perfil de red inválido")
    ssid = network.get("wifi_ssid") or input("Wi-Fi 2,4 GHz (SSID): ").strip()
    if not ssid:
        raise ValueError("Falta SSID")
    password = network.get("wifi_password")
    if password is None:
        password = getpass.getpass("Clave Wi-Fi (no se muestra): ")
    if not isinstance(ssid, str) or not isinstance(password, str):
        raise ValueError("Perfil de red inválido")
    user = os.getenv("MQTT_USERNAME", "")
    mqtt_password = os.getenv("MQTT_PASSWORD", "")
    values = {"NFC_ONLY": 1, "WIFI_SSID": ssid, "WIFI_PASSWORD": password,
              "MQTT_HOST": address, "MQTT_PORT": port, "MQTT_USER": user,
              "MQTT_PASSWORD": mqtt_password, "ROOM_ID": ROOM}
    body = "#pragma once\n" + "\n".join(f"#define {k} {json.dumps(v, ensure_ascii=False)}" for k, v in values.items()) + "\n"
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        output.write(body)
    print("Configuración privada NFC_ONLY creada, ignorada por Git; no se cargó firmware.")


def broker_ready(host, port):
    import paho.mqtt.client as mqtt
    ready = threading.Event()
    rejected = []
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"nfc-lab-check-{os.getpid()}")
    if os.getenv("MQTT_USERNAME"):
        client.username_pw_set(os.environ["MQTT_USERNAME"], os.getenv("MQTT_PASSWORD"))

    def connected(client, userdata, flags, reason, properties):
        if reason.is_failure:
            rejected.append(True)
        ready.set()

    client.on_connect = connected
    try:
        client.connect(host, port, keepalive=10)
        client.loop_start()
        if not ready.wait(5) or rejected:
            raise RuntimeError("Broker sin CONNACK aceptado; revisar acceso/autenticación")
    finally:
        client.disconnect()
        client.loop_stop()


def available(port):
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        probe.bind(("0.0.0.0", port))


def serve(database, address, broker_host, broker_port):
    for port in (8000, 5189):
        available(port)  # fail before starting anything if occupied; do not replace services
    if not shutil.which("pnpm"):
        raise RuntimeError("Falta pnpm")
    broker_ready(broker_host, broker_port)
    prepare(database)
    env = {**os.environ, "DATABASE_PATH": str(database), "LOCAL_TIMEZONE": "America/Lima",
           "MQTT_HOST": broker_host, "MQTT_PORT": str(broker_port),
           "MQTT_TOPIC": f"classai/v1/{ROOM}/events", "MQTT_CLIENT_ID": f"nfc-lab-ingest-{os.getpid()}",
           "PYTHON_DOTENV_DISABLED": "1", "PYTHONUNBUFFERED": "1", "VITE_MOCK": "0",
           "CLASSAI_API": "http://127.0.0.1:8000"}
    commands = [
        ([sys.executable, "backend.py"], ROOT / "backend"),
        ([sys.executable, "-m", "uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "3"], ROOT / "backend"),
        (["pnpm", "dev", "--host", "127.0.0.1", "--port", "5189", "--strictPort"], ROOT / "web"),
    ]
    processes = []
    stopped = threading.Event()
    old_signals = {sig: signal.signal(sig, lambda *_: stopped.set()) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        for command, cwd in commands:
            processes.append(subprocess.Popen(command, cwd=cwd, env=env, start_new_session=True))
        deadline = time.monotonic() + 30
        ready = False
        while not stopped.wait(0.2):
            for process in processes:
                if process.poll() is not None:
                    raise RuntimeError("Un proceso del laboratorio terminó; revisar salida anterior")
            if not ready:
                try:
                    with urlopen("http://127.0.0.1:8000/health", timeout=1) as response:
                        health = json.load(response)
                    with urlopen("http://127.0.0.1:5189/api/health", timeout=1) as response:
                        web_health = json.load(response)
                    if health.get("database") == web_health.get("database") == "available":
                        print(f"\nLISTO: app http://{address}:8000 | ESP32 MQTT {address}:{broker_port}", flush=True)
                        print(f"Web REAL http://127.0.0.1:5189/aula/{ROOM} | montaje 5188 se conserva", flush=True)
                        print("Registrar estudiante con prepare; conservar token. Confirmar suscripción de ingesta antes de start.", flush=True)
                        ready = True
                except (OSError, ValueError):
                    pass
                if not ready and time.monotonic() > deadline:
                    raise RuntimeError("API/web no quedaron listas en 30 s")
    finally:
        for process in reversed(processes):
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
        for sig, handler in old_signals.items():
            signal.signal(sig, handler)
        print("Procesos propios cerrados; broker existente y base local conservados.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "serve", "configure-firmware", "doctor"))
    parser.add_argument("--code")
    parser.add_argument("--name")
    parser.add_argument("--database", type=Path, default=LAB_DB)
    parser.add_argument("--lan-ip", default=local_ip())
    parser.add_argument("--broker-host", default="127.0.0.1")
    parser.add_argument("--broker-port", type=int, default=1883)
    args = parser.parse_args()
    args.database = args.database.resolve()
    try:
        if args.command == "prepare":
            code = args.code or input("Código que aparece en ClassAI: ").strip()
            name = args.name or input("Nombre completo del perfil: ").strip()
            prepare(args.database, code, name)
            print("Estudiante preparado; se conservan credenciales y datos existentes. Vincular desde la app con su mismo token.")
        elif args.command == "configure-firmware":
            configure_firmware(args.lan_ip, args.broker_port)
        elif args.command == "doctor":
            broker_ready(args.broker_host, args.broker_port)
            print(f"Broker disponible; app http://{args.lan_ip}:8000; web real http://127.0.0.1:5189")
            print("La detección de IP no prueba acceso desde el celular/ESP32; comprobar /health desde el teléfono.")
        else:
            serve(args.database, args.lan_ip, args.broker_host, args.broker_port)
    except (OSError, RuntimeError, ValueError) as error:
        parser.exit(1, f"Laboratorio: {error}\n")


if __name__ == "__main__":
    main()
