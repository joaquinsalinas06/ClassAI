import { useQueries } from "@tanstack/react-query";
import { ArrowUpRight, CircleCheck, Clock, TriangleAlert, UsersRound, WifiOff, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { Link } from "react-router";
import { ComfortBar } from "../charts/ComfortBar";
import { ComfortRing } from "../charts/ComfortRing";
import { Sparkline } from "../charts/Sparkline";
import { Tooltip } from "../ui/Tooltip";
import { api, useRooms, useSessions } from "../lib/api";
import { SENSOR_METRICS, bandOf, comfortState, formatMetric, placement, placementText } from "../lib/comfort";
import { formatDate, formatDuration, formatNumber, formatRelative, formatTime, limaDayKey, parseTime } from "../lib/format";
import { toPoints, type Point } from "../lib/series";
import type { ComfortConfig, ComfortParams, CurrentClass, Room, SessionRow } from "../lib/types";
import { Badge, StateBadge } from "../ui/Badge";
import { Card, CardHeader } from "../ui/Card";
import { cn } from "../ui/cn";
import { EmptyState } from "../ui/EmptyState";
import { MetricIcon } from "../ui/icons";
import { PageHeader } from "../ui/PageHeader";
import { Skeleton } from "../ui/Skeleton";
import { SPRING } from "../ui/motion";

const TILE_LABEL = { temp_c: "Temp.", rh_pct: "Humedad", lux: "Luz", noise_rel: "Ruido" } as const;

function RoomTile({ room, current, config, index, trend }: { room: Room; current?: CurrentClass; config?: ComfortConfig; index: number; trend?: Point[] }) {
  const t = room.last_telemetry;
  const offline = room.status === "offline";
  const session = current?.session;
  const lastAt = t?.received_at ?? t?.ts;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING.gentle, delay: index * 0.05 }}>
      <Link
        to={`/aula/${room.id}`}
        className="group flex h-full flex-col rounded-lg border border-line bg-surface shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-sm"
      >
        <div className="flex items-start gap-4 p-4 pb-3">
          <ComfortRing value={t?.comfort} state={t?.state} offline={offline} size={60} />
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-heading text-fg">{room.name ?? room.id}</h2>
              <ArrowUpRight size={15} className="ml-auto shrink-0 text-faint transition-colors group-hover:text-fg" aria-hidden />
            </div>
            <p className="mt-0.5 truncate text-small text-muted">
              {offline
                ? `Sin conexión · ${formatRelative(lastAt)}`
                : session
                  ? `${session.course ?? "Clase"} · desde las ${formatTime(session.started_at)}`
                  : "Sin clase en curso"}
            </p>
            <div className="mt-2">
              <StateBadge size="sm" state={t?.state} offline={offline} />
            </div>
          </div>
        </div>
        <div className="px-4 pb-3">
          <div className="mb-1 flex items-center justify-between text-micro text-muted">
            <span>{session ? "Confort durante la clase" : "Confort"}</span>
            {session && <span className="num">{formatTime(session.started_at)} – ahora</span>}
          </div>
          {session && trend && trend.length > 1 ? (
            <Sparkline points={trend} band={config ? [config.ok_min, 100] : null} color="var(--ds-metric-comfort)" minSpan={30} height={34} live />
          ) : (
            <div className="flex h-[34px] items-center justify-center rounded-sm border border-dashed border-line text-caption text-muted">
              {offline ? "Nodo sin conexión" : session ? "Reuniendo lecturas de la clase…" : "Sin clase en curso"}
            </div>
          )}
        </div>
        <dl className={cn("grid grid-cols-4 border-t border-line-subtle", offline && "opacity-60")}>
          {SENSOR_METRICS.map((m, i) => {
            const value = t?.[m] as number | null | undefined;
            const where = placement(value, bandOf(m, config));
            return (
              <div key={m} className={cn("min-w-0 px-3 py-2.5", i > 0 && "border-l border-line-subtle")}>
                <dt className="flex items-center gap-1 text-micro text-muted">
                  <MetricIcon metric={m} size={12} />
                  <span className="truncate">{TILE_LABEL[m]}</span>
                </dt>
                <dd className="num mt-0.5 truncate text-label font-semibold text-fg" title={placementText(m, where)}>
                  {formatMetric(m, value, m !== "noise_rel")}
                  {(where === "high" || where === "low") && !offline && (
                    <span className="ml-1 inline-block size-1.5 -translate-y-px rounded-full bg-alert align-middle" aria-label={placementText(m, where)} />
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
        <div className="mt-auto flex items-center gap-3 border-t border-line-subtle px-4 py-2.5 text-caption text-muted">
          <span className="inline-flex items-center gap-1.5">
            <UsersRound size={13} aria-hidden />
            {session ? `${session.attendance_count} presentes` : !t ? "Sin lecturas en vivo" : t.presence ? "Hay presencia" : "Aula vacía"}
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <Clock size={13} aria-hidden />
            {formatRelative(lastAt)}
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

interface AlertItem {
  id: string;
  at: number;
  tone: "alert" | "regular" | "offline" | "ok";
  icon: LucideIcon;
  title: string;
  detail: string;
  to: string;
}

export function Overview() {
  const rooms = useRooms();
  const list = useMemo(() => rooms.data ?? [], [rooms.data]);
  const currents = useQueries({
    queries: list.map((r) => ({ queryKey: ["current", r.id], queryFn: () => api.current(r.id), refetchInterval: 15_000 })),
  });
  const params = useQueries({ queries: list.map((r) => ({ queryKey: ["params", r.id], queryFn: () => api.params(r.id) })) });
  const since = useMemo(() => new Date(Date.now() - 14 * 86_400_000).toISOString(), []);
  const recent = useSessions({ start: since, limit: 500 });
  const trends = useQueries({
    queries: list.map((r) => ({
      queryKey: ["series", r.current_session_id, "comfort", 2],
      queryFn: async () => {
        const res = await api.series(r.current_session_id!, "comfort", 2);
        return "data" in res ? res.data : [];
      },
      enabled: !!r.current_session_id,
      refetchInterval: 60_000,
    })),
  });

  const configFor = (id: string) => (params.find((p) => (p.data as ComfortParams | undefined)?.room === id)?.data as ComfortParams | undefined)?.current;
  const currentFor = (id: string) => currents.find((c) => c.data?.room === id)?.data;

  const alerts = useMemo<AlertItem[]>(() => {
    const items: AlertItem[] = [];
    for (const r of list) {
      const t = r.last_telemetry;
      const at = parseTime(t?.received_at ?? t?.ts) ?? Date.now();
      if (r.status === "offline") {
        items.push({ id: `off-${r.id}`, at, tone: "offline", icon: WifiOff, title: `${r.name ?? r.id} sin conexión`, detail: `Última lectura ${formatRelative(at)}`, to: `/aula/${r.id}` });
        continue;
      }
      const cfg = configFor(r.id);
      if (!t || !cfg) continue;
      const state = t.state ?? comfortState(cfg, t.comfort);
      if (state === "OK") continue;
      const off = SENSOR_METRICS.map((m) => ({ m, v: t[m] as number | null | undefined, band: bandOf(m, cfg) }))
        .filter((x) => placement(x.v, x.band) === "high" || placement(x.v, x.band) === "low");
      const detail = off.length
        ? off.map((x) => `${placementText(x.m, placement(x.v, x.band)).toLowerCase()} (${formatMetric(x.m, x.v)})`).join(", ")
        : `Confort ${t.comfort ?? "—"} de 100`;
      items.push({
        id: `now-${r.id}`, at, tone: state === "ALERT" ? "alert" : "regular", icon: TriangleAlert,
        title: `${r.name ?? r.id} ${state === "ALERT" ? "en alerta" : "en estado regular"} ahora`,
        detail: detail.charAt(0).toUpperCase() + detail.slice(1), to: `/aula/${r.id}`,
      });
    }
    const cutoff = Date.now() - 3 * 86_400_000;
    for (const s of recent.data?.data ?? []) {
      if (!s.alert_minutes || !s.ended_at || (parseTime(s.started_at) ?? 0) < cutoff) continue;
      items.push({
        id: s.session_id, at: parseTime(s.ended_at) ?? 0, tone: s.alert_minutes >= 10 ? "alert" : "regular", icon: Clock,
        title: `${s.course ?? "Clase"} en ${s.room.toUpperCase()}: ${formatDuration(s.alert_minutes)} en alerta`,
        detail: `Confort promedio ${s.comfort_avg != null ? Math.round(s.comfort_avg) : "—"} · terminó ${formatRelative(s.ended_at)}`,
        to: `/sesiones/${encodeURIComponent(s.session_id)}`,
      });
    }
    return items.sort((a, b) => b.at - a.at).slice(0, 8);
    // configFor reads `params`, which is in the deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, params.map((p) => p.dataUpdatedAt).join(), recent.data]);

  const today = limaDayKey(Date.now());
  const todays = (recent.data?.data ?? []).filter((s) => limaDayKey(s.started_at) === today);
  const online = list.filter((r) => r.status === "online").length;
  const alerting = list.filter((r) => r.status !== "offline" && r.last_telemetry?.state === "ALERT").length;

  return (
    <>
      <PageHeader
        title="Resumen"
        description="Cómo están las aulas en este momento y qué pasó en los últimos días."
        meta={
          rooms.data && (
            <>
              <Badge tone="neutral">{online} de {list.length} aulas en línea</Badge>
              {alerting > 0 ? <Badge tone="alert" icon={<TriangleAlert size={13} />}>{alerting} en alerta</Badge> : <Badge tone="ok" icon={<CircleCheck size={13} />}>Sin alertas activas</Badge>}
            </>
          )
        }
      />

      {rooms.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[214px] rounded-lg" />)}
        </div>
      ) : rooms.isError ? (
        <Card>
          <EmptyState illustration="plug" title="No se pudo cargar la lista de aulas" description={`${rooms.error.message}. Comprueba que el backend esté en marcha; se reintenta cada 5 s.`} />
        </Card>
      ) : list.length === 0 ? (
        <Card><EmptyState illustration="room" title="Aún no hay aulas" description="Las aulas aparecen cuando su nodo publica la primera lectura." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((r, i) => <RoomTile key={r.id} room={r} current={currentFor(r.id)} config={configFor(r.id)} index={i} trend={toPoints(trends[i]?.data)} />)}
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader title="Alertas" description="Lo que requiere atención, primero lo más reciente" />
          {recent.isPending && rooms.isPending ? (
            <div className="space-y-3 p-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : alerts.length === 0 ? (
            <EmptyState compact illustration="room" title="Todo en orden" description="Ninguna aula está fuera de rango y no hubo alertas en los últimos tres días." />
          ) : (
            <ul className="pb-2">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link to={a.to} className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-hover/60">
                    <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border", {
                      alert: "border-alert-border bg-alert-subtle text-alert-text",
                      regular: "border-regular-border bg-regular-subtle text-regular-text",
                      offline: "border-offline-border bg-offline-subtle text-offline-text",
                      ok: "border-ok-border bg-ok-subtle text-ok-text",
                    }[a.tone])}>
                      <a.icon size={14} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-label font-medium text-fg">{a.title}</span>
                      <span className="block truncate text-small text-muted">{a.detail}</span>
                    </span>
                    <time className="num shrink-0 pt-0.5 text-caption text-muted">{formatRelative(a.at)}</time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title="Clases de hoy" description="Confort promedio de cada clase" actions={<Link to="/sesiones" className="text-label font-medium text-link hover:underline">Ver todas</Link>} />
          {recent.isPending ? (
            <div className="space-y-3 p-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : todays.length === 0 ? (
            <EmptyState compact illustration="chart" title="Hoy no hubo clases todavía" description="Las clases aparecen al iniciarse en el nodo del aula." />
          ) : (
            <ul className="pb-2">
              {todays.map((s) => {
                const cfg = configFor(s.room);
                return (
                  <li key={s.session_id}>
                    <Link to={`/sesiones/${encodeURIComponent(s.session_id)}`} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-hover/60">
                      <span className="num w-11 shrink-0 text-small text-muted">{formatTime(s.started_at)}</span>
                      <span className="min-w-0 flex-1 truncate text-label text-fg">
                        {s.course ?? "Clase"} <span className="text-muted">· {s.room.toUpperCase()}</span>
                      </span>
                      {s.ended_at ? (
                        <ComfortBar value={s.comfort_avg} state={s.comfort_avg != null && cfg ? comfortState(cfg, s.comfort_avg) : null} okMin={cfg?.ok_min} width={56} />
                      ) : (
                        <Badge size="sm" tone="info">En curso</Badge>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      <WeekHeatmap rooms={list} sessions={recent.data?.data} loading={recent.isPending} />
    </>
  );
}

/** Rooms × last 14 days, cell = minute-weighted comfort average of that day's classes. Status colors carry an always-printed number. */
function WeekHeatmap({ rooms, sessions, loading }: { rooms: Room[]; sessions?: SessionRow[]; loading: boolean }) {
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => Date.now() - (13 - i) * 86_400_000), []);
  const cells = useMemo(() => {
    const map = new Map<string, { sum: number; minutes: number; count: number; alert: number }>();
    for (const s of sessions ?? []) {
      if (s.comfort_avg == null || !s.minutes) continue;
      const key = `${s.room}|${limaDayKey(s.started_at)}`;
      const c = map.get(key) ?? { sum: 0, minutes: 0, count: 0, alert: 0 };
      c.sum += s.comfort_avg * s.minutes;
      c.minutes += s.minutes;
      c.count++;
      c.alert += s.alert_minutes ?? 0;
      map.set(key, c);
    }
    return map;
  }, [sessions]);
  return (
    <Card className="mt-5">
      <CardHeader title="Confort por día" description="Promedio de las clases de cada aula en las últimas dos semanas" />
      {loading ? (
        <div className="p-4"><Skeleton className="h-28" /></div>
      ) : (
        <div className="overflow-x-auto px-4 pb-4">
          <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-1" aria-label="Confort promedio por aula y día">
            <thead>
              <tr>
                <th className="w-40" />
                {days.map((d) => (
                  <th key={d} scope="col" className="text-center text-micro font-medium text-muted">
                    {formatDate(d).split(" ").slice(0, 2).join(" ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="truncate pr-2 text-left text-small font-medium text-fg-2">{r.name ?? r.id}</th>
                  {days.map((d) => {
                    const c = cells.get(`${r.id}|${limaDayKey(d)}`);
                    if (!c) return <td key={d} className="h-9 rounded-sm bg-sunken/60" aria-label="Sin clases" />;
                    const avg = c.sum / c.minutes;
                    const tone = comfortState({ ok_min: 80, regular_min: 60 }, avg);
                    const k = tone === "OK" ? "ok" : tone === "REGULAR" ? "regular" : "alert";
                    return (
                      <Tooltip key={d} content={`${formatDate(d)} · ${c.count} ${c.count === 1 ? "clase" : "clases"} · ${c.alert ? `${formatDuration(c.alert)} en alerta` : "sin alertas"}`}>
                        <td
                          tabIndex={0}
                          className="num h-9 rounded-sm border text-center text-caption font-semibold"
                          style={{ background: `var(--ds-state-${k}-subtle)`, borderColor: `var(--ds-state-${k}-border)`, color: `var(--ds-state-${k}-text)` }}
                        >
                          {formatNumber(avg)}
                        </td>
                      </Tooltip>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
