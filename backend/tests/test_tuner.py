import json
import math
import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests

import tuner


SCHEMA = Path(__file__).resolve().parents[1] / "schema.sql"
CASES = Path(__file__).resolve().parents[2] / "firmware" / "classai_node" / "test" / "comfort_cases.txt"
START = datetime(2026, 10, 14, 14, 0, tzinfo=timezone.utc)  # 09:00 en Lima


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


@pytest.fixture(autouse=True)
def open_meteo(monkeypatch):
    """Open-Meteo simulado: 7 días previos a 20 °C (T_comf 24.0) y hoy a 35 °C (debe ignorarse)."""
    calls = []

    def fake_get(url, params, timeout):
        calls.append(params)
        days = [(date(2026, 10, 14) - timedelta(days=offset)).isoformat() for offset in range(7, -1, -1)]
        return FakeResponse({"daily": {"time": days, "temperature_2m_mean": [20.0] * 7 + [35.0]}})

    tuner._TRM_CACHE.clear()
    monkeypatch.setattr(tuner.requests, "get", fake_get)
    return calls


@pytest.fixture
def db(tmp_path):
    path = tmp_path / "classai.db"
    connection = sqlite3.connect(path)
    connection.executescript(SCHEMA.read_text())
    connection.execute("INSERT INTO rooms (id, name, latitude, longitude) VALUES ('a101', 'A101', -12.05, -77.04)")
    connection.commit()
    yield connection
    connection.close()


def add_session(connection, session_id, course, start, minutes, noise):
    end = start + timedelta(minutes=minutes)
    connection.execute(
        "INSERT INTO sessions (id, room, device, course, started_at, ended_at) VALUES (?, 'a101', 'esp32-a101', ?, ?, ?)",
        (session_id, course, tuner._iso(start), tuner._iso(end)),
    )
    connection.executemany(
        "INSERT INTO sensor_minutes VALUES ('a101', 'esp32-a101', 'noise_rel', ?, 12, ?, ?, ?)",
        [((start + timedelta(minutes=i)).strftime("%Y-%m-%d %H:%M"), value, value, value)
         for i, value in enumerate(noise(i) for i in range(minutes))],
    )
    connection.commit()


def read_cases():
    for line in CASES.read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            fields = line.split()
            yield int(fields[0]), [float(v) for v in fields[1:5]], int(fields[5]), fields[6]


@pytest.mark.parametrize("case_set,values,expected,state", list(read_cases()))
def test_comfort_index_matches_firmware_cases(case_set, values, expected, state):
    cfg = tuner.factory_config("a101")
    if case_set == 1:
        cfg.update(temp_c=[21.6, 26.6], noise_rel_max=0.42)
    values = [None if math.isnan(v) else v for v in values]
    comfort = tuner.comfort_index(cfg, *values)
    assert comfort == expected
    assert tuner.comfort_state(cfg, comfort) == state


def test_ashrae_adaptive_range_and_clamps():
    assert tuner.adaptive_temp_range(20.0) == ([21.5, 26.5], pytest.approx(24.0))
    assert tuner.adaptive_temp_range(0.0) == tuner.adaptive_temp_range(10.0)
    assert tuner.adaptive_temp_range(10.0)[0] == [18.4, 23.4]
    assert tuner.adaptive_temp_range(45.0) == tuner.adaptive_temp_range(33.5)
    assert tuner.adaptive_temp_range(None) == ([21, 24], None)


def test_running_mean_weights_recent_days_more():
    assert tuner.running_mean([20.0] * 7) == pytest.approx(20.0)
    assert tuner.running_mean([30.0, 20.0]) == pytest.approx((30 + 0.8 * 20) / 1.8)
    assert tuner.running_mean([]) is None


def test_outdoor_mean_ignores_today_caches_and_survives_failures(open_meteo, monkeypatch):
    assert tuner.outdoor_running_mean(-12.05, -77.04, date(2026, 10, 14)) == pytest.approx(20.0)
    tuner.outdoor_running_mean(-12.05, -77.04, date(2026, 10, 14))
    assert len(open_meteo) == 1

    def broken(*args, **kwargs):
        raise requests.ConnectionError("sin red")

    monkeypatch.setattr(tuner.requests, "get", broken)
    assert tuner.outdoor_running_mean(-13.5, -72.0, date(2026, 10, 14)) is None


def test_noise_baseline_requires_minimum_data():
    one_session = [("s1", 0.3)] * 40
    assert tuner.noise_baseline(one_session) is None
    assert tuner.noise_baseline([("s1", 0.3)] * 15 + [("s2", 0.3)] * 14) is None
    values = [("s1", i / 100) for i in range(20)] + [("s2", i / 100) for i in range(20, 40)]
    assert tuner.noise_baseline(values) == pytest.approx(0.351)
    assert tuner.noise_baseline([("s1", 0.95)] * 20 + [("s2", 0.95)] * 20) == 0.8
    assert tuner.noise_baseline([("s1", 0.01)] * 20 + [("s2", 0.01)] * 20) == 0.2


def test_build_config_contract_shape_and_rules(db):
    add_session(db, "a101-1", "CS5055", START - timedelta(days=7), 45, lambda i: 0.4 + (i % 10) / 50)
    add_session(db, "a101-2", "CS5055", START - timedelta(days=2), 45, lambda i: 0.4 + (i % 10) / 50)
    add_session(db, "a101-3", "OTHER", START - timedelta(days=1), 45, lambda i: 0.1)

    cfg = tuner.build_config(db, "a101", "CS5055", START, START)

    assert set(cfg) == {"v", "params_version", "room", "temp_c", "rh_pct", "lux", "noise_rel_max",
                        "weights", "ok_min", "regular_min", "source"}
    assert cfg["v"] == 1 and cfg["room"] == "a101" and cfg["params_version"] == 1
    assert cfg["temp_c"] == [21.5, 26.5] and cfg["source"]["temp"] == "ashrae55_adaptive"
    assert cfg["rh_pct"] == [40, 60]
    assert cfg["lux"] == [300, 500] and cfg["source"]["lux"] == "en12464"
    # 90 minutos entre 0.40 y 0.58; 0.58 aparece en menos del 10 % -> P90 = 0.56
    assert cfg["noise_rel_max"] == pytest.approx(0.56) and cfg["source"]["noise"] == "baseline_p90"
    assert sum(cfg["weights"].values()) == pytest.approx(1.0)
    assert cfg["source"]["shift"] == tuner.NO_SHIFT
    json.dumps(cfg, allow_nan=False)

    # Otro curso sin historial suficiente: ruido de fábrica.
    assert tuner.build_config(db, "a101", "NEW", START, START)["noise_rel_max"] == 0.5


def test_evening_lux_and_fallback_without_coordinates(db):
    evening = datetime(2026, 10, 14, 23, 30, tzinfo=timezone.utc)  # 18:30 en Lima
    cfg = tuner.build_config(db, "a101", None, evening, evening)
    assert cfg["lux"] == [500, 750] and cfg["source"]["lux"] == "en12464_evening"
    before = datetime(2026, 10, 14, 22, 59, tzinfo=timezone.utc)  # 17:59
    assert tuner.build_config(db, "a101", None, before, before)["lux"] == [300, 500]

    unknown_room = tuner.build_config(db, "b202", None, START, START)
    assert unknown_room["temp_c"] == [21, 24] and unknown_room["source"]["temp"] == "factory"


def test_feedback_shift_is_directional_and_bounded():
    models = tuner._new_models()
    cfg = tuner.factory_config("a101")
    assert tuner.feedback_shift(models, "CS5055", 10, 20.0) == {"temp": 0.0, "noise": 0.0, "lux": 0}

    for _ in range(5):
        tuner.learn_feedback(models, "hot", "CS5055", 10, 20.0, {"temp_c": 23.0}, cfg)
    shift = tuner.feedback_shift(models, "CS5055", 10, 20.0)
    assert -2.0 <= shift["temp"] < -0.5
    assert shift["noise"] == 0.0 and shift["lux"] == 0

    for _ in range(300):
        tuner.learn_feedback(models, "hot", "CS5055", 10, 20.0, {"temp_c": 23.0}, cfg)
        tuner.learn_feedback(models, "noisy", "CS5055", 10, 20.0, {"noise_rel": 0.4}, cfg)
        tuner.learn_feedback(models, "dark", "CS5055", 10, 20.0, {"lux": 350}, cfg)
    shift = tuner.feedback_shift(models, "CS5055", 10, 20.0)
    assert -2.0 <= shift["temp"] < -1.5
    assert -0.15 <= shift["noise"] < -0.1
    assert 150 < shift["lux"] <= 200

    cold = tuner._new_models()
    for _ in range(5):
        tuner.learn_feedback(cold, "cold", "CS5055", 10, 20.0, {"temp_c": 23.0}, cfg)
    assert tuner.feedback_shift(cold, "CS5055", 10, 20.0)["temp"] > 0.5


class FakeClient:
    def __init__(self):
        self.published = []

    def publish(self, topic, payload, qos, retain):
        self.published.append((topic, json.loads(payload), qos, retain))


def test_on_session_started_stores_publishes_and_increments(db, tmp_path):
    db.execute("INSERT INTO sessions (id, room, device, course, started_at) VALUES "
               "('a101-x', 'a101', 'esp32-a101', 'CS5055', '2026-10-14T14:00:00Z')")
    db.commit()
    client = FakeClient()
    tuner.on_session_started(str(tmp_path / "classai.db"), client, "a101", "a101-x", "CS5055")
    tuner.on_session_started(str(tmp_path / "classai.db"), client, "a101", "a101-x", "CS5055")

    assert [(t, c["params_version"], q, r) for t, c, q, r in client.published] == [
        ("classai/v1/a101/config", 1, 1, True), ("classai/v1/a101/config", 2, 1, True)]
    rows = db.execute("SELECT params_version, reason, payload FROM comfort_params ORDER BY params_version").fetchall()
    assert [(v, r) for v, r, _ in rows] == [(1, "session_started:a101-x"), (2, "session_started:a101-x")]
    assert json.loads(rows[1][2]) == client.published[1][1]


def test_on_session_started_never_raises(tmp_path):
    tuner.on_session_started(str(tmp_path / "missing" / "x.db"), FakeClient(), "a101", "s", None)


def test_feedback_endpoint_learns_and_republishes(db, tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "classai.db"))
    published = []
    monkeypatch.setattr(tuner.mqtt_publish, "single", lambda topic, payload, **kw: published.append((topic, kw)))
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    db.execute("INSERT INTO sessions (id, room, device, course, started_at) VALUES (?, 'a101', 'esp32-a101', 'CS5055', ?)",
               ("a101-live", tuner._iso(now - timedelta(minutes=10))))
    db.execute("INSERT INTO sensor_minutes VALUES ('a101', 'esp32-a101', 'temp_c', ?, 12, 23, 23, 23)",
               (now.strftime("%Y-%m-%d %H:%M"),))
    db.commit()

    first = tuner.post_feedback(tuner.FeedbackIn(room="a101", kind="hot"))
    for _ in range(4):
        last = tuner.post_feedback(tuner.FeedbackIn(room="a101", kind="hot", session_id="a101-live"))

    assert first["session_id"] == "a101-live" and first["published"] is True
    assert last["config"]["params_version"] == 5
    assert published[0][0] == "classai/v1/a101/config" and published[0][1]["retain"] is True
    context = json.loads(db.execute("SELECT context FROM feedback ORDER BY id LIMIT 1").fetchone()[0])
    assert context["readings"] == {"temp_c": 23} and context["params"]["params_version"] == 0
    assert last["config"]["source"]["shift"]["temp"] < -0.5
    assert last["config"]["temp_c"][0] < first["config"]["temp_c"][0]
    assert (tmp_path / "models" / "feedback_a101.pkl").exists()

    params = tuner.get_comfort_params("a101", limit=3)
    assert params["current"] == last["config"] and len(params["history"]) == 3
    assert params["history"][0]["reason"] == "feedback:hot"
    assert tuner.get_comfort_params("zz9")["current"]["params_version"] == 0


def test_feedback_rejects_session_from_other_room(db, tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "classai.db"))
    with pytest.raises(tuner.HTTPException) as error:
        tuner.post_feedback(tuner.FeedbackIn(room="a101", kind="ok", session_id="nope"))
    assert error.value.status_code == 404
    with pytest.raises(ValueError):
        tuner.FeedbackIn(room="../etc", kind="ok")
    with pytest.raises(ValueError):
        tuner.FeedbackIn(room="a101", kind="sleepy")
