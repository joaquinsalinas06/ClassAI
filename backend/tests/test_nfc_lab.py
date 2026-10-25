import sqlite3

import pytest

from nfc_lab import prepare, configure_firmware


def test_prepare_preserves_students_credentials_and_sessions(tmp_path):
    path = tmp_path / "lab.db"
    prepare(path, "202999001", "Lab Test")
    with sqlite3.connect(path) as connection:
        connection.execute("INSERT INTO credentials (student_id,type,token,created_at) VALUES (1,'android_hce',?,'x')", ("A" * 32,))
        connection.execute("INSERT INTO sessions (id,room,device,started_at) VALUES ('keep','nfc-lab','test','x')")
    prepare(path, "202999001", "Must not rename")
    with sqlite3.connect(path) as connection:
        assert connection.execute("SELECT full_name FROM students").fetchall() == [("Lab Test",)]
        assert connection.execute("SELECT COUNT(*) FROM credentials").fetchone() == (1,)
        assert connection.execute("SELECT id FROM sessions").fetchall() == [("keep",)]
    with pytest.raises(ValueError):
        prepare(path, "invalid", "Lab")


def test_configure_never_overwrites_private_file(tmp_path, monkeypatch):
    import nfc_lab
    target = tmp_path / "firmware/classai_node/secrets.h"
    target.parent.mkdir(parents=True)
    target.write_text("KEEP PRIVATE")
    monkeypatch.setattr(nfc_lab, "ROOT", tmp_path)
    monkeypatch.setattr(nfc_lab, "NETWORK_FILE", tmp_path / "network.json")
    with pytest.raises(ValueError, match="se conserva"):
        configure_firmware("192.0.2.2")
    assert target.read_text() == "KEEP PRIVATE"


def test_configure_creates_private_nfc_profile_without_displaying_secret(tmp_path, monkeypatch, capsys):
    import nfc_lab
    monkeypatch.setattr(nfc_lab, "ROOT", tmp_path)
    monkeypatch.setattr(nfc_lab, "NETWORK_FILE", tmp_path / "network.json")
    (tmp_path / "firmware/classai_node").mkdir(parents=True)
    monkeypatch.setattr("builtins.input", lambda _: "Lab WiFi")
    monkeypatch.setattr(nfc_lab.getpass, "getpass", lambda _: "synthetic-passphrase")
    configure_firmware("192.0.2.2", 1884)
    target = tmp_path / "firmware/classai_node/secrets.h"
    assert target.stat().st_mode & 0o777 == 0o600
    content = target.read_text()
    assert "#define NFC_ONLY 1" in content and "#define MQTT_PORT 1884" in content
    assert "synthetic-passphrase" not in capsys.readouterr().out


def test_private_network_profile_is_reused_and_not_printed(tmp_path, monkeypatch, capsys):
    import nfc_lab
    import json
    monkeypatch.setattr(nfc_lab, "ROOT", tmp_path)
    profile = tmp_path / "network.json"
    monkeypatch.setattr(nfc_lab, "NETWORK_FILE", profile)
    (tmp_path / "firmware/classai_node").mkdir(parents=True)
    profile.write_text(json.dumps({"wifi_ssid": "Synthetic lab", "wifi_password": "test-only"}))
    profile.chmod(0o644)
    with pytest.raises(ValueError, match="permisos 600"):
        configure_firmware("192.0.2.2")
    profile.chmod(0o600)
    monkeypatch.setattr("builtins.input", lambda _: pytest.fail("Should reuse profile"))
    configure_firmware("192.0.2.2")
    assert "Synthetic lab" in (tmp_path / "firmware/classai_node/secrets.h").read_text()
    assert "test-only" not in capsys.readouterr().out


@pytest.mark.parametrize('rejected', [False, True])
def test_mqtt_roundtrip_validates_subscription_and_cleans_up(monkeypatch, capsys, rejected):
    from types import SimpleNamespace
    import paho.mqtt.client as mqtt
    from nfc_lab import broker_roundtrip
    clients = []

    class Client:
        def __init__(self, *args, **kwargs):
            self.on_connect = None
            self.closed = False
            clients.append(self)

        def connect(self, *args, **kwargs):
            pass

        def loop_start(self):
            if self.on_connect:
                self.on_connect(self, None, None, SimpleNamespace(is_failure=False), None)

        def subscribe(self, topic, **kwargs):
            self.topic = topic
            self.on_subscribe(self, None, 1, [SimpleNamespace(is_failure=rejected)], None)

        def publish(self, topic, payload, **kwargs):
            assert topic.startswith('classai/diagnostics/roundtrip/')
            assert kwargs == {'qos': 1, 'retain': False}
            clients[0].on_message(clients[0], None, SimpleNamespace(topic=topic, payload=payload.encode()))
            return SimpleNamespace(wait_for_publish=lambda **kwargs: None)

        def disconnect(self):
            self.closed = True

        def loop_stop(self):
            pass

    monkeypatch.setattr(mqtt, 'Client', Client)
    monkeypatch.delenv('MQTT_USERNAME', raising=False)
    monkeypatch.delenv('MQTT_PASSWORD', raising=False)
    if rejected:
        with pytest.raises(RuntimeError, match='SUBACK rechazado'):
            broker_roundtrip('192.0.2.2', 1883)
        assert 'PASS' not in capsys.readouterr().out
    else:
        broker_roundtrip('192.0.2.2', 1883)
        assert 'PASS' in capsys.readouterr().out
    assert len(clients) == 2 and all(client.closed for client in clients)


def test_lab_events_are_not_misconfigured_as_legacy_temperature(tmp_path):
    from nfc_lab import lab_environment
    env = lab_environment(tmp_path / 'lab.db', '192.0.2.2', 1884)
    assert env['MQTT_TOPIC'] == 'MLX90614/temperature'
    assert env['MQTT_HOST'] == '192.0.2.2' and env['MQTT_PORT'] == '1884'
    assert env['DATABASE_PATH'] == str(tmp_path / 'lab.db')
    assert env['PYTHON_DOTENV_DISABLED'] == '1' and env['VITE_MOCK'] == '0'
