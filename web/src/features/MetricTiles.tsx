import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { METRICS, SENSOR_METRICS, bandOf, placement, placementText } from "../lib/comfort";
import { formatDelta, formatNumber } from "../lib/format";
import { deltaOver, type Point } from "../lib/series";
import type { ChartMetric, ComfortConfig } from "../lib/types";
import { Sparkline } from "../charts/Sparkline";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { Badge } from "../ui/Badge";
import { cn } from "../ui/cn";
import { MetricIcon } from "../ui/icons";
import { Skeleton } from "../ui/Skeleton";

const WINDOW = 30 * 60_000;
const DELTA_WINDOW = 5 * 60_000;

export function MetricTile({ metric, value, points, config, live, stale, onSelect, selected }: {
  metric: ChartMetric;
  value: number | null | undefined;
  points: Point[];
  config: ComfortConfig | null;
  live?: boolean;
  stale?: boolean;
  onSelect?: () => void;
  selected?: boolean;
}) {
  const meta = METRICS[metric];
  const band = bandOf(metric, config);
  const where = placement(value, band, meta.decimals);
  const delta = deltaOver(points, DELTA_WINDOW);
  const tone = where === "in" ? "ok" : where === "unknown" ? "neutral" : "alert";
  const step = 10 ** -meta.decimals;
  const DeltaIcon = delta == null || Math.abs(delta) < step ? ArrowRight : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${meta.label}: ${formatNumber(value, meta.decimals)} ${meta.unit}. ${placementText(metric, where)}. Ver en el gráfico`}
      className={cn(
        "group relative flex min-w-0 flex-col justify-between gap-3 bg-surface p-4 text-left transition-colors duration-100 hover:bg-hover",
        selected && "bg-raised",
      )}
    >
      {selected && <span className="absolute inset-x-4 top-0 h-0.5 rounded-b-full" style={{ background: meta.color }} aria-hidden />}
      <div className="flex items-center gap-2">
        <MetricIcon metric={metric} size={16} className="text-muted" />
        <span className="flex-1 truncate text-label font-medium text-fg-2">{meta.short}</span>
        <Badge size="sm" tone={stale ? "offline" : tone}>{stale ? "Última lectura" : placementText(metric, where)}</Badge>
      </div>
      <div className="flex items-baseline gap-1.5">
        <AnimatedNumber
          value={value}
          format={(n) => formatNumber(n, meta.decimals)}
          className={cn("text-metric text-fg", stale && "text-fg-2")}
        />
        <span className="text-label text-muted">{meta.unit}</span>
      </div>
      <Sparkline points={points} band={band} color={meta.color} minSpan={meta.minSpan} live={live && !stale} windowMs={WINDOW} />
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

export function MetricTiles({ readings, points, config, live, stale, loading, selected, onSelect }: {
  readings: Partial<Record<ChartMetric, number | null | undefined>>;
  points: Record<ChartMetric, Point[]>;
  config: ComfortConfig | null;
  live?: boolean;
  stale?: boolean;
  loading?: boolean;
  selected?: ChartMetric;
  onSelect?: (metric: ChartMetric) => void;
}) {
  return (
    <div className="grid h-full grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line-subtle shadow-xs sm:grid-cols-2">
      {SENSOR_METRICS.map((metric) =>
        loading ? (
          <div key={metric} className="flex flex-col gap-3 bg-surface p-4">
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
            points={points[metric]}
            config={config}
            live={live}
            stale={stale}
            selected={selected === metric}
            onSelect={onSelect ? () => onSelect(metric) : undefined}
          />
        ),
      )}
    </div>
  );
}
