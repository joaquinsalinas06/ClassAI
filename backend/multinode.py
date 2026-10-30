"""Persisted coordination for three-node rooms; all outbound messages follow commit."""
import json
import re
from uuid import uuid4
from datetime import datetime, timezone

from temperature_service import iso_utc

NODE_TOPIC = re.compile(r"^classai/v1/([a-z0-9-]{1,32})/nodes/([a-z0-9-]{1,64})/(telemetry|status|commands|events)$")
TOPICS = tuple(f"classai/v1/+/nodes/+/{kind}" for kind in ("telemetry", "status", "commands", "events"))
ROLES = ("access", "environment", "assistant")


def configure_tls(client):
    import os
    if os.getenv("MQTT_TLS", "0") == "1":
        client.tls_set(ca_certs=os.getenv("MQTT_CA_FILE") or None)


def publish(client, topic, data, retain=False):
    return client.publish(topic, json.dumps(data, separators=(",", ":"), allow_nan=False), qos=1, retain=retain)


def session_state(connection, room):
    row = connection.execute("SELECT revision, session_id FROM room_runtime WHERE room=?", (room,)).fetchone()
    state = {"v": 1, "room": room, "revision": row[0] if row else 0, "session_id": row[1] if row else None}
    if state["session_id"]:
        session = connection.execute("SELECT course, started_at FROM sessions WHERE id=?", (state["session_id"],)).fetchone()
        if session:
            state.update(course=session[0], started_at=session[1])
    return state


def snapshot(connection, room, device):
    row = connection.execute("SELECT role,status,status_at,telemetry,received_at FROM node_state WHERE room=? AND device=?", (room, device)).fetchone()
    if row is None:
        return None
    return {"v": 1, "room": room, "device": device, "role": row[0], "status": row[1],
            "status_at": row[2], "telemetry": json.loads(row[3]) if row[3] else None, "received_at": row[4]}


def replay(connection):
    messages = []
    for room, in connection.execute("SELECT room FROM room_runtime"):
        messages.append((f"classai/v1/{room}/session", session_state(connection, room), True))
    for room, device in connection.execute("SELECT room,device FROM node_state"):
        messages.append((f"classai/v1/{room}/nodes/{device}/snapshot", snapshot(connection, room, device), True))
    return messages


def handle(message, received, database, accumulator, client):
    # Lazy import keeps the legacy ingest module and its fixtures independent.
    from backend import decode_json_object, parse_event, parse_telemetry, store_event, materialize_session_summary
    match = NODE_TOPIC.fullmatch(message.topic)
    if not match:
        raise ValueError("invalid node topic")
    room, device, kind = match.groups()
    if len(message.payload) > 8192:
        raise ValueError("node payload exceeds limit")
    data = decode_json_object(message.payload)
    json.dumps(data, allow_nan=False)
    if data.get("v") != 1 or type(data.get("v")) is not int or data.get("room") != room or data.get("device") != device:
        raise ValueError("node identity does not match topic")
    role = data.get("role")
    if role not in ROLES or device != f"{room}-{role}":
        raise ValueError("device must be {room}-{role}")
    at = iso_utc(received)
    prefix = f"classai/v1/{room}"
    values = {}
    if kind == "telemetry":
        _, _, values = parse_telemetry(room, data)
        if role != "environment" and any(data.get(key) is not None for key in ("comfort", "temp_c", "rh_pct", "noise_rel", "lux")):
            raise ValueError("environment is the sole comfort authority")
        if data.get("lux") is not None:
            raise ValueError("LDR nodes cannot report lux")
        data["received_at"] = at
    elif kind == "status" and data.get("status") not in ("online", "offline"):
        raise ValueError("invalid node status")
    elif kind in ("commands", "events") and role != "access":
        raise ValueError("only access may request sessions or attendance")
    if kind == "commands":
        if not isinstance(data.get("request_id"), str) or not 1 <= len(data["request_id"]) <= 120:
            raise ValueError("invalid request_id")
        if data.get("action") not in ("start", "stop"):
            raise ValueError("invalid action")
        if data.get("action") == "stop" and not isinstance(data.get("session_id"), str):
            raise ValueError("stop requires expected session_id")
    if kind == "events":
        event = parse_event(room, data)
        if event["event"] != "ATTENDANCE_RECORDED":
            raise ValueError("session changes require commands")

    def transaction(connection):
        outgoing = []
        if kind in ("telemetry", "status"):
            connection.execute("INSERT OR IGNORE INTO node_state(room,device,role,status) VALUES (?,?,?,'offline')", (room, device, role))
            if kind == "telemetry":
                connection.execute("UPDATE node_state SET telemetry=?,received_at=?,status='online',status_at=? WHERE room=? AND device=?",
                                   (json.dumps(data, allow_nan=False), at, at, room, device))
                connection.execute("INSERT INTO readings_raw(room,device,session_id,received_at,payload) VALUES (?,?,?,?,?)",
                                   (room, device, data.get("session_id"), at, json.dumps(data, allow_nan=False)))
            else:
                connection.execute("UPDATE node_state SET status=?,status_at=? WHERE room=? AND device=?", (data["status"], at, room, device))
            outgoing.append((f"{prefix}/nodes/{device}/snapshot", snapshot(connection, room, device), True))
        elif kind == "commands":
            previous = connection.execute("SELECT room,device,payload FROM session_requests WHERE request_id=?", (data["request_id"],)).fetchone()
            if previous:
                if previous[:2] != (room, device):
                    raise ValueError("request_id belongs to another source")
                ack = json.loads(previous[2])
            else:
                connection.execute("INSERT OR IGNORE INTO room_runtime(room,revision) VALUES (?,0)", (room,))
                state = session_state(connection, room)
                sid = state["session_id"]
                accepted = (data["action"] == "start" and sid is None) or (data["action"] == "stop" and sid == data["session_id"])
                if data["action"] == "start" and connection.execute("SELECT 1 FROM sessions WHERE room=? AND ended_at IS NULL", (room,)).fetchone():
                    accepted = False
                if accepted:
                    if data["action"] == "start":
                        sid = f"{room}-{uuid4().hex}"
                        course = data.get("course") if isinstance(data.get("course"), str) else None
                        connection.execute("INSERT INTO sessions(id,room,device,course,started_at,params_version) VALUES (?,?,?,?,?,COALESCE((SELECT MAX(params_version) FROM comfort_params WHERE room=?),0))",
                                           (sid, room, device, course, at, room))
                    else:
                        connection.execute("UPDATE sessions SET ended_at=? WHERE id=? AND room=? AND ended_at IS NULL", (at, sid, room))
                        materialize_session_summary(connection, sid)
                        sid = None
                    connection.execute("UPDATE room_runtime SET revision=revision+1,session_id=? WHERE room=?", (sid, room))
                ack = {"v": 1, "room": room, "device": device, "request_id": data["request_id"], "stored": True, "accepted": accepted}
                connection.execute("INSERT INTO session_requests VALUES (?,?,?,?)", (data["request_id"], room, device, json.dumps(ack)))
            outgoing.extend([(f"{prefix}/session", session_state(connection, room), True), (f"{prefix}/nodes/{device}/ack", ack, False)])
        else:
            existing = connection.execute("SELECT payload FROM events WHERE event_id=?", (event["event_id"],)).fetchone()
            if existing and json.loads(existing[0]) != data:
                raise ValueError("event_id reused with different payload")
            # A session from another room must never admit this credential.
            owner = connection.execute("SELECT room FROM sessions WHERE id=?", (event["session_id"],)).fetchone()
            if owner and owner[0] != room:
                raise ValueError("session belongs to another room")
            store_event(connection, event, json.dumps(data), at)
            rejection = connection.execute("SELECT reason FROM attendance_rejections WHERE event_id=?", (event["event_id"],)).fetchone()
            accepted = rejection is None
            ack = {"v": 1, "room": room, "device": device, "event_id": event["event_id"], "stored": True,
                   "accepted": accepted, "reason": rejection[0] if rejection else None}
            confirmed = {k: v for k, v in data.items() if k != "credential"}
            confirmed.update(received_at=at, accepted=accepted)
            if rejection:
                confirmed["rejected"] = {"reason": rejection[0]}
            else:
                row = connection.execute("SELECT s.code,s.full_name FROM credentials c JOIN students s ON s.id=c.student_id WHERE c.type=? AND c.token=? AND c.active=1",
                                         (data["credential"]["type"], data["credential"]["token"].upper())).fetchone()
                if row:
                    confirmed["student"] = {"code": row[0], "full_name": row[1]}
            outgoing.extend([(f"{prefix}/nodes/{device}/ack", ack, False), (f"{prefix}/confirmed", confirmed, False)])
        return outgoing

    if kind == "commands" and data["action"] == "stop":
        from backend import flush_sensor_pending
        accumulator.finish_current()
        if not flush_sensor_pending(accumulator, database):
            return False
    outgoing = database.write(transaction)
    if outgoing is None or outgoing is False:
        return False
    if kind == "telemetry":
        # Presence of the access PIR stays zone-specific, out of room averages.
        metrics = values if role == "environment" else {k: v for k, v in values.items() if k == "light_rel"}
        accumulator.add(room, device, metrics, received)
    for topic, body, retain in outgoing:
        publish(client, topic, body, retain)
    return True


def nodes_from_connection(connection, room):
    now = datetime.now(timezone.utc)
    result = []
    for device, in connection.execute("SELECT device FROM node_state WHERE room=? ORDER BY device", (room,)):
        node = snapshot(connection, room, device)
        timestamp = node["received_at"]
        node["stale"] = timestamp is None or (now - datetime.fromisoformat(timestamp.replace("Z", "+00:00"))).total_seconds() > 15
        result.append(node)
    return result
