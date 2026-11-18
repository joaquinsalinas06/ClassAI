import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { METRICS, SENSOR_METRICS, bandOf, formatMetric, placement, placementText } from "../lib/comfort";
import { formatDelta, formatNumber } from "../lib/format";
import { deltaOver, type Point } from "../lib/series";
import type { ComfortConfig, TrendMetric } from "../lib/types";
import type { ZoneLine } from "../lib/zones";
import { Sparkline } from "../charts/Sparkline";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { Badge } from "../ui/Badge";
import { cn } from "../ui/cn";
import { MetricIcon } from "../ui/icons";
import { Skeleton } from "../ui/Skeleton";

const WINDOW = 30 * 60_000;
const DELTA_WINDOW = 5 * 60_000;

export function MetricTile({ metric, value, points, lines, config, live, stale, onSelect, selected, className }: {
  metric: TrendMetric;
  value: number | null | undefined;
  points: Point[];
  /** One line per node; `points`/`value` are then their average (drawn thicker). */
  lines?: (ZoneLine & { offline?: boolean })[];
  config: ComfortConfig | null;
  live?: boolean;
  stale?: boolean;
  onSelect?: () => void;
  selected?: boolean;
  className?: string;
}) {
  const meta = METRICS[metric];
  const band = bandOf(metric, config);
  const where = placement(value, band, meta.decimals);
  const delta = deltaOver(points, DELTA_WINDOW);
  const tone = where === "in" ? "ok" : where === "unknown" ? "neutral" : "alert";
  const status = stale ? "Última lectura" : !band && meta.note && value != null ? meta.note : placementText(metric, where);
  const multi = (lines?.length ?? 0) > 1;
  const step = 10 ** -meta.decimals;
  const DeltaIcon = delta == null || Math.abs(delta) < step ? ArrowRight : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${meta.label}${multi ? " (promedio)" : ""}: ${formatNumber(value, meta.decimals)} ${meta.unit}. ${status}. Ver en el gráfico`}
      className={cn(
        "group relative flex min-w-0 flex-col justify-between gap-3 bg-surface p-4 text-left transition-colors duration-100 hover:bg-hover",
        selected && "bg-raised",
        className,
      )}
    >
      {selected && <span className="absolute inset-x-4 top-0 h-0.5 rounded-b-full" style={{ background: meta.color }} aria-hidden />}
      <div className="flex items-center gap-2">
        <MetricIcon metric={metric} size={16} className="text-muted" />
        <span className="flex-1 truncate text-label font-medium text-fg-2">{meta.short}</span>
        <Badge size="sm" tone={stale ? "offline" : tone}>{status}</Badge>
      </div>
      <div className="flex items-baseline gap-1.5">
        <AnimatedNumber
          value={value}
          format={(n) => formatNumber(n, meta.decimals)}
          className={cn("text-metric text-fg", stale && "text-fg-2")}
        />
        <span className="text-label text-muted">{meta.unit}</span>
      </div>
      <Sparkline points={points} extras={multi ? lines : undefined} band={band} color={meta.color} minSpan={meta.minSpan} live={live && !stale} windowMs={WINDOW} />
      {lines && lines.length > 0 && (
        <ul className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-muted" aria-label="Leyenda">
          {lines.map((l) => (
            <li key={l.role} className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full" style={{ background: multi ? l.color : meta.color }} aria-hidden />
              {l.label}
              <span className="num text-fg-2">{formatMetric(metric, l.points[l.points.length - 1]?.v)}</span>
              {l.offline && <span className="rounded-sm bg-sunken px-1 text-[11px] text-faint">sin conexión</span>}
            </li>
          ))}
          {multi && (
            <li className="flex items-center gap-1.5 font-medium text-fg-2">
              <span className="h-[3px] w-3 rounded-full" style={{ background: meta.color }} aria-hidden />
              Promedio
            </li>
          )}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2 text-caption text-muted">
        <span className="num inline-flex items-center gap-1">
          <DeltaIcon size={13} aria-hidden />
          {delta == null ? "Sin variación reciente" : `${formatDelta(delta, meta.decimals)} en 5 min`}
        </span>
        {band && (
          <span className="num truncate">
            {metric === "noise_rel" ? `máx. ${formatNumber(band[1], 2)}` : `${formatNumber(band[0], meta.decimals)}–${formatNumber(band[1], meta.decimals)}`}
          </span>
        )}
      </div>
    </button>
  );
}

export function MetricTiles({ metrics = SENSOR_METRICS, extraTile, readings, points, lines, className, tileClass, config, live, stale, loading, selected, onSelect }: {
  metrics?: readonly TrendMetric[];
  extraTile?: ReactNode;
  readings: Partial<Record<TrendMetric, number | null | undefined>>;
  points: Partial<Record<TrendMetric, Point[]>>;
  lines?: Partial<Record<TrendMetric, (ZoneLine & { offline?: boolean })[]>>;
  className?: string;
  tileClass?: (metric: TrendMetric) => string | undefined;
  config: ComfortConfig | null;
  live?: boolean;
  stale?: boolean;
  loading?: boolean;
  selected?: TrendMetric;
  onSelect?: (metric: TrendMetric) => void;
}) {
  return (
    <div className={cn("grid h-full grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line-subtle shadow-xs sm:grid-cols-2", className)}>
      {metrics.map((metric) =>
        loading ? (
          <div key={metric} className={cn("flex flex-col gap-3 bg-surface p-4", tileClass?.(metric))}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-3 w-32" />
          </div>
        ) : (
          <MetricTile
            key={metric}
            metric={metric}
            value={readings[metric]}
            points={points[metric] ?? []}
            lines={lines?.[metric]}
            className={tileClass?.(metric)}
            config={config}
            live={live}
            stale={stale}
            selected={selected === metric}
            onSelect={onSelect ? () => onSelect(metric) : undefined}
          />
        ),
      )}
      {extraTile}
    </div>
  );
}
