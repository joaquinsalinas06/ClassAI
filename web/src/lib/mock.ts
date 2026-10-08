// Deterministic in-browser backend for VITE_MOCK=1. Same shapes as backend/api.py, tuner.py and the
// /live SSE contract. Signals are pure functions of (room, time), so a given minute always has the
// same reading; only "now" moves.
import type {
  AttendanceRow, ComfortConfig, ComfortParams, CredentialType, CurrentClass, LiveEvent, Room, SeriesPoint,
  SessionRow, SummaryRow, Telemetry,
} from "./types";
import { ApiError, type LiveHandlers } from "./api";
import { comfortIndex, comfortState } from "./comfort";

const MIN = 60_000;
const LIMA_OFFSET_H = -5;

// ---------------------------------------------------------------- deterministic noise

function hash(...values: number[]): number {
  let h = 2166136261;
  for (const v of values) {
    h ^= Math.floor(v) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [-1, 1] with the given period. */
function smooth(seed: number, t: number, period: number): number {
  const x = t / period;
  const i = Math.floor(x);
  const f = x - i;
  const u = (1 - Math.cos(f * Math.PI)) / 2;
  const a = hash(seed, i) * 2 - 1;
  const b = hash(seed, i + 1) * 2 - 1;
  return a + (b - a) * u;
}

// ---------------------------------------------------------------- rooms, courses, people

interface MockRoom {
  id: string;
  name: string;
  seed: number;
  base: { temp: number; rh: number; lux: number; noise: number };
  heat: number; // °C added by a full room
  schedule: [hour: number, course: string][];
  live: { course: string; startedMinAgo: number } | null;
  online: boolean;
}

const ROOMS: MockRoom[] = [
  {
    id: "a101", name: "Aula A101", seed: 11, base: { temp: 23.1, rh: 51, lux: 430, noise: 0.27 }, heat: 1.4,
    schedule: [[8, "MA2001"], [10, "IOT4010"], [14, "CS5055"], [16, "FI1102"]],
    live: { course: "IOT4010", startedMinAgo: 52 }, online: true,
  },
  {
    id: "b204", name: "Laboratorio B204", seed: 23, base: { temp: 25.9, rh: 56, lux: 360, noise: 0.35 }, heat: 2.4,
    schedule: [[9, "CS5055"], [11, "IOT4010"], [15, "EE3020"], [19, "CS2100"]],
    live: { course: "CS5055", startedMinAgo: 34 }, online: true,
  },
  {
    id: "c310", name: "Auditorio C310", seed: 37, base: { temp: 22.4, rh: 55, lux: 520, noise: 0.22 }, heat: 1.1,
    schedule: [[8, "HU1001"], [12, "MA2001"], [18, "AD3050"]],
    live: null, online: false,
  },
];
const roomById = (id: string) => ROOMS.find((r) => r.id === id);

const NAMES = [
  "Valeria Quispe Mamani", "Diego Huamán Torres", "Camila Rojas Salazar", "Mateo Flores Vargas", "Luciana Chávez Paredes",
  "Sebastián Castillo Ramos", "Ariana Mendoza Cárdenas", "Joaquín Gutiérrez Ríos", "Fernanda Sánchez Huerta",
  "Thiago Ramírez Espinoza", "Mía Torres Villanueva", "Adrián Paredes Cruz", "Daniela Vega Alarcón", "Gabriel Medina Soto",
  "Renata Silva Campos", "Nicolás Herrera Pinto", "Isabella Cáceres León", "Santiago Aguilar Núñez", "Antonella Ruiz Delgado",
  "Rodrigo Ortiz Palacios", "Ximena Navarro Ccori", "Alonso Benites Rivera", "Micaela Zapata Loayza", "Bruno Carrasco Tello",
  "Valentina Apaza Condori", "Emilio Lozano Farfán", "Catalina Ponce Arévalo", "Gonzalo Salas Inga", "Abril Montoya Rosales",
  "Leonardo Ccahuana Rojas", "Julieta Ayala Meza", "Martín Ticona Yupanqui", "Paula Espinoza Bravo", "Ignacio Vilca Huanca",
  "Rafaela Cornejo Arce", "Franco Yauri Choque",
];
const STUDENTS = NAMES.map((full_name, i) => ({
  code: `2023${String(1000 + ((i * 7919) % 8999)).padStart(4, "0")}`,
  full_name,
  credential_type: (hash(i, 99) < 0.32 ? "android_hce" : "nfc_card_uid") as CredentialType,
}));

// ---------------------------------------------------------------- sessions

interface MockSession {
  id: string;
  room: MockRoom;
  course: string;
  start: number;
  end: number | null; // null = in progress
}

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const minuteKey = (ms: number) => iso(ms).slice(0, 16).replace("T", " ");
const sessionId = (room: string, start: number) => `${room}-${iso(start).replaceAll("-", "").replaceAll(":", "")}`;

const loadedAt = Date.now();
const floorMin = (ms: number) => Math.floor(ms / MIN) * MIN;

function buildSessions(): MockSession[] {
  const list: MockSession[] = [];
  const todayLima = new Date(loadedAt + LIMA_OFFSET_H * 3600_000);
  for (const room of ROOMS) {
    for (let day = 21; day >= 0; day--) {
      const d = new Date(Date.UTC(todayLima.getUTCFullYear(), todayLima.getUTCMonth(), todayLima.getUTCDate() - day));
      const weekday = d.getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
      for (const [hour, course] of room.schedule) {
        if (hash(room.seed, day, hour) < 0.12) continue; // some classes don't happen
        const start = d.getTime() + (hour - LIMA_OFFSET_H) * 3600_000 + Math.floor(hash(room.seed, day, hour, 1) * 6) * MIN;
        const end = start + (80 + Math.floor(hash(room.seed, day, hour, 2) * 12)) * MIN;
        if (end < loadedAt - 5 * MIN) list.push({ id: sessionId(room.id, start), room, course, start, end });
      }
    }
    if (room.live) {
      const start = floorMin(loadedAt - room.live.startedMinAgo * MIN);
      // drop any scheduled session overlapping the live one
      for (let i = list.length - 1; i >= 0; i--) if (list[i]!.room === room && list[i]!.end! > start - 10 * MIN) list.splice(i, 1);
      list.push({ id: sessionId(room.id, start), room, course: room.live.course, start, end: null });
    }
  }
  return list.sort((a, b) => b.start - a.start);
}
const SESSIONS = buildSessions();
const sessionById = (id: string) => SESSIONS.find((s) => s.id === id);
const sessionAt = (room: MockRoom, t: number) => SESSIONS.find((s) => s.room === room && t >= s.start && t <= (s.end ?? Infinity));

// ---------------------------------------------------------------- configs

const configs = new Map<string, ComfortParams>();
function baseConfig(room: MockRoom, version: number, shiftTemp = 0): ComfortConfig {
  return {
    v: 1,
    params_version: version,
    room: room.id,
    temp_c: [Number((22.2 + shiftTemp).toFixed(1)), Number((27.2 + shiftTemp).toFixed(1))],
    rh_pct: [40, 60],
    lux: [300, 500],
    noise_rel_max: room.id === "b204" ? 0.47 : room.id === "a101" ? 0.42 : 0.5,
    weights: { temp: 0.35, rh: 0.2, lux: 0.2, noise: 0.25 },
    ok_min: 80,
    regular_min: 60,
    source: {
      temp: "ashrae55_adaptive", rh: "fixed", noise: room.id === "c310" ? "factory" : "baseline_p90", lux: "en12464",
      t_rm: 22.2, t_comf: 24.68, course: room.live?.course ?? room.schedule[0]?.[1] ?? null,
      shift: { temp: shiftTemp, noise: 0, lux: 0 },
    },
  };
}
function paramsFor(roomId: string): ComfortParams {
  const room = roomById(roomId);
  if (!room) {
    const factory: ComfortConfig = { ...baseConfig(ROOMS[0]!, 0), room: roomId, temp_c: [21, 24], noise_rel_max: 0.5,
      source: { temp: "factory", rh: "factory", noise: "factory", lux: "factory" } };
    return { room: roomId, current: factory, history: [] };
  }
  let params = configs.get(roomId);
  if (!params) {
    const top = room.id === "a101" ? 14 : room.id === "b204" ? 9 : 3;
    const recent = SESSIONS.filter((s) => s.room === room).slice(0, 4);
    const history = Array.from({ length: Math.min(top, 6) }, (_, i) => {
      const version = top - i;
      const shift = room.id === "a101" ? Number((-0.4 + i * 0.1).toFixed(1)) : 0;
      const reason = i === 1 && room.id === "a101" ? "feedback:hot" : `session_started:${recent[i]?.id ?? "manual"}`;
      return {
        params_version: version,
        created_at: iso(recent[i]?.start ?? loadedAt - (i + 1) * 86_400_000),
        reason,
        config: baseConfig(room, version, shift),
      };
    });
    params = { room: room.id, current: history[0]!.config, history };
    configs.set(roomId, params);
  }
  return params;
}

// ---------------------------------------------------------------- signals

interface Sample {
  temp_c: number;
  rh_pct: number;
  lux: number;
  noise_rel: number;
  presence: boolean;
  ir_object_c: number;
}

function sample(room: MockRoom, t: number): Sample {
  const s = room.seed;
  const session = sessionAt(room, t);
  const limaHour = (((t / 3600_000 + LIMA_OFFSET_H) % 24) + 24) % 24;
  const daily = Math.sin(((limaHour - 9) / 24) * 2 * Math.PI); // warmest mid-afternoon
  const minutesIn = session ? (t - session.start) / MIN : 0;
  const fill = session ? Math.min(1, minutesIn / 35) : 0;
  const wave = smooth(s, t, 40 * MIN) * 0.7 + smooth(s + 1, t, 9 * MIN) * 0.3 + smooth(s + 2, t, 45_000) * 0.08;
  let temp = room.base.temp + 1.1 * daily + room.heat * fill + 0.65 * wave;
  // b204: a sustained heat episode while full (it's the lab with the servers)
  if (room.id === "b204" && session) temp += 3.2 * Math.max(0, smooth(s + 9, t, 25 * MIN));
  const rh = room.base.rh + 4 * smooth(s + 3, t, 50 * MIN) - 1.2 * (temp - room.base.temp) + 1.5 * fill;
  const lux = session
    ? room.base.lux + 45 * smooth(s + 4, t, 15 * MIN) + 12 * smooth(s + 5, t, 60_000)
    : 70 + 140 * Math.max(0, daily) + 10 * smooth(s + 4, t, 15 * MIN);
  const chatter = smooth(s + 6, t, 4 * MIN);
  const burst = Math.max(0, smooth(s + 7, t, 90_000) - 0.55) * 0.9;
  const noise = session
    ? room.base.noise + 0.09 * chatter + burst + 0.03 * smooth(s + 8, t, 20_000) + (minutesIn < 6 ? 0.12 : 0)
    : 0.06 + 0.02 * chatter;
  return {
    temp_c: Number(temp.toFixed(2)),
    rh_pct: Number(Math.min(95, Math.max(20, rh)).toFixed(1)),
    lux: Number(Math.max(0, lux).toFixed(0)),
    noise_rel: Number(Math.min(1, Math.max(0, noise)).toFixed(3)),
    presence: !!session && hash(s, Math.floor(t / 20_000)) > 0.04,
    ir_object_c: Number((temp + 3.6 + 0.4 * wave).toFixed(1)),
  };
}

function telemetryAt(room: MockRoom, t: number): Telemetry {
  const values = sample(room, t);
  const cfg = paramsFor(room.id).current;
  const comfort = comfortIndex(cfg, values);
  const session = sessionAt(room, t);
  return {
    v: 1,
    device: `esp32-${room.id}`,
    room: room.id,
    session_id: session?.id ?? null,
    ts: iso(t),
    uptime_ms: Math.floor((t - loadedAt + 3 * 3600_000) % 2 ** 31),
    ...values,
    comfort,
    state: comfortState(cfg, comfort),
    params_version: cfg.params_version,
    received_at: iso(t),
  };
}

// ---------------------------------------------------------------- attendance

const lateArrivals = new Map<string, AttendanceRow[]>();

function roster(session: MockSession): AttendanceRow[] {
  const n = 18 + Math.floor(hash(session.start / MIN, 3) * 14);
  return STUDENTS.map((s, i) => ({ s, k: hash(session.start / MIN, i) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, n)
    .map(({ s }, i) => {
      const late = hash(session.start / MIN, i, 7);
      const offset = late < 0.8 ? late * 10 : 10 + (late - 0.8) * 90;
      return { code: s.code, full_name: s.full_name, credential_type: s.credential_type, recorded_at: iso(session.start + offset * MIN + i * 3000) };
    })
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
}

function attendanceFor(session: MockSession, now = Date.now()): AttendanceRow[] {
  const base = roster(session).filter((row) => session.end != null || Date.parse(row.recorded_at) <= now);
  return [...base, ...(lateArrivals.get(session.id) ?? [])];
}

// ---------------------------------------------------------------- summaries and series

const summaryCache = new Map<string, SummaryRow>();
function summarize(session: MockSession): SummaryRow {
  const cached = summaryCache.get(session.id);
  if (cached) return cached;
  const cfg = paramsFor(session.room.id).current;
  const end = session.end ?? Date.now();
  let n = 0, temp = 0, tMin = Infinity, tMax = -Infinity, rh = 0, lux = 0, noise = 0, noisyMin = 0, present = 0, comfort = 0, cMin = Infinity, alertMin = 0;
  for (let t = session.start; t < end; t += MIN) {
    const v = sample(session.room, t);
    const c = comfortIndex(cfg, v);
    n++;
    temp += v.temp_c; tMin = Math.min(tMin, v.temp_c); tMax = Math.max(tMax, v.temp_c);
    rh += v.rh_pct; lux += v.lux; noise += v.noise_rel; present += v.presence ? 1 : 0;
    if (v.noise_rel > cfg.noise_rel_max) noisyMin++;
    comfort += c; cMin = Math.min(cMin, c);
    if (c < cfg.regular_min) alertMin++;
  }
  const r2 = (x: number) => Number(x.toFixed(2));
  const row: SummaryRow = {
    session_id: session.id, room: session.room.id, course: session.course, started_at: iso(session.start), ended_at: iso(end),
    minutes: n, temp_avg: r2(temp / n), temp_min: r2(tMin), temp_max: r2(tMax), rh_avg: r2(rh / n), lux_avg: r2(lux / n),
    noise_avg: Number((noise / n).toFixed(3)), noise_high_minutes: noisyMin, presence_ratio: r2(present / n),
    comfort_avg: Number((comfort / n).toFixed(1)), comfort_min: cMin, alert_minutes: alertMin,
    attendance_count: attendanceFor(session).length, params_version: paramsFor(session.room.id).current.params_version,
  };
  if (session.end != null) summaryCache.set(session.id, row);
  return row;
}

function series(session: MockSession, metric: string, bucket: number): SeriesPoint[] {
  const cfg = paramsFor(session.room.id).current;
  const end = Math.min(session.end ?? Date.now(), Date.now());
  const rows: SeriesPoint[] = [];
  const first = Math.floor(session.start / (bucket * MIN)) * bucket * MIN;
  for (let b = first; b <= end; b += bucket * MIN) {
    const values: number[] = [];
    for (let t = Math.max(b, floorMin(session.start)); t < b + bucket * MIN && t <= end; t += MIN) {
      const v = sample(session.room, t);
      const value = metric === "comfort" ? comfortIndex(cfg, v) : metric === "presence" ? (v.presence ? 1 : 0) : (v as unknown as Record<string, number>)[metric];
      if (typeof value === "number") values.push(value);
    }
    if (values.length === 0) continue;
    rows.push({
      bucket_start: minuteKey(Math.max(b, floorMin(session.start))),
      samples: values.length * 12,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: Number((values.reduce((a, c) => a + c, 0) / values.length).toFixed(3)),
    });
  }
  return rows;
}

// ---------------------------------------------------------------- credentials

const credentials: { id: number; type: CredentialType; token: string; code: string; active: boolean }[] = [];
const LENGTHS: Record<CredentialType, number[]> = { nfc_card_uid: [8, 14, 20], android_hce: [32] };

// ---------------------------------------------------------------- router

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mockRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const url = new URL(path, "http://mock");
  const p = url.pathname;
  const q = url.searchParams;
  const method = (init.method ?? "GET").toUpperCase();
  const body = init.body ? JSON.parse(String(init.body)) : null;
  const key = new Headers(init.headers).get("X-API-Key");
  await delay(140 + hash(p.length, Date.now() / 1000) * 260);
  const now = Date.now();

  if (p === "/health") return { status: "ok", database: "available" };

  if (p === "/rooms") {
    return ROOMS.map<Room>((room) => {
      const lastSeen = room.online ? now : now - 3 * 3600_000 - 17 * MIN;
      const live = SESSIONS.find((s) => s.room === room && s.end == null);
      return {
        id: room.id, name: room.name, latitude: -12.1352, longitude: -77.0221,
        status: room.online ? "online" : "offline",
        current_session_id: room.online ? live?.id ?? null : null,
        last_telemetry: telemetryAt(room, lastSeen),
      };
    });
  }

  if (p === "/classes/current") {
    const room = roomById(q.get("room") ?? "");
    if (!room) return { room: q.get("room") ?? "", session: null, latest_reading: null } satisfies CurrentClass;
    const live = SESSIONS.find((s) => s.room === room && s.end == null);
    const t = room.online ? now : now - 3 * 3600_000 - 17 * MIN;
    const { v: _v, device: _d, room: _r, session_id: _s, ts: _ts, uptime_ms: _u, ...reading } = telemetryAt(room, t);
    return {
      room: room.id,
      session: live
        ? { id: live.id, room: room.id, course: live.course, started_at: iso(live.start), params_version: paramsFor(room.id).current.params_version, attendance_count: attendanceFor(live).length }
        : null,
      latest_reading: { ...reading, received_at: iso(t) },
    } satisfies CurrentClass;
  }

  if (p === "/sessions") {
    const start = q.get("start") ? Date.parse(q.get("start")!) : -Infinity;
    const end = q.get("end") ? Date.parse(q.get("end")!) : Infinity;
    const rows = SESSIONS.filter((s) =>
      (!q.get("room") || s.room.id === q.get("room")) && (!q.get("course") || s.course === q.get("course")) && s.start >= start && s.start < end,
    )
      .slice(0, Number(q.get("limit") ?? 200))
      .map<SessionRow>((s) => {
        const sum = s.end != null ? summarize(s) : null;
        return {
          session_id: s.id, room: s.room.id, course: s.course, started_at: iso(s.start), ended_at: s.end != null ? iso(s.end) : null,
          params_version: paramsFor(s.room.id).current.params_version, minutes: sum?.minutes ?? null, temp_avg: sum?.temp_avg ?? null,
          comfort_avg: sum?.comfort_avg ?? null, alert_minutes: sum?.alert_minutes ?? null, attendance_count: sum?.attendance_count ?? null,
        };
      });
    return { found: rows.length > 0, count: rows.length, data: rows };
  }

  if (p === "/sessions/compare") {
    const rows = q.getAll("ids").map(sessionById).filter((s): s is MockSession => !!s && s.end != null).map(summarize)
      .sort((a, b) => a.started_at.localeCompare(b.started_at));
    return { found: rows.length > 0, count: rows.length, data: rows };
  }

  const sessionMatch = /^\/sessions\/([^/]+)\/(summary|series|attendance)$/.exec(p);
  if (sessionMatch) {
    const session = sessionById(decodeURIComponent(sessionMatch[1]!));
    if (!session) return sessionMatch[2] === "attendance" ? { found: false, count: 0, data: [] } : { found: false, message: "La sesión no existe" };
    if (sessionMatch[2] === "summary") {
      if (session.end != null) return { found: true, status: "finalizada", ...summarize(session) };
      return { found: true, status: "en_curso", id: session.id, room: session.room.id, device: `esp32-${session.room.id}`, course: session.course,
        started_at: iso(session.start), ended_at: null, params_version: paramsFor(session.room.id).current.params_version };
    }
    if (sessionMatch[2] === "series") {
      const metric = q.get("metric") ?? "";
      if (!["temp_c", "rh_pct", "lux", "noise_rel", "presence", "ir_object_c", "comfort"].includes(metric)) {
        throw new ApiError(400, "metric debe ser una de: temp_c, rh_pct, lux, noise_rel, presence, ir_object_c, comfort");
      }
      const rows = series(session, metric, Number(q.get("bucket_minutes") ?? 5));
      return { found: rows.length > 0, count: rows.length, data: rows };
    }
    const rows = attendanceFor(session, now);
    return { found: rows.length > 0, count: rows.length, data: rows };
  }

  const paramsMatch = /^\/comfort\/params\/([a-z0-9-]+)$/.exec(p);
  if (paramsMatch) return paramsFor(paramsMatch[1]!);

  if (p === "/feedback" && method === "POST") {
    const params = paramsFor(body.room);
    const cur = params.current;
    const shift = { temp: 0, noise: 0, lux: 0, ...cur.source.shift };
    if (body.kind === "hot") shift.temp = Math.max(-2, shift.temp - 0.15);
    if (body.kind === "cold") shift.temp = Math.min(2, shift.temp + 0.15);
    if (body.kind === "noisy") shift.noise = Math.max(-0.15, shift.noise - 0.02);
    if (body.kind === "dark") shift.lux = Math.min(200, shift.lux + 25);
    const dt = shift.temp - (cur.source.shift?.temp ?? 0);
    const next: ComfortConfig = {
      ...cur,
      params_version: cur.params_version + 1,
      temp_c: [Number((cur.temp_c[0] + dt).toFixed(1)), Number((cur.temp_c[1] + dt).toFixed(1))],
      lux: [300 + shift.lux, 500 + shift.lux],
      noise_rel_max: Number((0.42 + shift.noise).toFixed(3)),
      source: { ...cur.source, shift: { temp: Number(shift.temp.toFixed(2)), noise: Number(shift.noise.toFixed(3)), lux: shift.lux } },
    };
    params.history.unshift({ params_version: next.params_version, created_at: iso(now), reason: `feedback:${body.kind}`, config: next });
    params.current = next;
    const live = SESSIONS.find((s) => s.room.id === body.room && s.end == null);
    liveConfigListeners.forEach((fn) => fn(next));
    return { feedback_id: Math.floor(now / 1000) % 100000, session_id: live?.id ?? null, config: next, published: true };
  }

  if (p === "/credentials" && method === "POST") {
    if (!key) throw new ApiError(401, "X-API-Key inválida");
    const token = String(body.token ?? "").replace(/[\s:-]/g, "").toUpperCase();
    if (!/^[0-9A-F]+$/.test(token) || !LENGTHS[body.type as CredentialType]?.includes(token.length)) {
      throw new ApiError(400, `Token inválido para ${body.type}: se esperan ${LENGTHS[body.type as CredentialType]?.join(", ")} caracteres HEX`);
    }
    if (credentials.some((c) => c.active && c.type === body.type && c.token === token)) throw new ApiError(409, "Esa credencial ya está activa");
    const id = 100 + credentials.length + 1;
    credentials.push({ id, type: body.type, token, code: body.student_code, active: true });
    return { credential_id: id, student_id: 500 + credentials.length, code: body.student_code, type: body.type };
  }

  const revokeMatch = /^\/credentials\/(\d+)\/revoke$/.exec(p);
  if (revokeMatch && method === "POST") {
    if (!key) throw new ApiError(401, "X-API-Key inválida");
    const credential = credentials.find((c) => c.id === Number(revokeMatch[1]) && c.active);
    if (!credential) throw new ApiError(404, "Credencial inexistente o ya revocada");
    credential.active = false;
    return { revoked: true, credential_id: credential.id };
  }

  if (p === "/assistant/ask" && method === "POST") {
    await delay(700);
    return assistantAnswer(String(body.question ?? ""));
  }

  throw new ApiError(404, "Not Found");
}

function assistantAnswer(question: string) {
  const q = question.toLowerCase();
  const a101 = summarize(SESSIONS.find((s) => s.room.id === "a101" && s.end == null)!);
  const b204 = summarize(SESSIONS.find((s) => s.room.id === "b204" && s.end == null)!);
  if (q.includes("calor") || q.includes("calur") || q.includes("temperatura")) {
    return {
      answer: `El Laboratorio B204 es el aula más cálida ahora: promedia ${b204.temp_avg?.toFixed(1)} °C en la sesión actual, con un máximo de ${b204.temp_max?.toFixed(1)} °C. El rango objetivo es 22.2–27.2 °C (ASHRAE 55 adaptativo con una media exterior de 22.2 °C), así que pasó ${b204.alert_minutes} minutos en alerta. En A101 la temperatura se mantiene en rango (${a101.temp_avg?.toFixed(1)} °C de promedio).`,
      tools_used: ["get_current_class", "get_session_summary", "explain_comfort_decision"],
    };
  }
  if (q.includes("asist") || q.includes("alumno") || q.includes("estudiante")) {
    return {
      answer: `En la sesión en curso de A101 (IOT4010) registraron asistencia ${a101.attendance_count} estudiantes; la mayoría marcó en los primeros 10 minutos. En B204 van ${b204.attendance_count}.`,
      tools_used: ["get_current_class", "get_attendance"],
    };
  }
  if (q.includes("rango") || q.includes("por qué") || q.includes("porque")) {
    return {
      answer: "El rango de temperatura de A101 sale del modelo adaptativo de ASHRAE 55: con una media exterior móvil de 22.2 °C, la temperatura de confort es 24.7 °C y la banda del 90 % de aceptabilidad va de 22.2 a 27.2 °C. Luego se desplazó −0.4 °C porque el docente reportó calor dos veces en esta clase. El ruido usa el P90 de las sesiones anteriores del mismo curso (0.42).",
      tools_used: ["explain_comfort_decision"],
    };
  }
  return {
    answer: `Hoy hay dos clases en curso: IOT4010 en A101 (confort promedio ${Math.round(a101.comfort_avg ?? 0)}) y CS5055 en B204 (confort promedio ${Math.round(b204.comfort_avg ?? 0)}). El Auditorio C310 está sin conexión desde hace unas tres horas.`,
    tools_used: ["get_current_class", "list_sessions"],
  };
}

// ---------------------------------------------------------------- live stream

const liveConfigListeners = new Set<(cfg: ComfortConfig) => void>();

export function openMockLive(roomId: string, h: LiveHandlers): () => void {
  const room = roomById(roomId);
  const timers: ReturnType<typeof setTimeout>[] = [];
  h.onConnection("connecting");
  timers.push(setTimeout(() => {
    h.onConnection("open");
    if (!room) return;
    h.onStatus({ room: room.id, status: room.online ? "online" : "offline" });
    h.onConfig(paramsFor(room.id).current);
    if (!room.online) return;
    const emit = () => h.onTelemetry(telemetryAt(room, Date.now()));
    emit();
    timers.push(setInterval(emit, 2_500) as unknown as ReturnType<typeof setTimeout>);

    const session = SESSIONS.find((s) => s.room === room && s.end == null);
    if (session) {
      let step = 0;
      const present = new Set(attendanceFor(session).map((a) => a.code));
      const pending = STUDENTS.filter((s) => !present.has(s.code));
      const tap = () => {
        step++;
        const now = Date.now();
        let event: LiveEvent;
        if (step % 4 === 3) {
          event = { v: 1, event: "ATTENDANCE_RECORDED", event_id: `mock-${room.id}-${now}`, room: room.id, session_id: session.id,
            ts: iso(now), received_at: iso(now), rejected: { reason: "unknown_credential" } };
        } else {
          const student = pending.shift();
          if (!student) return;
          lateArrivals.set(session.id, [...(lateArrivals.get(session.id) ?? []),
            { code: student.code, full_name: student.full_name, credential_type: student.credential_type, recorded_at: iso(now) }]);
          event = { v: 1, event: "ATTENDANCE_RECORDED", event_id: `mock-${room.id}-${now}`, room: room.id, session_id: session.id,
            ts: iso(now), received_at: iso(now), student: { code: student.code, full_name: student.full_name }, credential_type: student.credential_type };
        }
        h.onEvent(event);
        if (step < 9) timers.push(setTimeout(tap, 6_000 + hash(step, room.seed) * 7_000));
      };
      timers.push(setTimeout(tap, 3_500));
    }
  }, 350));

  const onConfig = (cfg: ComfortConfig) => cfg.room === roomId && h.onConfig(cfg);
  liveConfigListeners.add(onConfig);
  return () => {
    timers.forEach((t) => clearTimeout(t));
    liveConfigListeners.delete(onConfig);
  };
}
