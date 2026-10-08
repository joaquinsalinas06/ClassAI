import { Cpu, Fan, Flame, PersonStanding, Snowflake, SunDim, ThumbsUp, Volume2, WifiOff, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Link, useParams as useRouteParams } from "react-router";
import { useApp } from "../app/context";
import { roomName } from "../app/Shell";
import { Gauge } from "../charts/Gauge";
import { AttendanceList } from "../features/AttendanceList";
import { MetricTiles } from "../features/MetricTiles";
import { TrendPanel } from "../features/TrendPanel";
import { WhyRange } from "../features/WhyRange";
import { ApiError, useFeedback } from "../lib/api";
import { STATE_HINT, comfortState } from "../lib/comfort";
import { formatDuration, formatNumber, formatRelative, formatTime, parseTime, withUnit } from "../lib/format";
import type { ChartMetric, ComfortState, FeedbackKind } from "../lib/types";
import { Badge, StateBadge } from "../ui/Badge";
import { buttonClass } from "../ui/Button";
import { Card } from "../ui/Card";
import { cn } from "../ui/cn";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import { SPRING } from "../ui/motion";
import { useToast } from "../ui/Toast";

const FEEDBACK: { kind: FeedbackKind; label: string; icon: LucideIcon; thanks: string }[] = [
  { kind: "ok", label: "Todo bien", icon: ThumbsUp, thanks: "Se mantendrá el rango actual para esta clase." },
  { kind: "hot", label: "Calor", icon: Flame, thanks: "El rango de temperatura bajará un poco para esta clase." },
  { kind: "cold", label: "Frío", icon: Snowflake, thanks: "El rango de temperatura subirá un poco para esta clase." },
  { kind: "noisy", label: "Ruido", icon: Volume2, thanks: "El límite de ruido será más estricto." },
  { kind: "dark", label: "Poca luz", icon: SunDim, thanks: "Se pedirá más iluminación en esta aula." },
];

function useNow(interval = 1_000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

function FeedbackBar({ room, sessionId, disabled }: { room: string; sessionId: string | null; disabled?: boolean }) {
  const feedback = useFeedback(room);
  const toast = useToast();
  const [sent, setSent] = useState<FeedbackKind | null>(null);

  const send = (item: (typeof FEEDBACK)[number]) => {
    setSent(item.kind); // optimistic: confirm immediately, roll back on error
    feedback.mutate(
      { kind: item.kind, session_id: sessionId ?? undefined },
      {
        onSuccess: (result) => toast({ tone: "ok", title: "Reporte enviado", description: `${item.thanks} Nueva versión: v${result.config.params_version}.` }),
        onError: (error) => {
          setSent(null);
          toast({ tone: "alert", title: "No se envió el reporte", description: error instanceof ApiError ? error.message : "Revisa la conexión e inténtalo de nuevo." });
        },
        onSettled: () => setTimeout(() => setSent((k) => (k === item.kind ? null : k)), 2_400),
      },
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span id="fb-label" className="text-caption text-muted">¿Cómo se siente el aula?</span>
      <div role="group" aria-labelledby="fb-label" className="flex flex-wrap gap-1.5">
        {FEEDBACK.map((item) => {
          const active = sent === item.kind;
          return (
            <button
              key={item.kind}
              type="button"
              disabled={disabled || (feedback.isPending && !active)}
              onClick={() => send(item)}
              aria-pressed={active}
              className={cn(
                buttonClass("secondary", "md"),
                "relative overflow-hidden",
                active && "border-ok-border bg-ok-subtle text-ok-text hover:bg-ok-subtle",
              )}
            >
              <motion.span key={String(active)} initial={active ? { scale: 0.4, rotate: -20 } : false} animate={{ scale: 1, rotate: 0 }} transition={SPRING.snappy} className="inline-flex">
                <item.icon size={15} aria-hidden />
              </motion.span>
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ComfortPanel({ comfort, state, okMin, regularMin, offline, fanOn, presence, lastAt }: {
  comfort: number | null | undefined;
  state: ComfortState | null;
  okMin: number;
  regularMin: number;
  offline: boolean;
  fanOn: boolean;
  presence: boolean | number | null | undefined;
  lastAt: number | null;
}) {
  useNow(5_000);
  const key = offline ? "offline" : state === "OK" ? "ok" : state === "ALERT" ? "alert" : "regular";
  return (
    <Card className="relative flex flex-col overflow-hidden">
      {/* the one decorative gesture: a soft wash of the current state behind the gauge */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-56 transition-[background] duration-700"
        style={{ background: `radial-gradient(120% 90% at 50% 0%, var(--ds-state-${key}-subtle) 0%, transparent 70%)` }}
      />
      <div className="relative flex items-center justify-between px-4 pt-3.5">
        <h2 className="text-label font-semibold text-fg">Confort ahora</h2>
        <StateBadge state={state} offline={offline} />
      </div>
      <div className="relative flex justify-center pt-1">
        <Gauge value={comfort} state={state} okMin={okMin} regularMin={regularMin} offline={offline} size={232} />
      </div>
      <p className="relative -mt-3 px-6 text-center text-small text-muted">
        {offline ? "El nodo no está enviando datos. Se muestra la última lectura conocida." : state ? STATE_HINT[state] : "Esperando la primera lectura del nodo."}
      </p>
      <dl className="relative mt-4 grid grid-cols-2 border-t border-line-subtle">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <span className={cn("flex size-8 items-center justify-center rounded-md border", fanOn ? "border-info/30 bg-info-subtle text-info" : "border-line bg-sunken text-muted")}>
            <Fan size={16} className={fanOn && !offline ? "ds-spin" : undefined} aria-hidden />
          </span>
          <div className="min-w-0">
            <dt className="text-caption text-muted">Ventilador</dt>
            <dd className="text-label font-medium text-fg">{offline ? "Desconocido" : fanOn ? "Encendido" : "Apagado"}</dd>
          </div>
        </div>
        <div className="flex items-center gap-2.5 border-l border-line-subtle px-4 py-3">
          <span className={cn("flex size-8 items-center justify-center rounded-md border", presence ? "border-line bg-sunken text-presence" : "border-line bg-sunken text-muted")}>
            <PersonStanding size={16} aria-hidden />
          </span>
          <div className="min-w-0">
            <dt className="text-caption text-muted">Presencia</dt>
            <dd className="text-label font-medium text-fg">{presence == null ? "Sin dato" : presence ? "Detectada" : "Aula vacía"}</dd>
          </div>
        </div>
      </dl>
      <p className="relative border-t border-line-subtle px-4 py-2.5 text-caption text-muted">
        {lastAt ? `Última lectura ${formatRelative(lastAt)} · ${formatTime(lastAt, true)}` : "Sin lecturas todavía"}
        {!offline && " · ventilador estimado con la regla del nodo"}
      </p>
    </Card>
  );
}

function NodePanel({ device, uptimeMs, version, configVersion, irC, online }: {
  device?: string;
  uptimeMs?: number;
  version?: number | null;
  configVersion?: number;
  irC?: number | null;
  online: boolean;
}) {
  const rows: [string, string][] = [
    ["Dispositivo", device ?? "—"],
    ["Encendido hace", uptimeMs != null ? formatDuration(uptimeMs / 60_000) : "—"],
    ["Parámetros en uso", version != null ? `v${version}${configVersion != null && configVersion !== version ? ` (última v${configVersion})` : ""}` : "—"],
    ["Superficie (IR)", irC != null ? withUnit(formatNumber(irC, 1), "°C") : "—"],
  ];
  return (
    <Card>
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
        <Cpu size={16} className="text-muted" aria-hidden />
        <h2 className="flex-1 text-label font-semibold text-fg">Nodo del aula</h2>
        <Badge size="sm" tone={online ? "ok" : "offline"} icon={online ? undefined : <WifiOff size={12} aria-hidden />}>{online ? "En línea" : "Sin conexión"}</Badge>
      </div>
      <dl className="px-4 pb-3">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 border-b border-line-subtle py-2 last:border-b-0">
            <dt className="text-small text-muted">{k}</dt>
            <dd className={cn("num truncate text-small text-fg", k === "Dispositivo" && "font-mono text-[12.5px]")}>{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function LiveRoom() {
  const { room: routeRoom } = useRouteParams();
  const { room, rooms, live } = useApp();
  const { state, loading, current, params } = live;
  const [metric, setMetric] = useState<ChartMetric>("temp_c");
  const now = useNow(1_000);
  const roomInfo = rooms?.find((r) => r.id === room);

  if (routeRoom && routeRoom !== room) return null; // the shell syncs the selected room on the next tick

  const reading = state.latest ?? current.data?.latest_reading ?? null;
  const offline = state.node === "offline" || (state.node === "unknown" && roomInfo?.status === "offline");
  const config = state.config ?? params.data?.current ?? null;
  const comfort = reading?.comfort ?? null;
  const stateNow: ComfortState | null = reading?.state ?? (comfort != null && config ? comfortState(config, comfort) : null);
  const lastAt = state.lastAt ?? parseTime(current.data?.latest_reading?.received_at);
  const session = current.data?.session;
  const startedAt = state.startedAt ?? parseTime(session?.started_at);
  const inSession = !!state.sessionId;

  const readings: Partial<Record<ChartMetric, number | null | undefined>> = {
    temp_c: reading?.temp_c, rh_pct: reading?.rh_pct, lux: reading?.lux, noise_rel: reading?.noise_rel, comfort,
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-title text-fg">{roomName(rooms, room)}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-small text-muted">
            {inSession ? (
              <>
                <Badge tone="info">{state.course ?? session?.course ?? "Clase sin curso"}</Badge>
                <span>
                  En curso desde las <span className="num text-fg-2">{formatTime(startedAt)}</span> ·{" "}
                  <span className="num text-fg-2">{startedAt ? formatDuration((now - startedAt) / 60_000) : "—"}</span>
                </span>
                <span className="hidden font-mono text-caption text-faint md:inline">{state.sessionId}</span>
              </>
            ) : (
              <span>{offline ? "Nodo sin conexión" : "No hay clase en curso. Las lecturas siguen llegando en vivo."}</span>
            )}
          </div>
        </div>
        <FeedbackBar room={room} sessionId={state.sessionId} disabled={offline} />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-5 xl:col-span-4">
          <ComfortPanel
            comfort={comfort}
            state={stateNow}
            okMin={config?.ok_min ?? 80}
            regularMin={config?.regular_min ?? 60}
            offline={offline}
            fanOn={state.fan.on}
            presence={reading?.presence}
            lastAt={lastAt}
          />
        </div>
        <div className="lg:col-span-7 xl:col-span-8">
          <ErrorBoundary label="las métricas">
            <MetricTiles
              readings={readings}
              points={state.points}
              config={config}
              live={!offline}
              stale={offline}
              loading={current.isPending}
              selected={metric}
              onSelect={setMetric}
            />
          </ErrorBoundary>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-8">
          <ErrorBoundary label="el gráfico">
            <TrendPanel
              title={inSession ? "Tendencia de la clase" : "Lecturas recientes"}
              description={inSession ? "Promedio por minuto desde el inicio, más lecturas en vivo" : "Desde que abriste esta página"}
              points={state.points}
              config={config}
              metric={metric}
              onMetric={setMetric}
              live={!offline}
              loading={loading && state.points[metric].length < 2}
              xExtent={inSession && startedAt ? [startedAt, Math.max(now, lastAt ?? 0)] : undefined}
              emptyHint={offline ? "El nodo está sin conexión." : undefined}
            />
          </ErrorBoundary>
          <ErrorBoundary label="la explicación del rango">
            <WhyRange config={config} history={params.data?.history ?? []} nodeVersion={reading?.params_version} loading={params.isPending} />
          </ErrorBoundary>
        </div>
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-4">
          <ErrorBoundary label="la asistencia">
            {inSession || state.arrivals.length > 0 ? (
              <AttendanceList arrivals={state.arrivals} rejections={state.rejections} startedAt={startedAt} endAt={now} loading={current.isPending} />
            ) : (
              <Card className="p-4">
                <h2 className="text-label font-semibold text-fg">Asistencia</h2>
                <p className="mt-1 text-small text-muted">La lista se abre cuando el docente inicia la clase en el nodo.</p>
                <Link to={`/sesiones?room=${room}`} className={cn(buttonClass("secondary", "sm"), "mt-3")}>Ver clases anteriores</Link>
              </Card>
            )}
          </ErrorBoundary>
          <NodePanel
            device={state.latest?.device ?? `esp32-${room}`}
            uptimeMs={state.latest?.uptime_ms}
            version={reading?.params_version}
            configVersion={config?.params_version}
            irC={reading?.ir_object_c}
            online={!offline && state.node === "online"}
          />
        </div>
      </div>
    </div>
  );
}
