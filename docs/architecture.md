# ClassAI — Arquitectura del confort inteligente y del asistente

Contratos MQTT en [contracts.md](contracts.md). Código: `backend/tuner.py`, `firmware/classai_node/comfort.h`,
`backend/llm_tools.py`, `backend/chatbot.py`.

## 1. Principio: el backend calcula parámetros, el borde ejecuta

| | ESP32 (borde) | Backend |
|---|---|---|
| Qué hace | Índice de confort cada lectura, estado OK/REGULAR/ALERT, relé + buzzer | Calcula rangos por aula/curso, aprende del feedback, publica config |
| Cuándo | Siempre, también sin red | Al iniciar sesión (`SESSION_STARTED`) y tras cada feedback |
| Con qué | `comfort.h`: fórmula fija y determinista, parámetros de NVS | `tuner.py`: reglas + River |
| Si falla la red | Usa el último config válido de NVS (o fábrica, `params_version 0`) | Si falla Open-Meteo usa `[21, 24]`; si falla MQTT el config queda en `comfort_params` |

El índice es el mismo de siempre, `C = Σ wᵢ·Sᵢ` con pesos 0.35/0.20/0.20/0.25; lo que se adapta son los **rangos**.
`tuner.comfort_index` (Python) es la referencia exacta de `comfort.h`; ambos pasan los mismos casos de
`firmware/classai_node/test/comfort_cases.txt`.

| Puntuación Sᵢ | Dentro del rango | Fuera |
|---|---|---|
| Temperatura | 100 | lineal a 0 a ±3 °C del borde |
| Humedad, luz | 100 | lineal a 0 a una distancia igual al ancho del rango |
| Ruido | 100 si ≤ `noise_rel_max` | lineal a 0 en `noise_rel_max + 0.3` |
| Sensor inválido (NaN/null) | — | su peso se reparte entre los válidos; sin ninguno válido `comfort = -1` → telemetría `null`, estado `REGULAR` (no acciona ventilador) |

Redondeo `floor(x + 0.5)` en ambos lados (no el redondeo bancario de Python).

## 2. ¿Por qué no un LLM, un "modelo de decisión" o TinyML en el lazo de control?

| Opción | Problema en este proyecto |
|---|---|
| LLM decide si encender el ventilador | No determinista, latencia de red, requiere internet, costo por llamada, difícil de auditar |
| Modelo supervisado (árbol, red) | No hay etiquetas el día 1; con pocas clases no generaliza |
| TinyML en el ESP32 | Mismo problema de etiquetas; reentrenar = reflashear; nada que ganar frente a una fórmula de 4 términos |
| **Reglas con base normativa + ajuste online acotado** | Funciona el día 1, explicable fila por fila (`source`), ligero, determinista en el borde, offline-first |

El LLM solo **explica** decisiones y responde preguntas (sección 5); nunca escribe parámetros.

## 3. Reglas (sin etiquetas)

| Variable | Regla | Fuente | Fallback |
|---|---|---|---|
| Temperatura | Modelo adaptativo: `T_comf = 0.31·T_rm + 17.8`, banda 90 % de aceptabilidad `±2.5 °C`; `T_rm` se acota a 10–33.5 °C | ASHRAE 55 §5.4 (2020/2023) [1][2] | Sin coordenadas en `rooms` o API caída → `[21, 24]` |
| `T_rm` | Media exterior de los 7 días previos, ponderada exponencialmente `α = 0.8` (pesos `α⁰…α⁶` normalizados); hoy no cuenta (es pronóstico) | α = 0.8 y 7 días: EN 16798-1:2019 [3]; ASHRAE 55 admite 7–30 días y α 0.6–0.9 | — |
| Datos exteriores | Open-Meteo `daily=temperature_2m_mean&past_days=7`, sin clave, timeout 5 s, caché en memoria por (lat, lon, día) | [4] | — |
| Ruido | `noise_rel_max` = P90 de los promedios por minuto de `noise_rel` de sesiones anteriores **de la misma (aula, curso)**; acotado a [0.2, 0.8] | Línea base relativa (el KY-038 no mide dB) | < 30 minutos o < 2 sesiones → 0.5 |
| Luz | `[300, 500]` lx; si la clase empieza ≥ 18:00 hora local → `[500, 750]` | EN 12464-1: aulas 300 lx; clases nocturnas/educación de adultos 500 lx [5] | — |
| Humedad | `[40, 60]` % fijo | — | — |

Notas: EN 16798-1 tiene su propia recta (`0.33·T_rm + 18.8`, categorías I–III); usamos la de ASHRAE 55 y de EN 16798-1
solo la media móvil. El modelo adaptativo se definió para espacios ventilados naturalmente (aulas típicas de
Lima). Ejemplo real (Open-Meteo, Lima, 2026-10-08): `T_rm = 22.2 °C → T_comf = 24.7 °C → [22.2, 27.2]`.

## 4. Aprendizaje con el feedback del docente (River)

| Paso | Detalle |
|---|---|
| Entrada | `POST /feedback {room, kind, session_id?}`; `kind ∈ ok, hot, cold, noisy, dark, fan_override_on, fan_override_off` |
| Contexto guardado | `feedback.context` = última lectura por métrica (≤ 15 min) + config vigente |
| Modelos | Por aula, 4 `river.linear_model.LogisticRegression` online (SGD lr 0.3, sin intercepto común): `hot`, `cold`, `noisy`, `dark` |
| Features | `course=<curso>` (one-hot: hace de sesgo propio de la clase), `hour` local, `t_out` (= `T_rm`), `dev` = desviación de la lectura respecto al objetivo de las reglas |
| Etiquetas | `hot`/`fan_override_on` → hot=1, cold=0 · `cold` → cold=1, hot=0 · `ok` → todos 0 · `noisy` → noisy=1 · `dark` → dark=1 · `fan_override_off` → hot=0 |
| De probabilidad a parámetro | Se evalúa con `dev = 0` (la lectura justo en el objetivo): "¿se quejarían aunque estemos en rango?" |
| Desplazamiento | temp `−2·(P_hot − P_cold)` ∈ [−2, +2] °C · ruido `−0.15·(2P_noisy − 1)` ∈ ±0.15 · luz `+200·max(0, 2P_dark − 1)` ∈ [0, 200] lx |
| Sin feedback | Para esa (aula, curso) el desplazamiento es 0 |
| Persistencia | `models/feedback_{room}.pkl` junto a la base (escritura atómica) |

Por qué River y no un promedio de quejas (EWMA): con pocas quejas ambos se comportan igual (un sesgo acotado por
curso; 5 "hot" dentro del rango bajan el rango ≈ 0.6 °C, ≈ 0.15 °C por queja al inicio). Con más datos, `dev`, `hour`
y `t_out` separan quejas explicadas por estar fuera de rango (las explica `dev`, el objetivo se mueve menos) de una
preferencia real de la clase (peso del curso), y capturan efectos de hora y clima que un promedio no ve. La forma
`P → desplazamiento` garantiza los límites aunque el modelo se desvíe.

Cada config publicado: `params_version` = último del aula + 1 (fijado dentro de `BEGIN IMMEDIATE`), se guarda en
`comfort_params` con `reason` (`session_started:<id>` o `feedback:<kind>`) y se publica retenido QoS 1 en
`classai/v1/{room}/config`. `source` explica cada rango:

```json
"source": {"temp": "ashrae55_adaptive", "rh": "fixed", "noise": "baseline_p90", "lux": "en12464",
           "t_rm": 22.2, "t_comf": 24.68, "course": "CS5055", "shift": {"temp": -0.8, "noise": 0.0, "lux": 0}}
```

## 5. Asistente: capa semántica + tool-calling (no text-to-SQL)

| Decisión | Motivo |
|---|---|
| El LLM elige entre herramientas fijas (`llm_tools.TOOLS`) que llaman endpoints GET de solo lectura | No puede leer tablas no expuestas (tokens), ni escribir, ni generar SQL costoso; cada respuesta es reproducible |
| Argumentos filtrados contra el esquema de cada herramienta; `session_id` va URL-encoded en la ruta | Sin inyección de rutas ni parámetros extra |
| Claves `token`/`uid`/`credential` eliminadas de cada resultado | Defensa extra: un token nunca llega al modelo ni se presenta como identidad |
| Prompt de sistema con fecha/hora actual de `America/Lima` | "Hoy", "ayer", "esta semana" se resuelven bien |
| Fuera de alcance → respuesta breve de que solo ayuda con aulas/clases/confort | Seguridad y foco |
| Proveedor compatible con OpenAI (`LLM_BASE_URL`, `DEEPSEEK_MODEL`; DeepSeek por defecto) | Cambiar de proveedor sin tocar código |
| MCP | Opcional después: las mismas herramientas se pueden exponer como servidor MCP sin cambiar la API |

Herramientas: `get_current_class`, `get_session_summary`, `list_sessions`, `compare_sessions`, `get_metric_series`,
`get_attendance`, `explain_comfort_decision` (→ `GET /comfort/params/{room}`, y con `session_id` el config que usó esa sesión)
y las 4 de temperatura legada.

## 6. Niveles de datos

| Nivel | Tabla | Retención | Uso |
|---|---|---|---|
| Crudo | `readings_raw` | 7 días | Depuración, última lectura |
| Minuto | `sensor_minutes` | Indefinida | Series, línea base de ruido |
| Sesión | `session_summaries` | Indefinida | Lo que más consulta el asistente |
| Decisiones | `comfort_params`, `feedback` | Indefinida | Explicar por qué el aula tenía esos rangos |

## Fuentes

1. ANSI/ASHRAE Standard 55-2020/2023, *Thermal Environmental Conditions for Human Occupancy*, §5.4 (modelo adaptativo). Resumen: <https://en.wikipedia.org/wiki/ASHRAE_55>
2. pythermalcomfort, `adaptive_ashrae` (SLOPE 0.31, INTERCEPT 17.8, ±2.5/±3.5, T_rm 10–33.5 °C): <https://pythermalcomfort.readthedocs.io/en/latest/_modules/pythermalcomfort/models/adaptive_ashrae.html>
3. EN 16798-1:2019 (α = 0.8, 7 días), vía pythermalcomfort `running_mean_outdoor_temperature`: <https://pythermalcomfort.readthedocs.io/en/latest/documentation/utilities_functions.html>
4. Open-Meteo Forecast API: <https://open-meteo.com/en/docs>
5. EN 12464-1 (aulas 300 lx; clases nocturnas y educación de adultos 500 lx): <https://www.thorlux.com/applications/education/classroom>, <https://www.trilux.com/en/lighting-practice/indoor-lighting/specific-lighting-requirements/lighting-of-educational-facilities/adult-education>. La edición 2021 sube algunos valores; revisar si se exige 500 lx en todas las aulas.
6. River `linear_model.LogisticRegression`: <https://riverml.xyz/latest/api/linear-model/LogisticRegression/>
