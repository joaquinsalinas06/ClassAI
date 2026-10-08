"""Capa semántica del asistente: herramientas permitidas -> endpoints GET fijos de la API.

El LLM nunca escribe SQL ni URLs: elige una herramienta de TOOLS y sus argumentos se validan
contra el esquema declarado antes de llamar a la API de solo lectura.
"""

import json
from datetime import datetime
from typing import Any, Optional
from urllib.parse import quote
from zoneinfo import ZoneInfo

import requests


LOCAL_TIMEZONE = "America/Lima"
WEEKDAYS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
METRICS = ["temp_c", "rh_pct", "lux", "noise_rel", "presence", "ir_object_c", "comfort"]
ROOM = {"type": "string", "description": "ID del aula, p.ej. a101."}
SESSION = {"type": "string", "description": "session_id, p.ej. a101-20261014T140000Z."}
# Campos que nunca se le pasan al modelo aunque la API los devolviera.
HIDDEN_KEYS = {"token", "uid", "credential", "credential_id"}

SYSTEM_PROMPT = """Eres el asistente de ClassAI, un monitor IoT de confort y asistencia en aulas.
Fecha y hora actual: {now} ({timezone}). Las fechas sin zona horaria se interpretan en {timezone}.
Reglas:
- Usa las herramientas antes de afirmar cifras; responde solo con datos que devuelvan. Si no hay datos, dilo.
- Solo respondes sobre aulas, sesiones de clase, asistencia, confort (temperatura, humedad, luz, ruido)
  y cómo se decidieron los parámetros de confort. Para cualquier otro tema responde brevemente
  que solo puedes ayudar con eso.
- Nunca muestres tokens, UIDs ni credenciales, ni los uses para identificar a alguien; a los
  estudiantes solo los nombras por el código y nombre que devuelva la asistencia.
- noise_rel es ruido relativo 0–1, no decibelios.
- Para explicar el confort usa explain_comfort_decision: rangos, fuente de cada rango (source)
  y el desplazamiento aprendido del feedback (source.shift). Los rangos los calcula el backend
  con reglas (ASHRAE 55, EN 12464-1, historial de la clase); tú solo explicas.
- La clasificación frio/templado/calido/caluroso es una regla de aplicación, no una medida científica.
Responde de forma clara y breve en español."""


def _tool(name: str, description: str, properties: Optional[dict] = None, required: tuple = ()) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": properties or {}, "required": list(required)},
        },
    }


TOOLS = [
    _tool("get_temperature_stats", "Min, max, promedio ponderado y clasificación del sensor legado MLX90614 en un periodo.",
          {"start": {"type": "string", "description": "Inicio ISO 8601."},
           "end": {"type": "string", "description": "Fin ISO 8601 exclusivo."}}, ("start", "end")),
    _tool("get_latest_temperature", "Último resumen por minuto del sensor legado MLX90614."),
    _tool("get_temperature_history", "Filas por minuto del sensor legado MLX90614 en un rango acotado.",
          {"start": {"type": "string", "description": "Inicio ISO 8601."},
           "end": {"type": "string", "description": "Fin ISO 8601 exclusivo."},
           "limit": {"type": "integer", "minimum": 1, "maximum": 5000}}, ("start", "end")),
    _tool("get_daily_summary", "Resumen ponderado de un día local del sensor legado MLX90614.",
          {"date": {"type": "string", "description": "Fecha local YYYY-MM-DD."}}, ("date",)),
    _tool("get_current_class", "Sesión abierta de un aula (curso, inicio, asistentes) y su última lectura.",
          {"room": ROOM}, ("room",)),
    _tool("get_session_summary", "Resumen de una sesión: minutos, promedios, confort, alertas, asistencia.",
          {"session_id": SESSION}, ("session_id",)),
    _tool("list_sessions", "Lista sesiones filtrando por aula, curso y rango de fechas de inicio.",
          {"room": ROOM, "course": {"type": "string"},
           "start": {"type": "string", "description": "Inicio ISO 8601."},
           "end": {"type": "string", "description": "Fin ISO 8601 exclusivo."}}),
    _tool("compare_sessions", "Compara los resúmenes de 1 a 10 sesiones.",
          {"session_ids": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 10}},
          ("session_ids",)),
    _tool("get_metric_series", "Serie temporal de una métrica de una sesión agrupada en buckets de minutos.",
          {"session_id": SESSION, "metric": {"type": "string", "enum": METRICS},
           "bucket_minutes": {"type": "integer", "minimum": 1, "maximum": 60}}, ("session_id", "metric")),
    _tool("get_attendance", "Asistentes de una sesión (código y nombre).", {"session_id": SESSION}, ("session_id",)),
    _tool("explain_comfort_decision",
          "Parámetros de confort vigentes de un aula (o los usados en una sesión), su fuente e historial.",
          {"room": ROOM, "session_id": SESSION}),
]

# Herramienta -> ruta GET; los demás argumentos van como query params.
ROUTES = {
    "get_temperature_stats": "/temperature/stats",
    "get_latest_temperature": "/temperature/latest",
    "get_temperature_history": "/temperature/history",
    "get_daily_summary": "/temperature/daily-summary",
    "get_current_class": "/classes/current",
    "get_session_summary": "/sessions/{session_id}/summary",
    "list_sessions": "/sessions",
    "compare_sessions": "/sessions/compare",
    "get_metric_series": "/sessions/{session_id}/series",
    "get_attendance": "/sessions/{session_id}/attendance",
}
SCHEMAS = {tool["function"]["name"]: tool["function"]["parameters"] for tool in TOOLS}


def build_system_prompt(now: Optional[datetime] = None) -> str:
    local_now = (now or datetime.now(ZoneInfo(LOCAL_TIMEZONE))).astimezone(ZoneInfo(LOCAL_TIMEZONE))
    now_text = f"{WEEKDAYS[local_now.weekday()]} {local_now:%Y-%m-%d %H:%M}"
    return SYSTEM_PROMPT.format(now=now_text, timezone=LOCAL_TIMEZONE)


def _strip_hidden(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _strip_hidden(v) for k, v in value.items() if k.lower() not in HIDDEN_KEYS}
    if isinstance(value, list):
        return [_strip_hidden(item) for item in value]
    return value


def _get(base_url: str, route: str, params: Optional[dict] = None) -> dict:
    try:
        response = requests.get(f"{base_url}{route}", params=params, timeout=15)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as error:
        return {"error": "No se pudo consultar la API de ClassAI", "detail": str(error)}
    except ValueError:
        return {"error": "La API de ClassAI devolvió una respuesta inválida"}


def _explain_comfort(base_url: str, room: Optional[str], session_id: Optional[str]) -> dict:
    session = None
    if session_id:
        session = _get(base_url, f"/sessions/{quote(session_id, safe='')}/summary")
        if not session.get("found"):
            return {"error": "La sesión no existe"}
        room = session.get("room")
    if not room:
        return {"error": "Indica room o session_id"}
    params = _get(base_url, f"/comfort/params/{quote(room, safe='')}", {"limit": 50})
    if "error" in params or session is None:
        return params
    used = session.get("params_version")
    config_used = next((item for item in params.get("history", []) if item["params_version"] == used), None)
    return {"session": session, "params_version_used": used, "config_used": config_used,
            "current": params.get("current")}


def execute_tool(base_url: str, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Ejecuta una herramienta permitida; cualquier otra cosa devuelve un error, nunca una llamada."""
    schema = SCHEMAS.get(name)
    if schema is None or not isinstance(arguments, dict):
        return {"error": "Herramienta no permitida"}
    arguments = {k: v for k, v in arguments.items() if k in schema["properties"] and v not in (None, "")}
    missing = [key for key in schema["required"] if key not in arguments]
    if missing:
        return {"error": f"Faltan argumentos: {', '.join(missing)}"}

    if name == "explain_comfort_decision":
        return _strip_hidden(_explain_comfort(base_url, arguments.get("room"), arguments.get("session_id")))
    if name == "compare_sessions":
        arguments = {"ids": [str(item) for item in arguments["session_ids"]][:10]}
    route = ROUTES[name]
    if "{session_id}" in route:
        route = route.format(session_id=quote(str(arguments.pop("session_id")), safe=""))
    return _strip_hidden(_get(base_url, route, arguments))


def answer_question(client, model: str, base_url: str, history: list[dict], question: str) -> str:
    """Bucle de tool-calling con un cliente compatible con OpenAI."""
    messages: list[dict[str, Any]] = [{"role": "system", "content": build_system_prompt()}]
    messages.extend({"role": item["role"], "content": item["content"]} for item in history)
    messages.append({"role": "user", "content": question})

    for _ in range(5):
        response = client.chat.completions.create(
            model=model, messages=messages, tools=TOOLS, tool_choice="auto", temperature=0.2,
        )
        assistant_message = response.choices[0].message
        if not assistant_message.tool_calls:
            return assistant_message.content or "No pude generar una respuesta."

        messages.append(assistant_message.model_dump(exclude_none=True))
        for tool_call in assistant_message.tool_calls:
            try:
                arguments = json.loads(tool_call.function.arguments or "{}")
            except json.JSONDecodeError:
                tool_result = {"error": "Argumentos de herramienta inválidos"}
            else:
                tool_result = execute_tool(base_url, tool_call.function.name, arguments)
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(tool_result, ensure_ascii=False),
            })
    return "No pude completar la consulta de datos tras varios intentos."
