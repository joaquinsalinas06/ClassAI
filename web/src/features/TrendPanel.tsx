import { Table2, ChartSpline } from "lucide-react";
import { useMemo, useState } from "react";
import { CHART_METRICS, METRICS, bandOf, formatMetric, placement, placementText } from "../lib/comfort";
import { formatDuration, formatTime } from "../lib/format";
import { excursions, extremes, type Point } from "../lib/series";
import type { ChartMetric, ComfortConfig } from "../lib/types";
import { TimeSeries } from "../charts/TimeSeries";
import { Card, CardHeader } from "../ui/Card";
import { cn } from "../ui/cn";
import { EmptyState } from "../ui/EmptyState";
import { MetricIcon } from "../ui/icons";
import { IconButton } from "../ui/Button";
import { Tabs } from "../ui/Tabs";
import { Table, Td, Th } from "../ui/Table";

function outOfRangeMinutes(points: Point[], band: [number, number] | null) {
  if (points.length < 2) return 0;
  const gaps = points.slice(1).map((p, i) => p.t - points[i]!.t).sort((a, b) => a - b);
  const spacing = gaps[Math.floor(gaps.length / 2)] ?? 60_000;
  return excursions(points, band).reduce((sum, r) => sum + (r.end - r.start + spacing), 0) / 60_000;
}

export function TrendPanel({ title, description, points, config, metric, onMetric, live, xExtent, compare, loading, height = 300, emptyHint }: {
  title: string;
  description?: string;
  points: Record<ChartMetric, Point[]>;
  config: ComfortConfig | null;
  metric: ChartMetric;
  onMetric: (metric: ChartMetric) => void;
  live?: boolean;
  xExtent?: [number, number];
  compare?: { points: Record<ChartMetric, Point[]>; label: string } | null;
  loading?: boolean;
  height?: number;
  emptyHint?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  const meta = METRICS[metric];
  const band = bandOf(metric, config);
  const data = points[metric];
  const stats = useMemo(() => {
    const ext = extremes(data);
    const avg = data.length ? data.reduce((s, p) => s + p.v, 0) / data.length : null;
    return { ext, avg, outside: outOfRangeMinutes(data, band) };
  }, [data, band]);

  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        actions={
          <IconButton label={asTable ? "Ver gráfico" : "Ver tabla de datos"} size="sm" onClick={() => setAsTable((v) => !v)}>
            {asTable ? <ChartSpline size={15} /> : <Table2 size={15} />}
          </IconButton>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-1">
        <Tabs
          label="Métrica"
          size="sm"
          value={metric}
          onChange={onMetric}
          items={CHART_METRICS.map((m) => ({ value: m, label: METRICS[m].short, icon: <MetricIcon metric={m} size={13} /> }))}
        />
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted" aria-label="Leyenda">
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: meta.color }} aria-hidden />
            {meta.short}
          </li>
          {compare && (
            <li className="flex items-center gap-1.5">
              <span className="w-3.5 border-t-2 border-dashed border-[var(--ds-chart-compare)]" aria-hidden />
              {compare.label}
            </li>
          )}
          {band && (
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-3.5 rounded-[3px] border border-dashed border-[var(--ds-chart-band-edge)] bg-[var(--ds-chart-band)]" aria-hidden />
              Rango objetivo
            </li>
          )}
          {band && (
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-3.5 rounded-[3px] bg-[var(--ds-chart-out)] shadow-[inset_0_2px_0_var(--ds-state-alert-solid)]" aria-hidden />
              Fuera de rango
            </li>
          )}
        </ul>
      </div>

      <div className="px-2 pt-2 pb-1 sm:px-3">
        {loading ? (
          <div style={{ height }} className="ds-skeleton mx-2 rounded-md" aria-hidden />
        ) : data.length < 2 ? (
          <div style={{ height }} className="flex items-center justify-center">
            <EmptyState compact illustration="chart" title="Aún no hay suficientes lecturas" description={emptyHint ?? "La curva aparecerá con las próximas lecturas del nodo."} />
          </div>
        ) : asTable ? (
          <div className="max-h-[300px] overflow-y-auto" style={{ height }}>
            <Table aria-label={`${meta.label}: valores`}>
              <thead>
                <tr>
                  <Th>Hora</Th>
                  <Th className="text-right">{meta.short}</Th>
                  {band && <Th>Estado</Th>}
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map((p) => (
                  <tr key={p.t}>
                    <Td className="num">{formatTime(p.t, true)}</Td>
                    <Td className="num text-right text-fg">{formatMetric(metric, p.v)}</Td>
                    {band && <Td>{placementText(metric, placement(p.v, band))}</Td>}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <TimeSeries
            points={data}
            metric={meta}
            band={band}
            live={live}
            height={height}
            xExtent={xExtent}
            clamp={metric === "comfort" ? [0, 100] : metric === "noise_rel" ? [0, 1] : undefined}
            thresholds={metric === "comfort" && config ? [{ value: config.regular_min, label: `Alerta bajo ${config.regular_min}` }] : undefined}
            compare={compare ? { points: compare.points[metric], label: compare.label } : null}
          />
        )}
      </div>

      <dl className="grid grid-cols-2 border-t border-line-subtle sm:grid-cols-4">
        {[
          ["Mínimo", stats.ext ? formatMetric(metric, stats.ext.min.v) : "—"],
          ["Máximo", stats.ext ? formatMetric(metric, stats.ext.max.v) : "—"],
          ["Promedio", formatMetric(metric, stats.avg)],
          ["Fuera de rango", band ? (stats.outside > 0 ? formatDuration(stats.outside) : "Nunca") : "—"],
        ].map(([label, value], i) => (
          <div key={label} className={cn("px-4 py-3", i > 0 && "sm:border-l", i % 2 === 1 && "border-l", i > 1 && "max-sm:border-t", "border-line-subtle")}>
            <dt className="text-caption text-muted">{label}</dt>
            <dd className={cn("num mt-0.5 text-label font-semibold text-fg", label === "Fuera de rango" && stats.outside > 0 && "text-alert-text")}>{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
