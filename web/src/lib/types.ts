// Shapes of the ClassAI backend (backend/api.py, backend/tuner.py, docs/contracts.md).
export type ComfortState = "OK" | "REGULAR" | "ALERT";
export type NodeStatus = "online" | "offline";
export type ChartMetric = "comfort" | "temp_c" | "rh_pct" | "lux" | "noise_rel";
export type SeriesMetric = ChartMetric | "presence" | "ir_object_c";
export type CredentialType = "nfc_card_uid" | "android_hce";
export type FeedbackKind = "ok" | "hot" | "cold" | "noisy" | "dark";

export interface Readings {
  temp_c?: number | null;
  rh_pct?: number | null;
  lux?: number | null;
  noise_rel?: number | null;
  presence?: boolean | number | null;
  ir_object_c?: number | null;
  comfort?: number | null;
}

export interface Telemetry extends Readings {
  v: number;
  device: string;
  room: string;
  session_id: string | null;
  ts: string | null;
  uptime_ms: number;
  comfort: number | null;
  state: ComfortState;
  params_version: number;
  received_at?: string;
}

export interface ConfigSource {
  temp: string;
  rh?: string;
  noise: string;
  lux: string;
  t_rm?: number | null;
  t_comf?: number | null;
  course?: string | null;
  shift?: { temp: number; noise: number; lux: number };
}

export interface ComfortConfig {
  v: number;
  params_version: number;
  room: string;
  temp_c: [number, number];
  rh_pct: [number, number];
  lux: [number, number];
  noise_rel_max: number;
  weights: { temp: number; rh: number; lux: number; noise: number };
  ok_min: number;
  regular_min: number;
  source: ConfigSource;
}

export interface Room {
  id: string;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  status: NodeStatus | null;
  current_session_id: string | null;
  last_telemetry: (Partial<Telemetry> & { received_at?: string }) | null;
}

export interface CurrentClass {
  room: string;
  session: {
    id: string;
    room: string;
    course: string | null;
    started_at: string;
    params_version: number | null;
    attendance_count: number;
  } | null;
  latest_reading: (Readings & { received_at: string; state: ComfortState | null; params_version: number | null }) | null;
}

export interface SessionRow {
  session_id: string;
  room: string;
  course: string | null;
  started_at: string;
  ended_at: string | null;
  params_version: number | null;
  minutes: number | null;
  temp_avg: number | null;
  comfort_avg: number | null;
  alert_minutes: number | null;
  attendance_count: number | null;
}

export interface SummaryRow {
  session_id: string;
  room: string;
  course: string | null;
  started_at: string;
  ended_at: string;
  minutes: number;
  temp_avg: number | null;
  temp_min: number | null;
  temp_max: number | null;
  rh_avg: number | null;
  lux_avg: number | null;
  noise_avg: number | null;
  noise_high_minutes: number | null;
  presence_ratio: number | null;
  comfort_avg: number | null;
  comfort_min: number | null;
  alert_minutes: number | null;
  attendance_count: number;
  params_version: number | null;
}

export type SessionSummary =
  | ({ found: true; status: "finalizada" } & SummaryRow)
  | {
      found: true;
      status: "en_curso" | "sin_resumen";
      id: string;
      room: string;
      device: string;
      course: string | null;
      started_at: string;
      ended_at: string | null;
      params_version: number | null;
    }
  | { found: false; message: string };

export interface SeriesPoint {
  bucket_start: string; // "YYYY-MM-DD HH:MM" UTC
  samples: number;
  min: number;
  max: number;
  avg: number;
}

export interface AttendanceRow {
  code: string;
  full_name: string;
  credential_type: CredentialType;
  recorded_at: string;
}

export interface ListResponse<T> {
  found: boolean;
  count: number;
  data: T[];
}

export interface ParamsHistoryItem {
  params_version: number;
  created_at: string;
  reason: string;
  config: ComfortConfig;
}

export interface ComfortParams {
  room: string;
  current: ComfortConfig;
  history: ParamsHistoryItem[];
}

export interface FeedbackResponse {
  feedback_id: number;
  session_id: string | null;
  config: ComfortConfig;
  published: boolean;
}

export interface CredentialIn {
  student_code: string;
  full_name: string;
  type: CredentialType;
  token: string;
}

export interface CredentialOut {
  credential_id: number;
  student_id: number;
  code: string;
  type: CredentialType;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantAnswer {
  answer: string;
  tools_used: string[];
}

// ---- Live (SSE) ----
export type RejectReason = "unknown_credential" | "revoked_credential" | "unknown_session" | "closed_session" | "invalid_payload";

export interface LiveEvent {
  v?: number;
  event: "SESSION_STARTED" | "SESSION_ENDED" | "ATTENDANCE_RECORDED";
  event_id: string;
  room: string;
  session_id: string | null;
  ts: string | null;
  course?: string | null;
  received_at?: string;
  student?: { code: string; full_name: string };
  credential_type?: CredentialType;
  rejected?: { reason: RejectReason };
}

export interface LiveStatus {
  room: string;
  status: NodeStatus;
}
