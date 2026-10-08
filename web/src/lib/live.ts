// Live room state: a pure reducer fed by the SSE stream (GET /live/{room}) and the REST backfill.
import type {
  AttendanceRow, ChartMetric, ComfortConfig, CredentialType, LiveEvent, LiveStatus, NodeStatus, RejectReason, Telemetry,
} from "./types";
import { CHART_METRICS, nextFanState } from "./comfort";
import { parseTime } from "./format";
import { appendPoint, type Point } from "./series";

export type Connection = "connecting" | "open" | "reconnecting" | "closed";

export interface Arrival {
  id: string;
  code: string;
  full_name: string;
  credential_type?: CredentialType;
  at: number;
  /** true when it arrived through the stream while the page was open (animates in). */
  live: boolean;
}

export interface Rejection {
  id: string;
  reason: RejectReason;
  at: number;
}

export interface LiveState {
  room: string;
  connection: Connection;
  node: NodeStatus | "unknown";
  latest: Telemetry | null;
  lastAt: number | null;
  points: Record<ChartMetric, Point[]>;
  config: ComfortConfig | null;
  sessionId: string | null;
  course: string | null;
  startedAt: number | null;
  arrivals: Arrival[]; // newest first
  rejections: Rejection[]; // newest first
  fan: { on: boolean; changedAt: number };
}

export type LiveAction =
  | { type: "reset"; room: string }
  | { type: "connection"; value: Connection }
  | { type: "telemetry"; data: Telemetry; now?: number }
  | { type: "event"; data: LiveEvent; now?: number }
  | { type: "config"; data: ComfortConfig }
  | { type: "status"; data: LiveStatus }
  | {
      type: "seed";
      session: { id: string; course: string | null; started_at: string } | null;
      points?: Partial<Record<ChartMetric, Point[]>>;
      attendance?: AttendanceRow[];
    };

const POINT_CAP = 720;
const LIST_CAP = 60;

const emptyPoints = (): Record<ChartMetric, Point[]> =>
  Object.fromEntries(CHART_METRICS.map((m) => [m, [] as Point[]])) as unknown as Record<ChartMetric, Point[]>;

export function initialLive(room: string): LiveState {
  return {
    room,
    connection: "connecting",
    node: "unknown",
    latest: null,
    lastAt: null,
    points: emptyPoints(),
    config: null,
    sessionId: null,
    course: null,
    startedAt: null,
    arrivals: [],
    rejections: [],
    fan: { on: false, changedAt: -Infinity },
  };
}

export function liveReducer(state: LiveState, action: LiveAction): LiveState {
  switch (action.type) {
    case "reset":
      return initialLive(action.room);

    case "connection":
      return state.connection === action.value ? state : { ...state, connection: action.value };

    case "status":
      if (action.data.room !== state.room) return state;
      return { ...state, node: action.data.status };

    case "config":
      // Older versions (e.g. a stale REST response after a fresher SSE frame) never overwrite newer ones.
      if (action.data.room !== state.room || (state.config && action.data.params_version < state.config.params_version)) return state;
      return { ...state, config: action.data };

    case "telemetry": {
      const data = action.data;
      if (data.room !== state.room) return state;
      const t = parseTime(data.received_at) ?? parseTime(data.ts) ?? action.now ?? Date.now();
      const points = { ...state.points };
      for (const metric of CHART_METRICS) {
        const value = data[metric];
        if (typeof value === "number" && Number.isFinite(value) && !(metric === "comfort" && value < 0)) {
          points[metric] = appendPoint(points[metric], { t, v: value }, POINT_CAP);
        }
      }
      const tempMax = state.config?.temp_c[1] ?? 24;
      return {
        ...state,
        node: "online",
        latest: data,
        lastAt: t,
        points,
        sessionId: data.session_id ?? state.sessionId,
        fan: nextFanState(state.fan, data.state, data.temp_c, tempMax, t),
      };
    }

    case "event": {
      const e = action.data;
      if (e.room !== state.room) return state;
      const at = parseTime(e.received_at) ?? parseTime(e.ts) ?? action.now ?? Date.now();
      if (e.event === "SESSION_STARTED") {
        return { ...state, sessionId: e.session_id, course: e.course ?? null, startedAt: at, arrivals: [], rejections: [] };
      }
      if (e.event === "SESSION_ENDED") {
        return e.session_id === state.sessionId ? { ...state, sessionId: null } : state;
      }
      if (e.rejected) {
        if (state.rejections.some((r) => r.id === e.event_id)) return state;
        return { ...state, rejections: [{ id: e.event_id, reason: e.rejected.reason, at }, ...state.rejections].slice(0, LIST_CAP) };
      }
      if (e.student) {
        if (state.arrivals.some((a) => a.code === e.student!.code)) return state;
        const arrival: Arrival = { id: e.event_id, ...e.student, credential_type: e.credential_type, at, live: true };
        return { ...state, arrivals: [arrival, ...state.arrivals].slice(0, 400) };
      }
      return state;
    }

    case "seed": {
      const next: LiveState = { ...state };
      if (action.session) {
        next.sessionId = action.session.id;
        next.course = action.session.course;
        next.startedAt = parseTime(action.session.started_at);
      }
      if (action.points) {
        next.points = { ...state.points };
        for (const metric of CHART_METRICS) {
          const seeded = action.points[metric];
          if (!seeded?.length) continue;
          // Live points win over backfill for the same timestamp.
          next.points[metric] = state.points[metric].reduce((acc, p) => appendPoint(acc, p, POINT_CAP), seeded.slice(-POINT_CAP));
        }
      }
      if (action.attendance) {
        const known = new Set(state.arrivals.map((a) => a.code));
        const seeded: Arrival[] = action.attendance
          .filter((row) => !known.has(row.code))
          .map((row) => ({
            id: `seed-${row.code}`,
            code: row.code,
            full_name: row.full_name,
            credential_type: row.credential_type,
            at: parseTime(row.recorded_at) ?? 0,
            live: false,
          }));
        next.arrivals = [...state.arrivals, ...seeded].sort((a, b) => b.at - a.at);
      }
      return next;
    }
  }
}
