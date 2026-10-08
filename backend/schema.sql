-- Esquema ClassAI v1 (SQLite). Idempotente: se ejecuta en cada arranque del backend.
-- Contratos MQTT en docs/contracts.md. Tiempos en ISO 8601 UTC ("YYYY-MM-DDTHH:MM:SSZ"),
-- minutos como "YYYY-MM-DD HH:MM" (mismo formato que temperature_minutes).
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,                 -- igual al {room} del tópico
    name TEXT,
    latitude REAL,                       -- para la temperatura exterior (ASHRAE 55)
    longitude REAL,
    timezone TEXT NOT NULL DEFAULT 'America/Lima'
);

CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,           -- código universitario
    full_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- #73: un estudiante puede tener varias credenciales; una credencial activa pertenece a uno solo.
CREATE TABLE IF NOT EXISTS credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id),
    type TEXT NOT NULL CHECK (type IN ('nfc_card_uid', 'android_hce')),
    token TEXT NOT NULL,                 -- HEX mayúsculas normalizado
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    revoked_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS credentials_active_token
    ON credentials(type, token) WHERE active = 1;

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,                 -- session_id del nodo
    room TEXT NOT NULL,
    device TEXT NOT NULL,
    course TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    params_version INTEGER               -- config de confort vigente al iniciar
);
CREATE INDEX IF NOT EXISTS sessions_room_started ON sessions(room, started_at);

-- Todos los eventos recibidos; event_id deduplica reenvíos QoS 1.
CREATE TABLE IF NOT EXISTS events (
    event_id TEXT PRIMARY KEY,
    event TEXT NOT NULL,
    room TEXT NOT NULL,
    device TEXT NOT NULL,
    session_id TEXT,
    received_at TEXT NOT NULL,
    payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    student_id INTEGER NOT NULL REFERENCES students(id),
    credential_id INTEGER NOT NULL REFERENCES credentials(id),
    recorded_at TEXT NOT NULL,
    UNIQUE (session_id, student_id)
);

-- Lecturas rechazadas (credencial desconocida, revocada, sesión cerrada...). Sirve para enrolar.
CREATE TABLE IF NOT EXISTS attendance_rejections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT,
    session_id TEXT,
    credential_type TEXT,
    token TEXT,
    reason TEXT NOT NULL CHECK (reason IN ('unknown_credential', 'revoked_credential', 'unknown_session', 'closed_session', 'invalid_payload')),
    received_at TEXT NOT NULL
);

-- Telemetría cruda (retención corta, la purga el backend).
CREATE TABLE IF NOT EXISTS readings_raw (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT NOT NULL,
    device TEXT NOT NULL,
    session_id TEXT,
    received_at TEXT NOT NULL,
    payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS readings_raw_received ON readings_raw(received_at);

-- Resumen por minuto en formato largo: una fila por (device, métrica, minuto).
-- metric ∈ temp_c, rh_pct, lux, noise_rel, presence (0/1), ir_object_c, comfort.
CREATE TABLE IF NOT EXISTS sensor_minutes (
    room TEXT NOT NULL,
    device TEXT NOT NULL,
    metric TEXT NOT NULL,
    minute_utc TEXT NOT NULL,
    samples INTEGER NOT NULL,
    min REAL NOT NULL,
    max REAL NOT NULL,
    avg REAL NOT NULL,
    PRIMARY KEY (device, metric, minute_utc)
);
CREATE INDEX IF NOT EXISTS sensor_minutes_room ON sensor_minutes(room, metric, minute_utc);

-- Se materializa al recibir SESSION_ENDED; es lo que más consulta el asistente.
CREATE TABLE IF NOT EXISTS session_summaries (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id),
    room TEXT NOT NULL,
    course TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    temp_avg REAL, temp_min REAL, temp_max REAL,
    rh_avg REAL,
    lux_avg REAL,
    noise_avg REAL,
    noise_high_minutes INTEGER,          -- minutos con noise_rel > noise_rel_max del config vigente
    presence_ratio REAL,
    comfort_avg REAL, comfort_min REAL,
    alert_minutes INTEGER,               -- minutos con comfort promedio < regular_min
    attendance_count INTEGER NOT NULL,
    params_version INTEGER
);

-- Configs de confort publicados (historial completo para explicar decisiones).
CREATE TABLE IF NOT EXISTS comfort_params (
    room TEXT NOT NULL,
    params_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    reason TEXT NOT NULL,                -- p.ej. "session_started:a101-2026...", "feedback", "manual"
    payload TEXT NOT NULL,               -- JSON exacto publicado en classai/v1/{room}/config
    PRIMARY KEY (room, params_version)
);

-- Feedback del docente (explícito) o de la anulación manual del ventilador (implícito).
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT NOT NULL,
    session_id TEXT,
    course TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('ok', 'hot', 'cold', 'noisy', 'dark', 'fan_override_on', 'fan_override_off')),
    created_at TEXT NOT NULL,
    context TEXT                         -- JSON: última lectura y params al momento del feedback
);
