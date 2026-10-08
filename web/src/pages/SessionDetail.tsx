import { useQueries } from "@tanstack/react-query";
import { ArrowLeft, GitCompareArrows, Radio } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams as useRouteParams } from "react-router";
import { ComfortRing } from "../charts/ComfortRing";
import { AttendanceList } from "../features/AttendanceList";
import { TrendPanel } from "../features/TrendPanel";
import { api, useAttendance, useCompare, useParams, useSessions, useSummary } from "../lib/api";
import { CHART_METRICS, comfortState } from "../lib/comfort";
import { formatDate, formatDateLong, formatDelta, formatDuration, formatNumber, formatPercent, formatTime, parseTime, withUnit } from "../lib/format";
import type { Arrival } from "../lib/live";
import { toPoints, type Point } from "../lib/series";
import type { ChartMetric, SummaryRow } from "../lib/types";
import { Badge, StateBadge } from "../ui/Badge";
import { buttonClass } from "../ui/Button";
import { Card, CardHeader } from "../ui/Card";
import { cn } from "../ui/cn";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import { Table, Td, Th } from "../ui/Table";

const BUCKET = 2;

function useSessionPoints(id: string | undefined) {
  const results = useQueries({
    queries: CHART_METRICS.map((metric) => ({
      queryKey: ["series", id, metric, BUCKET],
      queryFn: async () => {
        const r = await api.series(id!, metric, BUCKET);
        return "data" in r ? r.data : [];
      },
      enabled: !!id,
      staleTime: 5 * 60_000,
    })),
  });
  const key = results.map((r) => r.dataUpdatedAt).join();
  const points = useMemo(
    () => Object.fromEntries(CHART_METRICS.map((m, i) => [m, toPoints(results[i]?.data)])) as Record<ChartMetric, Point[]>,
    // results identity changes every render; key captures data changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return { points, loading: results.some((r) => r.isPending && !!id) };
}

const COMPARE_ROWS: { label: string; key: keyof SummaryRow; decimals: number; unit: string; better?: "up" | "down" }[] = [
  { label: "Confort medio", key: "comfort_avg", decimals: 0, unit: "", better: "up" },
  { label: "Confort mínimo", key: "comfort_min", decimals: 0, unit: "", better: "up" },
  { label: "Minutos en alerta", key: "alert_minutes", decimals: 0, unit: "min", better: "down" },
  { label: "Temperatura media", key: "temp_avg", decimals: 1, unit: "°C" },
  { label: "Humedad media", key: "rh_avg", decimals: 0, unit: "%" },
  { label: "Luz media", key: "lux_avg", decimals: 0, unit: "lx" },
  { label: "Ruido medio", key: "noise_avg", decimals: 2, unit: "rel." },
  { label: "Asistencia", key: "attendance_count", decimals: 0, unit: "" },
];

export function SessionDetail() {
  const { id } = useRouteParams();
  const summary = useSummary(id);
  const s = summary.data;
  const found = s?.found ? s : null;
  const room = found?.room;
  const course = found?.course ?? undefined;
  const params = useParams(room);
  const attendance = useAttendance(id);
  const { points, loading } = useSessionPoints(id);
  const [metric, setMetric] = useState<ChartMetric>("comfort");
  const peers = useSessions({ course, limit: 40 });
  const [compareId, setCompareId] = useState<string>("");
  const compare = useSessionPoints(compareId || undefined);
  const compareSummary = useCompare(compareId && id ? [id, compareId] : []);

  if (summary.isPending) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-14 w-80" />
        <Skeleton className="h-28" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (!found) {
    return (
      <EmptyState
        illustration="chart"
        title="Esta sesión no existe"
        description={summary.isError ? summary.error.message : "Puede que el identificador esté mal escrito."}
        action={<Link to="/sesiones" className={buttonClass("secondary", "sm")}>Volver a sesiones</Link>}
      />
    );
  }

  const finished = found.status === "finalizada" ? found : null;
  const startedAt = parseTime(found.started_at)!;
  const endedAt = parseTime(found.ended_at) ?? Date.now();
  const config = params.data?.history.find((h) => h.params_version === found.params_version)?.config ?? params.data?.current ?? null;
  const comfortAvg = finished?.comfort_avg ?? null;

  const arrivals: Arrival[] = (attendance.data?.data ?? [])
    .map((a) => ({ id: a.code, code: a.code, full_name: a.full_name, credential_type: a.credential_type, at: parseTime(a.recorded_at) ?? 0, live: false }))
    .sort((a, b) => a.at - b.at);

  const peerOptions = (peers.data?.data ?? []).filter((p) => p.session_id !== id && p.ended_at);
  const comparePeer = peerOptions.find((p) => p.session_id === compareId);
  const compareStart = parseTime(comparePeer?.started_at);
  const shifted = compareStart != null
    ? (Object.fromEntries(CHART_METRICS.map((m) => [m, compare.points[m].map((p) => ({ t: p.t - compareStart + startedAt, v: p.v }))])) as Record<ChartMetric, Point[]>)
    : null;
  const thisRow = compareSummary.data?.data.find((r) => r.session_id === id);
  const otherRow = compareSummary.data?.data.find((r) => r.session_id === compareId);

  const stats: [string, string, string?][] = finished
    ? [
        ["Asistencia", formatNumber(finished.attendance_count), "estudiantes"],
        ["Temperatura", withUnit(formatNumber(finished.temp_avg, 1), "°C"), `${formatNumber(finished.temp_min, 1)}–${formatNumber(finished.temp_max, 1)} °C`],
        ["Humedad", withUnit(formatNumber(finished.rh_avg), "%"), "promedio"],
        ["Luz", withUnit(formatNumber(finished.lux_avg), "lx"), "promedio"],
        ["Ruido", formatNumber(finished.noise_avg, 2), finished.noise_high_minutes ? `${formatDuration(finished.noise_high_minutes)} sobre el límite` : "siempre bajo el límite"],
        ["Presencia", formatPercent(finished.presence_ratio), "del tiempo"],
      ]
    : [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/sesiones" className="mb-3 inline-flex items-center gap-1.5 text-label text-muted hover:text-fg">
          <ArrowLeft size={14} aria-hidden /> Sesiones
        </Link>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-title text-fg">{found.course ?? "Clase sin curso"} <span className="text-muted">en {found.room.toUpperCase()}</span></h1>
            <p className="mt-1 text-body text-muted">
              {formatDateLong(startedAt)} · <span className="num">{formatTime(startedAt)}–{finished ? formatTime(endedAt) : "ahora"}</span>
              {finished && <> · {formatDuration(finished.minutes)}</>}
            </p>
            <p className="mt-1 font-mono text-caption text-muted">{id}</p>
          </div>
          {finished ? (
            <Badge tone="neutral">Finalizada · parámetros v{found.params_version ?? "—"}</Badge>
          ) : (
            <Link to={`/aula/${found.room}`} className={buttonClass("primary")}>
              <Radio size={15} aria-hidden /> Ver en vivo
            </Link>
          )}
        </div>
      </div>

      {finished && (
        <Card className="grid grid-cols-2 gap-px overflow-hidden bg-line-subtle md:grid-cols-3 xl:grid-cols-[1.7fr_repeat(6,1fr)]">
          <div className="col-span-2 flex items-center gap-4 bg-surface p-4 md:col-span-3 xl:col-span-1">
            <ComfortRing value={comfortAvg != null ? Math.round(comfortAvg) : null} state={comfortAvg != null ? comfortState(config ?? { ok_min: 80, regular_min: 60 }, comfortAvg) : null} size={64} />
            <div>
              <p className="text-caption text-muted">Confort medio</p>
              <StateBadge size="sm" className="mt-1" state={comfortAvg != null ? comfortState(config ?? { ok_min: 80, regular_min: 60 }, comfortAvg) : null} />
              <p className="mt-1 text-caption text-muted">
                {finished.alert_minutes ? `${formatDuration(finished.alert_minutes)} en alerta` : "Sin minutos en alerta"}
              </p>
            </div>
          </div>
          {stats.map(([label, value, hint]) => (
            <div key={label} className="bg-surface p-4">
              <p className="text-caption text-muted">{label}</p>
              <p className="num mt-1 text-heading font-semibold text-fg">{value}</p>
              {hint && <p className="mt-0.5 truncate text-caption text-muted">{hint}</p>}
            </div>
          ))}
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-8">
          <TrendPanel
            title="Cómo evolucionó la clase"
            description={`Promedio cada ${BUCKET} minutos${comparePeer ? "; la comparación se alinea por minuto de clase" : ""}`}
            points={points}
            config={config}
            metric={metric}
            onMetric={setMetric}
            loading={loading}
            xExtent={[startedAt, endedAt]}
            compare={shifted && comparePeer ? { points: shifted, label: `${formatDate(comparePeer.started_at)} ${formatTime(comparePeer.started_at)}` } : null}
          />

          <Card>
            <CardHeader
              icon={<GitCompareArrows size={16} />}
              title="Comparar con otra clase"
              description={course ? `Clases anteriores de ${course}` : "Clases anteriores"}
              actions={
                <select
                  aria-label="Sesión para comparar"
                  value={compareId}
                  onChange={(e) => setCompareId(e.target.value)}
                  className="h-8 max-w-[220px] rounded-md border border-line bg-surface px-2 text-label text-fg shadow-xs outline-none hover:border-line-strong"
                >
                  <option value="">Elegir sesión…</option>
                  {peerOptions.map((p) => (
                    <option key={p.session_id} value={p.session_id}>
                      {formatDate(p.started_at)} {formatTime(p.started_at)} · {p.room.toUpperCase()}
                    </option>
                  ))}
                </select>
              }
            />
            {!compareId ? (
              <p className="px-4 pb-4 text-small text-muted">Elige una sesión para ver su curva punteada en el gráfico y las diferencias aquí.</p>
            ) : compareSummary.isPending ? (
              <div className="space-y-2 px-4 pb-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-7" />)}</div>
            ) : thisRow && otherRow ? (
              <Table aria-label="Comparación">
                <thead>
                  <tr>
                    <Th>Indicador</Th>
                    <Th className="text-right">Esta clase</Th>
                    <Th className="text-right">{formatDate(otherRow.started_at)}</Th>
                    <Th className="text-right">Diferencia</Th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map((row) => {
                    const a = thisRow[row.key] as number | null;
                    const b = otherRow[row.key] as number | null;
                    const d = a != null && b != null ? a - b : null;
                    const good = d == null || !row.better || Math.abs(d) < 10 ** -row.decimals ? null : (row.better === "up") === d > 0;
                    const fmt = (v: number | null) => (v == null ? "—" : row.unit ? withUnit(formatNumber(v, row.decimals), row.unit) : formatNumber(v, row.decimals));
                    return (
                      <tr key={row.key}>
                        <Td>{row.label}</Td>
                        <Td className="num text-right text-fg">{fmt(a)}</Td>
                        <Td className="num text-right">{fmt(b)}</Td>
                        <Td className={cn("num text-right font-medium", good === true && "text-ok-text", good === false && "text-alert-text")}>
                          {d == null ? "—" : formatDelta(d, row.decimals)}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            ) : (
              <p className="px-4 pb-4 text-small text-muted">Solo se pueden comparar clases finalizadas.</p>
            )}
          </Card>
        </div>
        <div className="lg:col-span-4">
          <AttendanceList arrivals={arrivals} startedAt={startedAt} endAt={endedAt} loading={attendance.isPending} maxHeight={640} emptyText="Nadie registró asistencia en esta clase." />
        </div>
      </div>
    </div>
  );
}
