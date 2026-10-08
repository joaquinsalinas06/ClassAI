"""Datos de demo deterministas para el dashboard: 3 aulas, 25 estudiantes y ~3 semanas de clases.

Usa el mismo camino que la ingesta real: eventos con backend.store_event (sesiones, asistencia,
rechazos y session_summaries), configs con tuner.build_config/store_config, feedback con
tuner.learn_feedback y minutos con backend.save_sensor_minutes. Sin red: la T_rm exterior de cada
día se precarga en la caché del tuner a partir de un clima sintético por ciudad.

Uso:
    python seed_demo.py --db data/demo.db [--days 21] [--end 2026-10-08] [--reset]

Datos en vivo encima del histórico (ver DEMO.md):
    python sim_publisher.py --room a101 --duration 0 --db data/demo.db
"""

import argparse
import json
import math
import random
import sqlite3
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import tuner
from backend import CREATE_TABLE_SQL, SCHEMA_PATH, SensorMinute, link_params_version, parse_event, save_sensor_minutes, store_event
from temperature_service import iso_utc


SEED = 20261008
LIMA = ZoneInfo("America/Lima")  # las tres ciudades usan la hora de Perú
SAMPLES_PER_MINUTE = 12          # telemetría cada 5 s

# id: (nombre, lat, lon, exterior medio °C, interior base °C, amplitud diurna °C, humedad base %)
ROOMS = {
    "a101": ("A101 · UTEC Barranco, Lima", -12.135, -77.022, 19.0, 22.3, 1.5, 63),
    "b204": ("B204 · Cusco", -13.53, -71.97, 13.0, 18.6, 2.5, 44),
    "c305": ("C305 · Iquitos", -3.75, -73.25, 27.0, 25.6, 1.6, 67),
}
# curso: (ruido medio, desviación, probabilidad de ráfaga por minuto)
COURSES = {
    "CS5055": (0.36, 0.07, 0.10),  # IoT: trabajo colaborativo
    "MA2001": (0.16, 0.04, 0.02),  # Cálculo: clase magistral, silenciosa
    "EF1001": (0.60, 0.10, 0.20),  # Educación Física: muy ruidosa
    "HU3002": (0.24, 0.06, 0.04),  # Humanidades, nocturno
}
# (aula, curso, días 0=lunes, hora local, minutos)
SCHEDULE = [
    ("a101", "CS5055", (0, 2), (8, 0), 110),
    ("a101", "MA2001", (1, 3), (10, 0), 90),
    ("a101", "CS5055", (4,), (14, 0), 90),
    ("a101", "HU3002", (0, 2), (19, 0), 90),
    ("b204", "MA2001", (0, 2, 4), (9, 0), 90),
    ("b204", "EF1001", (1, 3), (15, 0), 90),
    ("c305", "CS5055", (1, 3), (14, 0), 90),
    ("c305", "EF1001", (4,), (10, 0), 90),
    ("c305", "HU3002", (1,), (19, 0), 90),
]
NAMES = [
    "Ana Torres", "Bruno Díaz", "Camila Rojas", "Diego Quispe", "Elena Vargas", "Fernando Huamán",
    "Gabriela Flores", "Héctor Mendoza", "Isabel Castillo", "Jorge Ramírez", "Karla Gutiérrez",
    "Luis Chávez", "María Fernández", "Nicolás Paredes", "Olga Salazar", "Pablo Mamani",
    "Rosa Espinoza", "Sergio Cárdenas", "Valeria Ríos", "Andrés Medina", "Lucía Herrera",
    "Mateo Aguilar", "Sofía Poma", "Tomás Villanueva", "Ximena Ccori",
]


def hex_token(rng: random.Random, size: int, prefix: str = "") -> str:
    return prefix + "".join(rng.choice("0123456789ABCDEF") for _ in range(size * 2 - len(prefix)))


def clip(value: float, low: float, high: float) -> float:
    return min(max(value, low), high)


def minute_row(room: str, metric: str, at: datetime, avg: float, spread: float, low: float, high: float) -> SensorMinute:
    return SensorMinute(room=room, device=f"esp32-{room}", metric=metric, minute_utc=at.strftime("%Y-%m-%d %H:%M"),
                        samples=SAMPLES_PER_MINUTE, min=round(clip(avg - spread, low, high), 3),
                        max=round(clip(avg + spread, low, high), 3), avg=avg)


def seed_people(connection: sqlite3.Connection, rng: random.Random, created_at: str) -> dict:
    """Estudiantes y credenciales (tarjeta 7 bytes + HCE para ~60 %); 2 con una tarjeta vieja revocada."""
    people = {}
    for index, full_name in enumerate(NAMES):
        code = f"2023{index + 1:04d}"
        student_id = connection.execute(
            "INSERT INTO students (code, full_name, created_at) VALUES (?, ?, ?)", (code, full_name, created_at)
        ).lastrowid
        creds = [("nfc_card_uid", hex_token(rng, 7, "04"))]
        if rng.random() < 0.6:
            creds.append(("android_hce", hex_token(rng, 16)))
        revoked = hex_token(rng, 7, "04") if index in (3, 11) else None
        if revoked:
            connection.execute(
                "INSERT INTO credentials (student_id, type, token, active, created_at, revoked_at) VALUES (?, ?, ?, 0, ?, ?)",
                (student_id, "nfc_card_uid", revoked, created_at, created_at),
            )
        for credential_type, token in creds:
            connection.execute(
                "INSERT INTO credentials (student_id, type, token, created_at) VALUES (?, ?, ?, ?)",
                (student_id, credential_type, token, created_at),
            )
        people[code] = {"creds": creds, "revoked": revoked}
    return people


def outdoor_climate(rng: random.Random, first: date, last: date) -> dict:
    """Media diaria exterior sintética por aula y T_rm (EN 16798-1) precargada en la caché del tuner."""
    t_rm = {}
    for room, (_, lat, lon, outdoor_base, *_rest) in ROOMS.items():
        days = [first - timedelta(days=8) + timedelta(days=i) for i in range((last - first).days + 9)]
        means = {day: outdoor_base + 1.4 * math.sin(i / 1.5) + 0.04 * i + rng.gauss(0, 0.6) for i, day in enumerate(days)}
        for day in days[7:]:
            value = tuner.running_mean([means[day - timedelta(days=k)] for k in range(1, 8)])
            tuner._TRM_CACHE[(round(lat, 2), round(lon, 2), day.isoformat())] = value
            t_rm[(room, day)] = (value, means[day] - outdoor_base)
    return t_rm


def simulate_minutes(rng: random.Random, room: str, course: str, start: datetime, minutes: int,
                     anomaly: float, cfg: dict) -> list[dict]:
    _, _, _, _, indoor_base, amplitude, rh_base = ROOMS[room]
    noise_mean, noise_sd, burst_p = COURSES[course]
    evening = start.astimezone(LIMA).hour >= 18
    # Incidentes ocasionales: ventilación caída (calor acumulado) o la mitad de las luces apagadas.
    incident = rng.choices(("none", "heat", "dim"), weights=(80, 13, 7))[0]
    lux_level = (340 if evening else 430) * rng.uniform(0.88, 1.08) * (0.6 if incident == "dim" else 1)
    drift, rh_drift, burst = 0.0, 0.0, 0
    rows = []
    for m in range(minutes):
        at = start + timedelta(minutes=m)
        local = at.astimezone(LIMA)
        hour = local.hour + local.minute / 60
        occupancy = 1 - math.exp(-m / 30)  # calor y humedad de la gente
        drift = clip(drift + rng.gauss(0, 0.05), -0.8, 0.8)
        rh_drift = clip(rh_drift + rng.gauss(0, 0.3), -4, 4)
        temp = indoor_base + amplitude * math.sin(2 * math.pi * (hour - 9) / 24) + 0.4 * anomaly + 1.3 * occupancy + drift
        if incident == "heat":
            temp += 3.5 * m / minutes
        rh = clip(rh_base + 3 * occupancy + rh_drift + rng.gauss(0, 0.4), 20, 95)
        lux = max(0.0, lux_level + rng.gauss(0, 12))
        if burst == 0 and rng.random() < burst_p:
            burst = rng.randint(1, 4)
        noise = noise_mean + (0.1 if m < 5 else 0) + (0.22 if burst else 0) + rng.gauss(0, noise_sd)
        burst = max(0, burst - 1)
        noise = clip(noise, 0.02, 1.0)
        presence = clip(0.55 + m / 10 if m < 5 else rng.uniform(0.85, 1.0), 0, 1)
        comfort = tuner.comfort_index(cfg, temp, rh, lux, noise)
        rows.append({"at": at, "temp_c": temp, "rh_pct": rh, "lux": lux, "noise_rel": noise,
                     "presence": presence, "ir_object_c": temp + 3.5 + rng.gauss(0, 0.3), "comfort": comfort})
    return rows


def to_sensor_minutes(room: str, rows: list[dict]) -> list[SensorMinute]:
    result = []
    for r in rows:
        result += [
            minute_row(room, "temp_c", r["at"], round(r["temp_c"], 2), 0.1, -40, 80),
            minute_row(room, "rh_pct", r["at"], round(r["rh_pct"], 1), 0.6, 0, 100),
            minute_row(room, "lux", r["at"], round(r["lux"], 1), 15, 0, 100000),
            minute_row(room, "noise_rel", r["at"], round(r["noise_rel"], 3), 0.08, 0, 1),
            minute_row(room, "presence", r["at"], round(r["presence"], 3), 1, 0, 1),
            minute_row(room, "ir_object_c", r["at"], round(r["ir_object_c"], 2), 0.2, -40, 120),
            minute_row(room, "comfort", r["at"], float(r["comfort"]), 3, 0, 100),
        ]
    return result


def pick_feedback(rng: random.Random, room: str, course: str, rows: list[dict], cfg: dict):
    """Qué tocaría el docente a los ~45 min, según lo que se midió."""
    window = rows[30:50] or rows
    temp = sum(r["temp_c"] for r in window) / len(window)
    noise = sum(r["noise_rel"] for r in window) / len(window)
    lux = sum(r["lux"] for r in window) / len(window)
    if temp > cfg["temp_c"][1] - 0.4 and rng.random() < 0.6:
        return "fan_override_on" if room == "c305" and rng.random() < 0.5 else "hot"
    if temp < cfg["temp_c"][0] + 0.3 and rng.random() < 0.5:
        return "cold"
    if noise > cfg["noise_rel_max"] and rng.random() < 0.35:
        return "noisy"
    if lux < cfg["lux"][0] and rng.random() < 0.4:
        return "dark"
    return "ok" if rng.random() < 0.1 else None


def seed(database_path: str, days: int, end: date) -> dict:
    rng = random.Random(SEED)
    first = end - timedelta(days=days - 1)
    now = datetime.now(timezone.utc)
    connection = sqlite3.connect(database_path, timeout=5)
    connection.execute("PRAGMA busy_timeout = 5000")
    connection.execute(CREATE_TABLE_SQL)
    connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    connection.execute("PRAGMA synchronous = OFF")  # carga de demo: velocidad sobre durabilidad
    for room, (name, lat, lon, *_rest) in ROOMS.items():
        connection.execute("INSERT INTO rooms (id, name, latitude, longitude) VALUES (?, ?, ?, ?)", (room, name, lat, lon))
    people = seed_people(connection, rng, iso_utc(datetime.combine(first - timedelta(days=7), datetime.min.time(), LIMA)))
    rosters = {(room, course): sorted(rng.sample(sorted(people), rng.randint(14, 20)))
               for room, course, *_rest in SCHEDULE}
    climate = outdoor_climate(rng, first, end)
    connection.commit()

    plan = []
    for offset in range(days):
        day = first + timedelta(days=offset)
        for room, course, weekdays, (hour, minute), minutes in SCHEDULE:
            start = datetime(day.year, day.month, day.day, hour, minute, tzinfo=LIMA).astimezone(timezone.utc)
            if day.weekday() in weekdays and start + timedelta(minutes=minutes) <= now:
                plan.append((start, room, course, minutes))
    plan.sort()

    for room in ROOMS:  # base nueva = modelos de feedback nuevos (build_config los lee de disco)
        (Path(database_path).resolve().parent / "models" / f"feedback_{room}.pkl").unlink(missing_ok=True)
    models = {room: tuner.load_models(database_path, room) for room in ROOMS}
    for start, room, course, minutes in plan:
        session_id = f"{room}-{start:%Y%m%dT%H%M%SZ}"
        device, sequence = f"esp32-{room}", iter(range(1, 10000))

        def send(event: str, at: datetime, **extra) -> str:
            data = {"v": 1, "event": event, "event_id": f"{device}-{start:%Y%m%d%H%M}-{next(sequence)}",
                    "device": device, "room": room, "session_id": session_id, "ts": iso_utc(at),
                    "uptime_ms": int((at - start).total_seconds() * 1000) + 60000, **extra}
            return store_event(connection, parse_event(room, data), json.dumps(data, separators=(",", ":")), iso_utc(at))

        # SESSION_STARTED + lo que hace notify_tuner: config nuevo, guardado y enlazado a la sesión.
        send("SESSION_STARTED", start, course=course)
        connection.commit()
        cfg = tuner.store_config(connection, tuner.build_config(connection, room, course, start, start),
                                 f"session_started:{session_id}", start)
        link_params_version(connection, room, session_id)

        t_rm, anomaly = climate[(room, start.astimezone(LIMA).date())]
        rows = simulate_minutes(rng, room, course, start, minutes, anomaly, cfg)
        save_sensor_minutes(connection, to_sensor_minutes(room, rows))

        # Asistencia: 80–95 %, algunos tarde, duplicados, tarjetas revocadas y desconocidas.
        taps = []
        rate = rng.uniform(0.8, 0.95)
        for code in rosters[(room, course)]:
            if rng.random() >= rate:
                continue
            person = people[code]
            late = rng.random() < 0.12
            at = start + timedelta(seconds=rng.uniform(900, 2100) if late else min(rng.lognormvariate(5.2, 0.6), 720))
            if person["revoked"] and rng.random() < 0.1:
                taps.append((at, "nfc_card_uid", person["revoked"]))
                at += timedelta(seconds=8)
            hce = [c for c in person["creds"] if c[0] == "android_hce"]
            credential = hce[0] if hce and rng.random() < 0.6 else person["creds"][0]
            taps.append((at, *credential))
            if rng.random() < 0.06:
                taps.append((at + timedelta(seconds=20), *rng.choice(person["creds"])))
        if rng.random() < 0.25:
            taps.append((start + timedelta(seconds=rng.uniform(30, 900)), "nfc_card_uid", hex_token(rng, 7, "04")))
        for at, credential_type, token in sorted(taps):
            send("ATTENDANCE_RECORDED", at, credential={"type": credential_type, "token": token})

        # Feedback del docente: igual que POST /feedback (guardar, aprender, nuevo config).
        kind = pick_feedback(rng, room, course, rows, cfg)
        if kind:
            at = start + timedelta(minutes=min(45, minutes - 1))
            reading = rows[min(45, minutes - 1)]
            readings = {key: reading[key] for key in ("temp_c", "rh_pct", "lux", "noise_rel", "comfort")}
            connection.execute(
                "INSERT INTO feedback (room, session_id, course, kind, created_at, context) VALUES (?, ?, ?, ?, ?, ?)",
                (room, session_id, course, kind, iso_utc(at),
                 json.dumps({"readings": readings, "params": cfg}, separators=(",", ":"))),
            )
            tuner.learn_feedback(models[room], kind, course, at.astimezone(LIMA).hour, t_rm, readings, cfg)
            tuner.save_models(database_path, room, models[room])
            connection.commit()
            tuner.store_config(connection, tuner.build_config(connection, room, course, start, at), f"feedback:{kind}", at)

        send("SESSION_ENDED", start + timedelta(minutes=minutes))
        connection.commit()

    counts = {table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
              for table in ("rooms", "students", "credentials", "sessions", "session_summaries", "sensor_minutes",
                            "attendance", "attendance_rejections", "feedback", "comfort_params")}
    connection.close()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", required=True, help="ruta de la base SQLite (la misma DATABASE_PATH de la API)")
    parser.add_argument("--days", type=int, default=21)
    parser.add_argument("--end", type=date.fromisoformat, default=datetime.now(LIMA).date(),
                        help="último día (hora de Lima), por defecto hoy; las clases futuras se omiten")
    parser.add_argument("--reset", action="store_true", help="borrar la base y los modelos de feedback antes")
    args = parser.parse_args()

    path = Path(args.db)
    path.parent.mkdir(parents=True, exist_ok=True)
    if args.reset:
        for leftover in (path, Path(f"{path}-wal"), Path(f"{path}-shm")):
            leftover.unlink(missing_ok=True)
    elif path.exists():
        with sqlite3.connect(path) as connection:
            try:
                has_data = connection.execute("SELECT EXISTS (SELECT 1 FROM sessions) OR EXISTS (SELECT 1 FROM students)").fetchone()[0]
            except sqlite3.OperationalError:
                has_data = False
        if has_data:
            sys.exit(f"{path} ya tiene datos; usa --reset para borrarla y sembrar de nuevo")

    counts = seed(str(path), args.days, args.end)
    print(" · ".join(f"{table}={count}" for table, count in counts.items()))


if __name__ == "__main__":
    main()
