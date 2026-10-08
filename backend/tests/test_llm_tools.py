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

    def fake_get(url, params=None, timeout=None):
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
    llm_tools.execute_tool(BASE, "compare_sessions", {"session_ids": ["a", "b"]})
    llm_tools.execute_tool(BASE, "get_current_class", {"room": "a101"})
    assert api.calls == [
        (f"{BASE}/sessions/..%2Fcredentials/series", {"metric": "lux", "bucket_minutes": 5}),
        (f"{BASE}/sessions/compare", {"ids": ["a", "b"]}),
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
