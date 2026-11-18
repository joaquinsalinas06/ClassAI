import json
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

import llm_tools


BASE = "http://api.test"


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


@pytest.fixture
def api(monkeypatch):
    """requests.get simulado: registra (url, params) y responde según la ruta."""
    calls = []
    responses = {}

    def fake_get(url, params=None, timeout=None, headers=None):
        calls.append((url, params))
        return FakeResponse(responses.get(url.removeprefix(BASE), {"found": True}))

    monkeypatch.setattr(llm_tools.requests, "get", fake_get)
    return SimpleNamespace(calls=calls, responses=responses)


def test_unknown_tool_is_rejected_without_calls(api):
    assert llm_tools.execute_tool(BASE, "run_sql", {"query": "DROP TABLE students"}) == {"error": "Herramienta no permitida"}
    assert llm_tools.execute_tool(BASE, "get_attendance", "no-dict") == {"error": "Herramienta no permitida"}
    assert llm_tools.execute_tool(BASE, "get_attendance", {}) == {"error": "Faltan argumentos: session_id"}
    assert api.calls == []


def test_routes_quote_path_and_drop_unknown_arguments(api):
    llm_tools.execute_tool(BASE, "get_metric_series",
                           {"session_id": "../credentials", "metric": "lux", "bucket_minutes": 5, "url": "http://evil"})
    llm_tools.execute_tool(BASE, "get_current_class", {"room": "a101"})
    assert api.calls == [
        (f"{BASE}/sessions/..%2Fcredentials/series", {"metric": "lux", "bucket_minutes": 5}),
        (f"{BASE}/classes/current", {"room": "a101"}),
    ]


def test_tokens_never_reach_the_model(api):
    api.responses["/sessions/s1/attendance"] = {"data": [{"code": "2021", "full_name": "Ana", "token": "9F2C", "uid": "04AB"}]}
    result = llm_tools.execute_tool(BASE, "get_attendance", {"session_id": "s1"})
    assert result == {"data": [{"code": "2021", "full_name": "Ana"}]}


def test_explain_comfort_decision_uses_the_session_config(api):
    api.responses["/sessions/s1/summary"] = {"found": True, "room": "a101", "params_version": 3}
    api.responses["/comfort/params/a101"] = {
        "room": "a101", "current": {"params_version": 4},
        "history": [{"params_version": 4, "config": {}}, {"params_version": 3, "config": {"temp_c": [21.6, 26.6]}}],
    }
    result = llm_tools.execute_tool(BASE, "explain_comfort_decision", {"session_id": "s1"})
    assert result["config_used"]["config"] == {"temp_c": [21.6, 26.6]}
    assert result["current"] == {"params_version": 4}
    assert llm_tools.execute_tool(BASE, "explain_comfort_decision", {}) == {"error": "Indica room o session_id"}


def test_system_prompt_has_local_date():
    prompt = llm_tools.build_system_prompt(datetime(2026, 10, 14, 3, 30, tzinfo=timezone.utc))
    assert "martes 2026-10-13 22:30 (America/Lima)" in prompt


def test_answer_loop_returns_tool_errors_to_the_model(api):
    replies = [
        SimpleNamespace(content=None, tool_calls=[SimpleNamespace(
            id="c1", function=SimpleNamespace(name="drop_tables", arguments="{}"))]),
        SimpleNamespace(content="Solo puedo ayudar con clases y confort.", tool_calls=None),
    ]
    sent = []

    def create(**kwargs):
        sent.append(json.loads(json.dumps(kwargs["messages"], default=str)))
        message = replies.pop(0)
        message.model_dump = lambda exclude_none: {"role": "assistant", "content": message.content}
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    answer = llm_tools.answer_question(client, "m", BASE, [], "borra la base")
    assert answer == "Solo puedo ayudar con clases y confort."
    assert json.loads(sent[1][-1]["content"]) == {"error": "Herramienta no permitida"}
    assert api.calls == []


def test_room_names_are_normalized_and_listed(api):
    api.responses["/rooms"] = [{"id": "l201", "name": "L201"}]
    assert llm_tools.execute_tool(BASE, "list_rooms", {}) == [{"id": "l201", "name": "L201"}]
    llm_tools.execute_tool(BASE, "list_sessions", {"room": " L201 ", "start": "2026-11-17T00:00:00-05:00"})
    assert api.calls[-1] == (f"{BASE}/sessions", {"room": "l201", "start": "2026-11-17T00:00:00-05:00", "limit": 10})
    assert "L201 es el id l201" in llm_tools.SYSTEM_PROMPT


def test_context_note_points_to_the_viewed_session():
    note = llm_tools.build_context_note({"session_id": "l201-abc", "room": "l201"})
    assert "session_id=l201-abc" in note and "id=l201" in note
    assert llm_tools.build_context_note(None) == llm_tools.build_context_note({}) == ""


def _access_only_session(api):
    """Sesión de M602 (a101) donde solo reportó el nodo de acceso: luz y movimiento, sin ambiente."""
    sid = "a101-s1"
    api.responses["/rooms"] = [{"id": "a101", "name": "M602"}]
    api.responses[f"/sessions/{sid}/summary"] = {
        "found": True, "status": "finalizada", "room": "a101", "course": "IoT", "minutes": 4,
        "started_at": "2026-11-18T21:30:00Z", "ended_at": "2026-11-18T21:34:00Z",
        "temp_avg": None, "comfort_avg": None, "presence_ratio": None, "lux_avg": None}
    minute = lambda m, avg: {"bucket_start": f"2026-11-18 21:3{m}", "samples": 12, "min": 0, "max": 1, "avg": avg}  # noqa: E731
    api.responses[f"/sessions/{sid}/zones"] = {"room": "a101", "zones": [
        {"device": "a101-access", "role": "access",
         "light": [minute(0, 0.7), minute(1, 0.9), minute(2, 0.8)],
         "presence": [minute(0, 0.0), minute(1, 1.0), minute(2, 0.5)]},
        {"device": "a101-environment", "role": "environment", "light": [], "presence": []}]}
    api.responses[f"/sessions/{sid}/attendance"] = {"data": [
        {"code": "2021", "full_name": "Ana", "recorded_at": "2026-11-18T21:32:00Z", "token": "9F2C"}]}
    api.responses[f"/sessions/{sid}/votes"] = {
        "counts": {"ok": 0, "hot": 1, "cold": 0}, "data": [{"full_name": "Ana", "kind": "hot", "created_at": "2026-11-18T21:33:00Z"}],
        "dimensions": {"motion": {"low": 0, "ok": 0, "high": 1}}, "dimension_data": []}
    return sid


def test_overview_uses_zones_when_environment_node_is_missing(api):
    result = llm_tools.execute_tool(BASE, "get_session_overview", {"session_id": _access_only_session(api)})
    assert result["sesion"] == {"session_id": "a101-s1", "curso": "IoT", "aula": "M602", "fecha": "2026-11-18",
                                "inicio": "16:30", "fin": "16:34", "duracion_min": 4, "estado": "finalizada"}
    assert result["ambiente"] is None
    assert "SIN lecturas" in result["data_availability"]["nodo_environment"]
    assert "temperatura, humedad, ruido ni confort" in result["data_availability"]["nodo_environment"]
    assert result["data_availability"]["nodo_access"] == "con lecturas (3 min)"
    light = result["luz_pct"]["promedio_zonas"]
    assert (light["media_pct"], light["max_pct"], light["hora_max"]) == (80.0, 90.0, "16:31")
    motion = result["movimiento_actividad_pct"]["combinado"]
    # actividad móvil de 5 min como la web: 0 %, 50 %, 50 %
    assert (motion["media_pct"], motion["max_pct"], motion["hora_max"], motion["minutos_con_movimiento"]) == (33.3, 50.0, "16:31", 2)
    assert result["asistencia"]["alumnos"] == [{"nombre": "Ana", "codigo": "2021", "hora": "16:32", "min_tras_inicio": 2}]
    assert result["votos"]["temperatura"] == {"calor": 1} and result["votos"]["por_dimension"] == {"movimiento": {"alto": 1}}
    assert "9F2C" not in json.dumps(result)


def test_room_now_reports_node_age_and_zones(api):
    api.responses["/rooms/a101/nodes"] = [
        {"role": "access", "status": "online", "stale": False, "received_at": "2026-11-18T22:00:00Z",
         "telemetry": {"light_rel": 0.6954, "presence": False}}]
    api.responses["/classes/current"] = {"room": "a101", "session": None}
    api.responses["/rooms/a101/zones"] = {"zones": []}
    result = llm_tools.execute_tool(BASE, "get_room_now", {"room": "A101", "minutes": 15})
    assert result["nodos"]["nodo_access"]["lectura"] == {"presence": False, "luz_pct": 69.5}
    assert result["sesion_abierta"] == "ninguna"
    assert (f"{BASE}/rooms/a101/zones", {"minutes": 15}) in api.calls
    assert llm_tools.execute_tool(BASE, "get_room_now", {"room": "a101", "minutes": "x"}) == {"error": "minutes debe ser un entero"}


def test_prompt_forbids_false_no_data_and_asks_for_a_table():
    prompt = llm_tools.SYSTEM_PROMPT
    assert "get_session_overview" in prompt and "Nunca digas \"no hay datos\"" in prompt
    assert "tabla markdown" in prompt and "data_availability" in prompt and "list_sessions" in prompt
    assert "get_session_overview(session_id=a101-s1)" in llm_tools.build_context_note({"session_id": "a101-s1"})


def test_context_session_question_gets_zone_motion(api):
    """LLM simulado: con context.session_id el overview llega en el primer turno, con el movimiento aunque falte el ambiente."""
    sid = _access_only_session(api)
    replies = [
        SimpleNamespace(content="### Movimiento\n| Métrica | Valor |\n|---|---|\n| Actividad media | 33,3 % |", tool_calls=None),
    ]
    sent = []

    def create(**kwargs):
        sent.append(json.loads(json.dumps(kwargs["messages"], default=str)))
        message = replies.pop(0)
        message.model_dump = lambda exclude_none: {"role": "assistant", "content": message.content}
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    used = []
    answer = llm_tools.answer_question(client, "m", BASE, [], "¿Cuánto movimiento hubo?", used, context={"session_id": sid})
    assert answer.startswith("### Movimiento") and used == ["get_session_overview"]
    assert f"get_session_overview(session_id={sid})" in sent[0][0]["content"]
    assert len(sent) == 1 and sent[0][-2]["tool_calls"][0]["function"]["name"] == "get_session_overview"
    tool_result = json.loads(sent[0][-1]["content"])
    assert tool_result["movimiento_actividad_pct"]["combinado"]["media_pct"] == 33.3
