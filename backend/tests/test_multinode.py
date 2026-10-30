import json
import sqlite3
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

import backend
import live
import multinode
from temperature_service import enroll_credential

NOW = datetime(2026, 10, 29, 14, tzinfo=timezone.utc)


@pytest.fixture
def system(tmp_path):
    database = backend.Database(str(tmp_path / 'test.db'))
    assert database.ensure_ready()
    database.write(lambda c: enroll_credential(c, 'student', 'Example Student', 'nfc_card_uid', '01020304'))
    calls = []
    client = SimpleNamespace(publish=lambda topic, payload, **kwargs: calls.append((topic, json.loads(payload), kwargs)))
    acc = backend.SensorMinuteAccumulator()
    yield database, client, acc, calls
    database.close()


def send(system, role, kind, **fields):
    database, client, acc, calls = system
    body = {'v': 1, 'room': 'a101', 'device': f'a101-{role}', 'role': role, **fields}
    message = SimpleNamespace(topic=f'classai/v1/a101/nodes/a101-{role}/{kind}', payload=json.dumps(body).encode())
    assert multinode.handle(message, NOW, database, acc, client)
    return calls


def test_sessions_idempotent_expected_session_and_restart(system):
    db, client, acc, calls = system
    send(system, 'access', 'commands', request_id='start1', action='start')
    state = db.write(lambda c: multinode.session_state(c, 'a101'))
    sid = state['session_id']
    assert state['revision'] == 1 and sid
    send(system, 'access', 'commands', request_id='start1', action='start')
    assert db.write(lambda c: c.execute('SELECT COUNT(*) FROM sessions').fetchone()[0]) == 1
    send(system, 'access', 'commands', request_id='wrong', action='stop', session_id='stale')
    assert calls[-1][1]['accepted'] is False
    send(system, 'environment', 'telemetry', session_id=sid, temp_c=25, comfort=70, light_rel=.3)
    send(system, 'access', 'commands', request_id='stop1', action='stop', session_id=sid)
    assert db.write(lambda c: multinode.session_state(c, 'a101'))['session_id'] is None
    send(system, 'access', 'commands', request_id='start2', action='start')
    send(system, 'access', 'commands', request_id='stop1', action='stop', session_id=sid)
    assert db.write(lambda c: multinode.session_state(c, 'a101'))['session_id'] != sid
    db.close()
    messages = db.write(multinode.replay)
    assert any(topic.endswith('/session') and body['session_id'] and retain for topic, body, retain in messages)


def test_attendance_ack_after_commit_and_no_tokens(system):
    db, client, acc, calls = system
    send(system, 'access', 'commands', request_id='start1', action='start')
    sid = db.write(lambda c: multinode.session_state(c, 'a101'))['session_id']
    original = client.publish

    def after_commit(topic, payload, **kwargs):
        if topic.endswith('/ack'):
            with sqlite3.connect(db.database_path) as check:
                assert check.execute('SELECT COUNT(*) FROM attendance').fetchone()[0] == 1
        return original(topic, payload, **kwargs)
    client.publish = after_commit
    for _ in range(2):
        send(system, 'access', 'events', event='ATTENDANCE_RECORDED', event_id='tap1', session_id=sid,
             credential={'type': 'nfc_card_uid', 'token': '01020304'})
    assert db.write(lambda c: c.execute('SELECT COUNT(*) FROM attendance').fetchone()[0]) == 1
    assert db.write(lambda c: c.execute('SELECT COUNT(*) FROM events').fetchone()[0]) == 1
    for topic, body, _ in calls:
        assert '01020304' not in json.dumps(body)
    client.publish = original
    send(system, 'access', 'events', event='ATTENDANCE_RECORDED', event_id='bad1', session_id=sid,
         credential={'type': 'nfc_card_uid', 'token': 'DEADBEEF'})
    assert calls[-2][1]['stored'] is True and calls[-2][1]['accepted'] is False


def test_failed_database_never_acknowledges(system, monkeypatch):
    db, client, acc, calls = system
    monkeypatch.setattr(db, 'write', lambda callback: None)
    body = dict(v=1, room='a101', device='a101-access', role='access', request_id='r1', action='start')
    msg = SimpleNamespace(topic='classai/v1/a101/nodes/a101-access/commands', payload=json.dumps(body).encode())
    assert multinode.handle(msg, NOW, db, acc, client) is False
    assert calls == []


def test_snapshots_isolate_nodes_and_keep_telemetry_on_disconnect(system):
    db, client, acc, calls = system
    hub = live.Hub()
    send(system, 'environment', 'telemetry', temp_c=23, comfort=85, light_rel=.6)
    send(system, 'assistant', 'telemetry', light_rel=.2)
    send(system, 'access', 'status', status='offline')
    for topic, body, _ in calls:
        item = live.to_sse(topic, json.dumps(body).encode(), db.database_path, NOW)
        if item:
            hub.publish(*item)
    assert len([k for k in hub.cache['a101'] if k.startswith('node:')]) == 3
    send(system, 'environment', 'status', status='offline')
    snapshot = calls[-1][1]
    assert snapshot['telemetry']['temp_c'] == 23
    nodes = db.write(lambda c: multinode.nodes_from_connection(c, 'a101'))
    assert len(nodes) == 3 and all(node['stale'] for node in nodes)
    assert db.write(lambda c: c.execute("SELECT temp_c FROM (SELECT json_extract(payload,'$.temp_c') AS temp_c FROM readings_raw WHERE json_extract(payload,'$.role')='environment')").fetchone()[0]) == 23


@pytest.mark.parametrize('role,kind,fields', [
    ('assistant', 'commands', {'request_id': 'r', 'action': 'start'}),
    ('assistant', 'telemetry', {'comfort': 90}),
    ('environment', 'telemetry', {'lux': 300}),
    ('environment', 'telemetry', {'light_rel': 2}),
    ('environment', 'telemetry', {'light_rel': float('nan')}),
    ('access', 'commands', {'request_id': 'r', 'action': 'toggle'}),
])
def test_invalid_node_messages(system, role, kind, fields):
    with pytest.raises(ValueError):
        send(system, role, kind, **fields)
