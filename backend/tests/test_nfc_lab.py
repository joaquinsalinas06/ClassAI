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
    with pytest.raises(ValueError, match="se conserva"):
        configure_firmware("192.0.2.2")
    assert target.read_text() == "KEEP PRIVATE"


def test_configure_creates_private_nfc_profile_without_displaying_secret(tmp_path, monkeypatch, capsys):
    import nfc_lab
    monkeypatch.setattr(nfc_lab, "ROOT", tmp_path)
    (tmp_path / "firmware/classai_node").mkdir(parents=True)
    monkeypatch.setattr("builtins.input", lambda _: "Lab WiFi")
    monkeypatch.setattr(nfc_lab.getpass, "getpass", lambda _: "synthetic-passphrase")
    configure_firmware("192.0.2.2", 1884)
    target = tmp_path / "firmware/classai_node/secrets.h"
    assert target.stat().st_mode & 0o777 == 0o600
    content = target.read_text()
    assert "#define NFC_ONLY 1" in content and "#define MQTT_PORT 1884" in content
    assert "synthetic-passphrase" not in capsys.readouterr().out
