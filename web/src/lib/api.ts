// REST + SSE access. Everything goes through /api (Vite proxies it to the FastAPI backend).
// VITE_MOCK=1 swaps both for the deterministic in-browser generator in ./mock.
import { keepPreviousData, QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AssistantAnswer, AttendanceRow, ChatTurn, ComfortParams, CredentialIn, CredentialOut, CurrentClass, FeedbackKind,
  FeedbackResponse, ListResponse, LiveEvent, LiveStatus, Room, SeriesMetric, SeriesPoint, SessionRow, SessionSummary,
  SummaryRow, Telemetry, ComfortConfig, NodeSnapshot, SessionState, ZonesResponse,
} from "./types";
import type { Connection } from "./live";

export const MOCK = import.meta.env.VITE_MOCK === "1";
export const API_BASE = "/api";
export const UNAUTHORIZED = "classai:unauthorized";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (MOCK) {
    const { mockRequest } = await import("./mock");
    return mockRequest(path, init) as Promise<T>;
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor");
  }
  if (!response.ok) {
    // An expired teacher cookie anywhere in the panel sends the user back to /login (see Shell).
    if (response.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event(UNAUTHORIZED));
    let detail = response.statusText || `Error ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
      else if (Array.isArray(body?.detail)) detail = body.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ");
    } catch {
      // body was not JSON; keep the status text
    }
    throw new ApiError(response.status, detail);
  }
  return response.json() as Promise<T>;
}

const qs = (params: Record<string, string | number | undefined | null | string[]>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => search.append(key, v));
    else search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
};
const enc = encodeURIComponent;

export interface Teacher { id: number; username: string; full_name: string }
export interface SessionDetailRow {
  session_id: string; room: string; course: string | null; device: string; started_at: string; ended_at: string | null;
  open: boolean; attendance_count: number; votes: Record<"ok" | "hot" | "cold", number>; published?: boolean;
}
export interface VoteRow { student_code: string; full_name: string; kind: string; created_at: string }
export type VoteDimension = "light" | "noise" | "motion" | "humidity";
export type VoteLevel = "low" | "ok" | "high";
export interface DimensionVoteRow { student_code: string; full_name: string; dimension: VoteDimension; value: VoteLevel; created_at: string }
export interface VotesResponse {
  counts: SessionDetailRow["votes"]; count: number; data: VoteRow[];
  /** Ausentes en un backend anterior a los votos por dimensión. */
  dimensions?: Record<VoteDimension, Record<VoteLevel, number>>; dimension_data?: DimensionVoteRow[];
}

const MOCK_TEACHER: Teacher = { id: 1, username: "docente", full_name: "Docente demo" };

export const api = {
  me: () => MOCK ? Promise.resolve({ teacher: MOCK_TEACHER }) : request<{ teacher: Teacher }>("/auth/me"),
  login: (username: string, password: string) =>
    request<{ teacher: Teacher }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  createSession: (body: { room: string; course: string; started_at?: string }) =>
    request<SessionDetailRow>("/sessions", { method: "POST", body: JSON.stringify(body) }),
  session: (id: string) => request<SessionDetailRow>(`/sessions/${enc(id)}`),
  closeSession: (id: string) => request<SessionDetailRow>(`/sessions/${enc(id)}/close`, { method: "POST" }),
  deleteSession: (id: string) => request<{ deleted: boolean }>(`/sessions/${enc(id)}`, { method: "DELETE" }),
  votes: (id: string) => request<VotesResponse>(`/sessions/${enc(id)}/votes`),
  health: () => request<{ status: string; database: string }>("/health"),
  rooms: () => request<Room[]>("/rooms"),
  nodes: (room: string) => MOCK ? Promise.resolve([] as NodeSnapshot[]) : request<NodeSnapshot[]>(`/rooms/${enc(room)}/nodes`),
  roomZones: (room: string, minutes = 60) =>
    MOCK ? Promise.resolve<ZonesResponse>({ room, start: "", end: "", zones: [] }) : request<ZonesResponse>(`/rooms/${enc(room)}/zones${qs({ minutes })}`),
  sessionZones: (id: string) =>
    MOCK ? Promise.resolve<ZonesResponse>({ room: "", start: "", end: "", zones: [] }) : request<ZonesResponse>(`/sessions/${enc(id)}/zones`),
  current: (room: string) => request<CurrentClass>(`/classes/current${qs({ room })}`),
  sessions: (f: SessionFilters) =>
    request<ListResponse<SessionRow>>(`/sessions${qs({ room: f.room, course: f.course, start: f.start, end: f.end, limit: f.limit ?? 200 })}`),
  summary: (id: string) => request<SessionSummary>(`/sessions/${enc(id)}/summary`),
  series: (id: string, metric: SeriesMetric, bucket = 5) =>
    request<ListResponse<SeriesPoint> | { found: false; message: string }>(`/sessions/${enc(id)}/series${qs({ metric, bucket_minutes: bucket })}`),
  attendance: (id: string) => request<ListResponse<AttendanceRow>>(`/sessions/${enc(id)}/attendance`),
  compare: (ids: string[]) => request<ListResponse<SummaryRow>>(`/sessions/compare${qs({ ids })}`),
  params: (room: string) => request<ComfortParams>(`/comfort/params/${enc(room)}`),
  feedback: (body: { room: string; kind: FeedbackKind; session_id?: string }) =>
    request<FeedbackResponse>("/feedback", { method: "POST", body: JSON.stringify(body) }),
  enroll: (body: CredentialIn, key: string) =>
    request<CredentialOut>("/credentials", { method: "POST", body: JSON.stringify(body), headers: { "X-API-Key": key } }),
  revoke: (id: number, key: string) =>
    request<{ revoked: boolean; credential_id: number }>(`/credentials/${id}/revoke`, { method: "POST", headers: { "X-API-Key": key } }),
  ask: (question: string, history: ChatTurn[], context?: AskContext) =>
    request<AssistantAnswer>("/assistant/ask", { method: "POST", body: JSON.stringify({ question, history, context }) }),
};

/** Which class or room the teacher is looking at, so "this class" means something to the assistant. */
export interface AskContext {
  session_id?: string;
  room?: string;
}

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: 60_000, retry: false });
export const useVotes = (id: string | undefined, live = false) =>
  useQuery({ queryKey: ["votes", id], queryFn: () => api.votes(id!), enabled: !!id && !MOCK, refetchInterval: live ? 5_000 : false });

/** Create/close/delete invalidate every session-related query so lists and the live room refresh. */
export function useSessionMutations() {
  const client = useQueryClient();
  const refresh = () => {
    for (const key of ["sessions", "summary", "current", "rooms", "votes"]) void client.invalidateQueries({ queryKey: [key] });
  };
  return {
    create: useMutation({ mutationFn: api.createSession, onSuccess: refresh }),
    close: useMutation({ mutationFn: api.closeSession, onSuccess: refresh }),
    remove: useMutation({ mutationFn: api.deleteSession, onSuccess: refresh }),
  };
}

export interface SessionFilters {
  room?: string;
  course?: string;
  start?: string;
  end?: string;
  limit?: number;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

export const useHealth = () => useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 30_000 });
export const useRooms = (poll = 5_000) => useQuery({ queryKey: ["rooms"], queryFn: api.rooms, refetchInterval: poll });
export const useCurrentClass = (room: string | undefined) =>
  useQuery({ queryKey: ["current", room], queryFn: () => api.current(room!), enabled: !!room, refetchInterval: 30_000 });
export const useSessions = (f: SessionFilters) =>
  useQuery({ queryKey: ["sessions", f], queryFn: () => api.sessions(f), placeholderData: keepPreviousData });
export const useSummary = (id: string | undefined) =>
  useQuery({ queryKey: ["summary", id], queryFn: () => api.summary(id!), enabled: !!id });
export const useSeries = (id: string | undefined | null, metric: SeriesMetric, bucket = 5) =>
  useQuery({
    queryKey: ["series", id, metric, bucket],
    queryFn: async () => {
      const result = await api.series(id!, metric, bucket);
      return "data" in result ? result.data : [];
    },
    enabled: !!id,
  });
export const useAttendance = (id: string | undefined | null) =>
  useQuery({ queryKey: ["attendance", id], queryFn: () => api.attendance(id!), enabled: !!id });
export const useCompare = (ids: string[]) =>
  useQuery({ queryKey: ["compare", ids], queryFn: () => api.compare(ids), enabled: ids.length > 0 });
export const useParams = (room: string | undefined) =>
  useQuery({ queryKey: ["params", room], queryFn: () => api.params(room!), enabled: !!room });

export function useFeedback(room: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: { kind: FeedbackKind; session_id?: string }) => api.feedback({ room, ...vars }),
    onSuccess: (result) => {
      client.setQueryData<ComfortParams>(["params", room], (old) =>
        old
          ? {
              ...old,
              current: result.config,
              history: [
                { params_version: result.config.params_version, created_at: new Date().toISOString(), reason: "feedback", config: result.config },
                ...old.history,
              ],
            }
          : old,
      );
      void client.invalidateQueries({ queryKey: ["params", room] });
    },
  });
}

// ---------------------------------------------------------------- SSE

export interface LiveHandlers {
  onTelemetry: (t: Telemetry) => void;
  onEvent: (e: LiveEvent) => void;
  onConfig: (c: ComfortConfig) => void;
  onStatus: (s: LiveStatus) => void;
  onConnection: (c: Connection) => void;
  onNode?: (n: NodeSnapshot) => void;
  onSession?: (s: SessionState) => void;
}

/** Opens GET /live/{room}. EventSource reconnects by itself on network drops; on HTTP errors it
 *  closes, so we retry with backoff (5 s → 30 s). Returns a disposer. */
export function openLiveStream(room: string, handlers: LiveHandlers): () => void {
  let disposed = false;
  let source: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let backoff = 5_000;
  let stopMock: (() => void) | undefined;

  if (MOCK) {
    void import("./mock").then((m) => {
      if (!disposed) stopMock = m.openMockLive(room, handlers);
    });
    return () => {
      disposed = true;
      stopMock?.();
    };
  }

  const parse = <T,>(fn: (value: T) => void) => (event: MessageEvent<string>) => {
    try {
      fn(JSON.parse(event.data) as T);
    } catch {
      // a malformed frame is dropped; the next one replaces it
    }
  };

  const connect = () => {
    handlers.onConnection("connecting");
    source = new EventSource(`${API_BASE}/live/${enc(room)}`);
    source.onopen = () => {
      backoff = 5_000;
      handlers.onConnection("open");
    };
    source.onerror = () => {
      if (!source || disposed) return;
      if (source.readyState === EventSource.CLOSED) {
        handlers.onConnection("closed");
        source.close();
        retry = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30_000);
      } else {
        handlers.onConnection("reconnecting");
      }
    };
    if (handlers.onNode) source.addEventListener("node", parse(handlers.onNode));
    if (handlers.onSession) source.addEventListener("session", parse(handlers.onSession));
    source.addEventListener("telemetry", parse(handlers.onTelemetry));
    source.addEventListener("event", parse(handlers.onEvent));
    source.addEventListener("config", parse(handlers.onConfig));
    source.addEventListener("status", parse(handlers.onStatus));
  };
  connect();

  return () => {
    disposed = true;
    clearTimeout(retry);
    source?.close();
  };
}
