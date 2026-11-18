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
ROOM = {"type": "string", "description": "ID interno del aula en minúsculas, p.ej. a101 o l201 (no el nombre visible)."}
SESSION = {"type": "string", "description": "session_id, p.ej. a101-20261014T140000Z."}
# Campos que nunca se le pasan al modelo aunque la API los devolviera.
HIDDEN_KEYS = {"token", "uid", "credential", "credential_id"}

SYSTEM_PROMPT = """Eres el asistente de ClassAI, un monitor IoT de confort y asistencia en aulas.
Fecha y hora actual: {now} ({timezone}). Las fechas sin zona horaria se interpretan en {timezone}.
Cada aula tiene dos nodos: el de acceso (lector NFC, LDR de luz y PIR de movimiento en la entrada) y el de
ambiente (temperatura, humedad, ruido, luz, PIR interior y el índice de confort).
Reglas:
- Para una sesión usa SIEMPRE get_session_overview: en una llamada trae resumen, luz y movimiento por zona,
  asistencia, votos y qué nodos enviaron datos. Para un aula ahora mismo usa get_room_now.
- Usa cifras exactas de las herramientas; nunca inventes ni estimes valores que no devuelvan.
- Nunca digas "no hay datos" de una métrica sin revisar todas las fuentes del overview: el resumen
  (nodo de ambiente) y las zonas (luz y movimiento de ambos nodos). El movimiento y la luz pueden venir
  solo del nodo de acceso aunque el resumen tenga presence_ratio o lux nulos.
- Si una métrica falta, explica por qué usando data_availability (p.ej. "el nodo de ambiente no envió
  lecturas en esta sesión, por eso no hay temperatura, humedad, ruido ni confort").
- Para "la clase de hoy/ayer/la última" resuelve la sesión con list_sessions (rango del día local con zona
  horaria, o sin rango para la última) y luego llama get_session_overview con su session_id.
  Si hay varias sesiones ese día, elige la de más minutos y asistentes salvo que pidan otra.
  Para comparar varias sesiones llama get_session_overview de todas en el mismo turno (llamadas en paralelo).
- Horas siempre en hora local ({timezone}); las herramientas compuestas ya las devuelven así.
- Solo respondes sobre aulas, sesiones de clase, asistencia, confort (temperatura, humedad, luz, ruido)
  y cómo se decidieron los parámetros de confort. Para cualquier otro tema responde brevemente
  que solo puedes ayudar con eso.
- Nunca muestres tokens, UIDs ni credenciales, ni los uses para identificar a alguien; a los
  estudiantes solo los nombras por el código y nombre que devuelva la asistencia.
- Cada aula tiene un id interno y un nombre visible: M602 es el id a101 y L201 es el id l201.
  Si el usuario nombra un aula ("la 201", "L201", "M602"), llama a las herramientas con el id; en la
  respuesta usa el nombre visible.
- noise_rel es ruido relativo 0–1, no decibelios.
- Para explicar el confort usa explain_comfort_decision: rangos, fuente de cada rango (source)
  y el desplazamiento aprendido del feedback (source.shift). Los rangos los calcula el backend
  con reglas (ASHRAE 55, EN 12464-1, historial de la clase); tú solo explicas.
- La clasificación frio/templado/calido/caluroso es una regla de aplicación, no una medida científica.
Formato de respuesta (en español): un título corto en negrita o con ###, una tabla markdown con las cifras
(métrica | valor | detalle) y luego 2 o 3 frases de interpretación. Usa los nombres visibles de las aulas
(M602, L201), nunca los ids internos. Luz y movimiento son porcentajes relativos (0–100 %)."""


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
    _tool("get_session_overview",
          "TODO de una sesión en una llamada: curso, aula, horario, resumen de confort/temperatura/humedad/ruido, "
          "luz y movimiento por zona (medias, máximos con hora), asistencia con hora de llegada, votos y qué nodos "
          "enviaron datos. Úsala para cualquier pregunta sobre una clase.",
          {"session_id": SESSION}, ("session_id",)),
    _tool("get_room_now",
          "Un aula ahora: lecturas actuales por nodo y su antigüedad, sesión abierta, presentes y luz/movimiento "
          "de los últimos minutos.",
          {"room": ROOM, "minutes": {"type": "integer", "minimum": 5, "maximum": 180}}, ("room",)),
    _tool("list_rooms", "Aulas conocidas: id interno, nombre visible (p.ej. L201), estado y última lectura."),
    _tool("get_current_class", "Sesión abierta de un aula (curso, inicio, asistentes) y su última lectura.",
          {"room": ROOM}, ("room",)),
    _tool("list_sessions", "Últimas 10 sesiones (de la más reciente a la más antigua) filtrando por aula, curso y rango de "
          "fechas de inicio. Solo sirve para encontrar el session_id; los datos de la clase vienen de get_session_overview.",
          {"room": ROOM, "course": {"type": "string"},
           "start": {"type": "string", "description": "Inicio ISO 8601."},
           "end": {"type": "string", "description": "Fin ISO 8601 exclusivo."}}),
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
    "list_rooms": "/rooms",
    "get_current_class": "/classes/current",
    "list_sessions": "/sessions",
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
        from auth import INTERNAL_HEADER, INTERNAL_KEY  # mismo proceso que la API

        response = requests.get(f"{base_url}{route}", params=params, timeout=15, headers={INTERNAL_HEADER: INTERNAL_KEY})
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


ZONE_NAMES = {"access": "acceso (entrada)", "environment": "ambiente (interior)"}
ENV_METRICS = "temperatura, humedad, ruido ni confort"
VOTE_LABELS = {"hot": "calor", "cold": "frío", "ok": "bien", "low": "bajo", "high": "alto", "motion": "movimiento",
               "light": "luz", "noise": "ruido", "humidity": "humedad"}
ACTIVITY_WINDOW_MIN = 5  # misma ventana móvil que la web (web/src/lib/zones.ts)


def _parse_time(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace(" ", "T").replace("Z", "+00:00"))
    except ValueError:
        return None
    return (parsed if parsed.tzinfo else parsed.replace(tzinfo=ZoneInfo("UTC"))).astimezone(ZoneInfo(LOCAL_TIMEZONE))


def _local(value: Optional[str], fmt: str = "%H:%M") -> Optional[str]:
    parsed = _parse_time(value)
    return parsed.strftime(fmt) if parsed else None


def _round(value: Any, digits: int = 1) -> Any:
    return round(value, digits) if isinstance(value, (int, float)) and not isinstance(value, bool) else value


def _per_minute(buckets: list[dict], scale: float = 1.0) -> dict[str, float]:
    return {b["bucket_start"]: b["avg"] * scale for b in buckets if isinstance(b.get("avg"), (int, float))}


def _combine(series: list[dict[str, float]]) -> dict[str, float]:
    """Por minuto, la media de las zonas que reportaron (como la web)."""
    minutes = sorted({m for s in series for m in s})
    return {m: sum(s[m] for s in series if m in s) / sum(1 for s in series if m in s) for m in minutes}


def _rolling(per_minute: dict[str, float]) -> dict[str, float]:
    """Actividad %: media móvil de los minutos con datos dentro de los últimos 5 minutos."""
    times = {m: _parse_time(m) for m in per_minute}
    out = {}
    for m, t in times.items():
        window = [per_minute[o] for o, ot in times.items() if 0 <= (t - ot).total_seconds() < ACTIVITY_WINDOW_MIN * 60]
        out[m] = sum(window) / len(window) * 100
    return out


def _stats(series: dict[str, float]) -> Optional[dict]:
    if not series:
        return None
    peak = max(series, key=series.get)
    low = min(series, key=series.get)
    return {"media_pct": _round(sum(series.values()) / len(series)), "max_pct": _round(series[peak]),
            "hora_max": _local(peak), "min_pct": _round(series[low]), "hora_min": _local(low), "minutos_con_dato": len(series)}


def _zone_stats(zones: dict) -> dict:
    """Luz y movimiento por zona y combinados, desde /zones (mismo cálculo que la web)."""
    light, motion, combined_light, combined_motion = {}, {}, [], []
    for zone in zones.get("zones", []):
        name = ZONE_NAMES.get(zone.get("role"), zone.get("role"))
        if lux := _per_minute(zone.get("light", []), 100):
            light[name] = _stats(lux)
            combined_light.append(lux)
        if presence := _per_minute(zone.get("presence", [])):
            motion[name] = {**_stats(_rolling(presence)), "minutos_con_movimiento": sum(1 for v in presence.values() if v > 0)}
            combined_motion.append(presence)
    combined = _combine(combined_motion)
    return {
        "luz_pct": {"por_zona": light, "promedio_zonas": _stats(_combine(combined_light))} if light else None,
        "movimiento_actividad_pct": {
            "nota": "actividad = % de lecturas con movimiento, media móvil de 5 min (igual que la web)",
            "por_zona": motion,
            "combinado": {**_stats(_rolling(combined)), "minutos_con_movimiento": sum(1 for v in combined.values() if v > 0)},
        } if motion else None,
    }


def _node_coverage(zones: dict, has_environment_summary: bool) -> dict:
    availability = {}
    for zone in zones.get("zones", []):
        role = zone.get("role")
        minutes = len({b["bucket_start"] for key in ("light", "presence") for b in zone.get(key, [])})
        has_data = minutes > 0 or (role == "environment" and has_environment_summary)
        text = f"con lecturas ({minutes} min)" if has_data else "SIN lecturas en este periodo"
        if role == "environment" and not has_data:
            text += f": por eso no hay {ENV_METRICS}"
        if role == "access" and not has_data:
            text += ": sin luz ni movimiento de la entrada"
        availability[f"nodo_{role}"] = text
    return availability


def _room_names(base_url: str) -> dict[str, str]:
    rooms = _get(base_url, "/rooms")
    return {r.get("id"): r.get("name") or r.get("id") for r in rooms} if isinstance(rooms, list) else {}


def _session_overview(base_url: str, session_id: str) -> dict:
    sid = quote(session_id, safe="")
    summary = _get(base_url, f"/sessions/{sid}/summary")
    if not summary.get("found"):
        return {"error": summary.get("error") or "La sesión no existe"}
    room = summary.get("room")
    zones = _get(base_url, f"/sessions/{sid}/zones")
    attendance = _get(base_url, f"/sessions/{sid}/attendance")
    votes = _get(base_url, f"/sessions/{sid}/votes")
    started = _parse_time(summary.get("started_at"))
    ended = _parse_time(summary.get("ended_at"))

    has_env = summary.get("comfort_avg") is not None or summary.get("temp_avg") is not None
    environment = None
    if has_env:
        ranges = {}
        for metric in ("comfort", "rh_pct", "noise_rel"):
            rows = _get(base_url, f"/sessions/{sid}/series", {"metric": metric, "bucket_minutes": 60}).get("data") or []
            if rows:
                ranges[metric] = (min(r["min"] for r in rows), max(r["max"] for r in rows))
        environment = {
            "confort_0_100": {"media": _round(summary.get("comfort_avg")), "min": _round(summary.get("comfort_min")),
                              "max": _round(ranges.get("comfort", (None, None))[1])},
            "minutos_en_alerta": summary.get("alert_minutes"),
            "temperatura_c": {"media": _round(summary.get("temp_avg")), "min": _round(summary.get("temp_min")),
                              "max": _round(summary.get("temp_max"))},
            "humedad_pct": {"media": _round(summary.get("rh_avg")), "min": _round(ranges.get("rh_pct", (None,))[0]),
                            "max": _round(ranges.get("rh_pct", (None, None))[1])},
            "ruido_rel_0_1": {"media": _round(summary.get("noise_avg"), 3),
                              "max": _round(ranges.get("noise_rel", (None, None))[1], 3),
                              "minutos_ruido_alto": summary.get("noise_high_minutes")},
            "movimiento_interior_ratio": _round(summary.get("presence_ratio"), 2),
        }

    students = []
    for row in attendance.get("data") or []:
        arrived = _parse_time(row.get("recorded_at"))
        students.append({"nombre": row.get("full_name"), "codigo": row.get("code"), "hora": _local(row.get("recorded_at")),
                         "min_tras_inicio": round((arrived - started).total_seconds() / 60) if arrived and started else None})

    votes_list = [{"nombre": v.get("full_name"), "voto": f"temperatura: {VOTE_LABELS.get(v.get('kind'), v.get('kind'))}", "hora": _local(v.get("created_at"))}
                  for v in votes.get("data") or []]
    votes_list += [{"nombre": v.get("full_name"), "voto": f"{VOTE_LABELS.get(v.get('dimension'), v.get('dimension'))}: {VOTE_LABELS.get(v.get('value'), v.get('value'))}", "hora": _local(v.get("created_at"))}
                   for v in votes.get("dimension_data") or []]
    nonzero = lambda counts: {VOTE_LABELS.get(k, k): v for k, v in (counts or {}).items() if v}  # noqa: E731
    dimensions = {VOTE_LABELS.get(dim, dim): nonzero(c) for dim, c in (votes.get("dimensions") or {}).items() if nonzero(c)}

    return {
        "sesion": {"session_id": session_id, "curso": summary.get("course"),
                   "aula": _room_names(base_url).get(room, room), "fecha": started.strftime("%Y-%m-%d") if started else None,
                   "inicio": _local(summary.get("started_at")), "fin": _local(summary.get("ended_at")),
                   "duracion_min": summary.get("minutes") or (round((ended - started).total_seconds() / 60) if started and ended else None),
                   "estado": summary.get("status")},
        "data_availability": _node_coverage(zones, has_env) if "zones" in zones else {"zonas": "no disponibles"},
        "ambiente": environment,
        **(_zone_stats(zones) if "zones" in zones else {}),
        "asistencia": {"cantidad": len(students), "alumnos": students,
                       "nota": "no hay regla de tardanza; min_tras_inicio indica cuándo llegó cada uno"},
        "votos": {"total": len(votes_list), "temperatura": nonzero(votes.get("counts")), "por_dimension": dimensions,
                  "detalle": votes_list[:20]},
    }


def _room_now(base_url: str, room: str, minutes: int = 30) -> dict:
    now = datetime.now(ZoneInfo(LOCAL_TIMEZONE))
    room_path = quote(room, safe="")
    nodes = _get(base_url, f"/rooms/{room_path}/nodes")
    current = _get(base_url, "/classes/current", {"room": room})
    zones = _get(base_url, f"/rooms/{room_path}/zones", {"minutes": minutes})
    keep = ("temp_c", "rh_pct", "noise_rel", "light_rel", "presence", "comfort", "state", "fan_on")
    node_info = {}
    for node in nodes if isinstance(nodes, list) else []:
        telemetry = node.get("telemetry") or {}
        seen = _parse_time(node.get("received_at"))
        reading = {k: _round(telemetry[k], 3 if k in ("noise_rel", "light_rel") else 1) for k in keep if telemetry.get(k) is not None}
        if "light_rel" in reading:
            reading["luz_pct"] = _round(reading.pop("light_rel") * 100)
        node_info[f"nodo_{node.get('role')}"] = {
            "estado": node.get("status"), "desactualizado": node.get("stale"),
            "ultima_lectura": seen.strftime("%Y-%m-%d %H:%M") if seen else None,
            "antiguedad_min": round((now - seen).total_seconds() / 60) if seen else None,
            "lectura": reading}
    session = current.get("session") if isinstance(current, dict) else None
    open_session = None
    if session:
        attendance = _get(base_url, f"/sessions/{quote(session['id'], safe='')}/attendance")
        open_session = {"session_id": session.get("id"), "curso": session.get("course"), "inicio": _local(session.get("started_at")),
                        "presentes": [{"nombre": r.get("full_name"), "hora": _local(r.get("recorded_at"))} for r in attendance.get("data") or []]}
    return {"aula": _room_names(base_url).get(room, room), "hora_consulta": now.strftime("%Y-%m-%d %H:%M"),
            "nodos": node_info, "sesion_abierta": open_session or "ninguna",
            f"ultimos_{minutes}_min": _zone_stats(zones) if "zones" in zones else zones}


def execute_tool(base_url: str, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Ejecuta una herramienta permitida; cualquier otra cosa devuelve un error, nunca una llamada."""
    schema = SCHEMAS.get(name)
    if schema is None or not isinstance(arguments, dict):
        return {"error": "Herramienta no permitida"}
    arguments = {k: v for k, v in arguments.items() if k in schema["properties"] and v not in (None, "")}
    if "minutes" in arguments and not isinstance(arguments["minutes"], int):
        return {"error": "minutes debe ser un entero"}
    if isinstance(arguments.get("room"), str):
        arguments["room"] = arguments["room"].strip().lower()
    missing = [key for key in schema["required"] if key not in arguments]
    if missing:
        return {"error": f"Faltan argumentos: {', '.join(missing)}"}

    if name == "get_session_overview":
        return _strip_hidden(_session_overview(base_url, str(arguments["session_id"])))
    if name == "get_room_now":
        return _strip_hidden(_room_now(base_url, arguments["room"], max(5, min(180, int(arguments.get("minutes") or 30)))))
    if name == "explain_comfort_decision":
        return _strip_hidden(_explain_comfort(base_url, arguments.get("room"), arguments.get("session_id")))
    names = None
    if name == "list_sessions":
        names, arguments["limit"] = _room_names(base_url), 10
    route = ROUTES[name]
    if "{session_id}" in route:
        route = route.format(session_id=quote(str(arguments.pop("session_id")), safe=""))
    result = _get(base_url, route, arguments)
    if names and isinstance(result.get("data"), list):
        # Solo lo necesario para elegir la sesión: los nulos del resumen invitaban a responder "sin datos".
        result["data"] = [{"session_id": row.get("session_id"), "aula": names.get(row.get("room"), row.get("room")),
                           "curso": row.get("course"), "inicio": _local(row.get("started_at"), "%Y-%m-%d %H:%M"),
                           "fin": _local(row.get("ended_at")), "minutos": row.get("minutes"),
                           "asistentes": row.get("attendance_count")} for row in result["data"]]
    return _strip_hidden(result)


def build_context_note(context: Optional[dict]) -> str:
    """Qué clase o aula está viendo el docente; los valores ya vienen validados por el endpoint."""
    if not context:
        return ""
    parts = []
    if context.get("session_id"):
        parts.append(f"la sesión session_id={context['session_id']}")
    if context.get("room"):
        parts.append(f"el aula con id={context['room']}")
    if not parts:
        return ""
    tools = []
    if context.get("session_id"):
        tools.append(f"get_session_overview(session_id={context['session_id']})")
    if context.get("room"):
        tools.append(f"get_room_now(room={context['room']})")
    return ("\nContexto: el docente pregunta desde la pantalla de " + " y ".join(parts)
            + ". Si no nombra otra clase o aula, \"esta clase\" o \"el aula\" se refiere a eso: llama directamente "
            + " o ".join(tools) + " sin preguntar cuál.")


def answer_question(client, model: str, base_url: str, history: list[dict], question: str,
                    tools_used: Optional[list[str]] = None, context: Optional[dict] = None) -> str:
    """Bucle de tool-calling con un cliente compatible con OpenAI; anota en tools_used las herramientas usadas."""
    messages: list[dict[str, Any]] = [{"role": "system", "content": build_system_prompt() + build_context_note(context)}]
    messages.extend({"role": item["role"], "content": item["content"]} for item in history)
    messages.append({"role": "user", "content": question})
    # Con contexto, los datos de esa clase/aula van ya en el primer turno: una ronda menos (límite de tokens de Groq).
    prefetch = ("get_session_overview", {"session_id": context["session_id"]}) if context and context.get("session_id") else (
        ("get_room_now", {"room": context["room"]}) if context and context.get("room") else None)
    if prefetch:
        name, arguments = prefetch
        messages.append({"role": "assistant", "tool_calls": [{"id": "context-0", "type": "function", "function": {
            "name": name, "arguments": json.dumps(arguments)}}]})
        messages.append({"role": "tool", "tool_call_id": "context-0",
                         "content": json.dumps(execute_tool(base_url, name, arguments), ensure_ascii=False)})
        if tools_used is not None:
            tools_used.append(name)

    for _ in range(5):
        response = client.chat.completions.create(
            model=model, messages=messages, tools=TOOLS, tool_choice="auto", temperature=0.2,
        )
        assistant_message = response.choices[0].message
        if not assistant_message.tool_calls:
            return assistant_message.content or "No pude generar una respuesta."

        messages.append(assistant_message.model_dump(exclude_none=True))
        for tool_call in assistant_message.tool_calls:
            if tools_used is not None and tool_call.function.name in SCHEMAS and tool_call.function.name not in tools_used:
                tools_used.append(tool_call.function.name)
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
