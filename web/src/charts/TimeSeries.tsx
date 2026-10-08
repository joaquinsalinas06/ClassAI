import { bisector } from "d3-array";
import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { animate, AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { MetricMeta } from "../lib/comfort";
import { formatMetric, placement, placementText } from "../lib/comfort";
import { formatNumber, formatTime } from "../lib/format";
import { annotations, excursions, yDomain, type Point } from "../lib/series";
import { cn } from "../ui/cn";
import { DURATION, EASE } from "../ui/motion";
import { useSize } from "./useSize";

const M = { top: 18, right: 18, bottom: 26, left: 44 };
const MINUTE = 60_000;
const X_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 240, 480].map((m) => m * MINUTE);
const bisect = bisector<Point, number>((p) => p.t).center;

/** Tween a numeric tuple toward its target (domain glide when new points arrive). */
function useTweened(target: number[], enabled: boolean) {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  const targetRef = useRef(target);
  targetRef.current = target;
  const key = target.map((v) => v.toFixed(6)).join("|");
  useEffect(() => {
    const from = current.current;
    const to = targetRef.current;
    if (!enabled || from.length !== to.length) {
      current.current = to;
      setValue(to);
      return;
    }
    const controls = animate(0, 1, {
      duration: DURATION.update,
      ease: EASE.standard,
      onUpdate: (k) => {
        const next = from.map((f, i) => f + (to[i]! - f) * k);
        current.current = next;
        setValue(next);
      },
    });
    return () => controls.stop();
  }, [key, enabled]);
  return value;
}

export interface TimeSeriesProps {
  points: Point[];
  metric: MetricMeta;
  band: [number, number] | null;
  height?: number;
  live?: boolean;
  compare?: { points: Point[]; label: string } | null;
  thresholds?: { value: number; label: string }[];
  clamp?: [number, number];
  /** Fixed x extent (e.g. the whole session). Defaults to the data extent. */
  xExtent?: [number, number];
  className?: string;
}

export function TimeSeries({ points, metric, band, height = 280, live, compare, thresholds, clamp, xExtent, className }: TimeSeriesProps) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const reduce = useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);

  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = height - M.top - M.bottom;
  const hasData = points.length > 1;

  const target = useMemo(() => {
    const values = [...points.map((p) => p.v), ...(compare?.points.map((p) => p.v) ?? [])];
    const [y0, y1] = yDomain(values, band, metric.minSpan, clamp);
    const x0 = xExtent?.[0] ?? points[0]?.t ?? 0;
    const x1 = Math.max(xExtent?.[1] ?? 0, points[points.length - 1]?.t ?? 1, compare?.points[compare.points.length - 1]?.t ?? 0);
    return [x0, x1 > x0 ? x1 : x0 + MINUTE, y0, y1];
  }, [points, compare, band, metric.minSpan, clamp, xExtent]);
  const [dx0, dx1, dy0, dy1] = useTweened(target, !!live && !reduce && hasData) as [number, number, number, number];

  const x = scaleLinear().domain([dx0, dx1]).range([0, innerW]);
  const y = scaleLinear().domain([dy0, dy1]).range([innerH, 0]);
  const linePath = line<Point>().x((p) => x(p.t)).y((p) => y(p.v)).curve(curveMonotoneX);
  const areaPath = area<Point>().x((p) => x(p.t)).y0(innerH).y1((p) => y(p.v)).curve(curveMonotoneX);

  const yTicks = y.ticks(4);
  const yStep = yTicks.length > 1 ? Math.abs(yTicks[1]! - yTicks[0]!) : 1;
  const yDecimals = yStep >= 1 ? 0 : yStep >= 0.1 ? 1 : 2;
  const span = dx1 - dx0;
  const maxTicks = Math.max(2, Math.floor(innerW / 84));
  const xStep = X_STEPS.find((s) => span / s <= maxTicks) ?? X_STEPS[X_STEPS.length - 1]!;
  const xTicks: number[] = [];
  for (let t = Math.ceil(dx0 / xStep) * xStep; t <= dx1; t += xStep) xTicks.push(t);

  const runs = useMemo(() => excursions(points, band), [points, band]);
  const notes = useMemo(() => annotations(points, band, 2), [points, band]);
  const tail = points[points.length - 1];
  const hovered = hover != null ? points[hover] : undefined;
  const compareAt = hovered && compare ? compare.points[bisect(compare.points, hovered.t)] : undefined;

  const onPointer = (event: PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const t = x.invert(event.clientX - rect.left);
    setKeyboard(false);
    setHover(bisect(points, t));
  };
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!hasData) return;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setKeyboard(true);
      setHover((h) => Math.min(points.length - 1, Math.max(0, (h ?? points.length - 1) + (event.key === "ArrowRight" ? step : -step))));
    } else if (event.key === "Escape") setHover(null);
  };

  const fmtTick = (v: number) => formatNumber(v, yDecimals);
  const bandTop = band ? y(Math.min(band[1], dy1)) : 0;
  const bandBottom = band ? y(Math.max(band[0], dy0)) : 0;
  const summary = hasData
    ? `${metric.label}: último ${formatMetric(metric.key, tail!.v)}` +
      (band ? `, rango objetivo ${formatNumber(band[0], metric.decimals)} a ${formatNumber(band[1], metric.decimals)} ${metric.unit}` : "") +
      (runs.length ? `, ${runs.length} periodo(s) fuera de rango` : "") +
      ". Usa las flechas para recorrer los valores."
    : `${metric.label}: sin datos`;

  // Tooltip placement (HTML so text stays crisp and wraps).
  const tipX = hovered ? M.left + x(hovered.t) : 0;
  const tipLeft = tipX > width - 200;

  return (
    <div ref={ref} className={cn("relative select-none", className)} style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={summary}
          tabIndex={hasData ? 0 : -1}
          onKeyDown={onKey}
          onFocus={() => hasData && setHover((h) => h ?? points.length - 1)}
          onBlur={() => setHover(null)}
          className="block overflow-visible outline-none focus-visible:[&_.ds-plot-frame]:stroke-[var(--ds-border-focus)]"
        >
          <defs>
            <clipPath id={`clip-${uid}`}>
              <rect x={0} y={-4} width={innerW} height={innerH + 8} />
            </clipPath>
            <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={metric.color} stopOpacity={metric.key === "comfort" ? 0.05 : 0.12} />
              <stop offset="1" stopColor={metric.color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <g transform={`translate(${M.left},${M.top})`}>
            <rect className="ds-plot-frame" x={-1} y={-1} width={innerW + 2} height={innerH + 2} fill="none" stroke="transparent" rx={4} />
            {/* grid + y axis */}
            {yTicks.map((v) => (
              <g key={v} transform={`translate(0,${y(v)})`}>
                <line x2={innerW} stroke="var(--ds-chart-grid)" />
                <text x={-10} dy="0.32em" textAnchor="end" className="num fill-[var(--ds-text-muted)] text-[11px]">
                  {fmtTick(v)}
                </text>
              </g>
            ))}
            <line y1={innerH} y2={innerH} x2={innerW} stroke="var(--ds-chart-axis)" />
            {xTicks.map((t) => (
              <text key={t} x={x(t)} y={innerH + 18} textAnchor="middle" className="num fill-[var(--ds-text-muted)] text-[11px]">
                {formatTime(t)}
              </text>
            ))}

            <g clipPath={`url(#clip-${uid})`}>
              {/* target band */}
              {band && bandBottom > bandTop && (
                <g>
                  <rect x={0} y={bandTop} width={innerW} height={bandBottom - bandTop} fill="var(--ds-chart-band)" />
                  {[band[0], band[1]].map((edge) =>
                    edge > dy0 && edge < dy1 ? (
                      <line key={edge} x2={innerW} y1={y(edge)} y2={y(edge)} stroke="var(--ds-chart-band-edge)" strokeDasharray="4 4" />
                    ) : null,
                  )}
                </g>
              )}
              {thresholds?.map((th) =>
                th.value > dy0 && th.value < dy1 ? (
                  <g key={th.value}>
                    <line x2={innerW} y1={y(th.value)} y2={y(th.value)} stroke="var(--ds-state-alert-border)" strokeDasharray="2 4" />
                    <text x={innerW - 6} y={y(th.value) + 13} textAnchor="end" className="fill-[var(--ds-state-alert-text)] text-[11px] font-medium">
                      {th.label}
                    </text>
                  </g>
                ) : null,
              )}
              {/* out-of-range periods */}
              {runs.map((run) => {
                const x0 = x(run.start);
                const w = Math.max(3, x(run.end) - x0);
                return (
                  <g key={run.start}>
                    <rect x={x0} y={0} width={w} height={innerH} fill="var(--ds-chart-out)" />
                    <rect x={x0} y={-6} width={w} height={3} rx={1.5} fill="var(--ds-state-alert-solid)" opacity={0.85} />
                  </g>
                );
              })}
              {hasData && (
                <>
                  {compare && compare.points.length > 1 && (
                    <path d={linePath(compare.points) ?? ""} fill="none" stroke="var(--ds-chart-compare)" strokeWidth={1.75} strokeDasharray="5 4" strokeLinecap="round" />
                  )}
                  <motion.path
                    d={areaPath(points) ?? ""}
                    fill={`url(#fill-${uid})`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: DURATION.slow, delay: reduce ? 0 : DURATION.chart * 0.6 }}
                  />
                  <motion.path
                    d={linePath(points) ?? ""}
                    fill="none"
                    stroke={metric.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    initial={{ pathLength: reduce ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: DURATION.chart, ease: EASE.emphasized }}
                  />
                </>
              )}
            </g>

            {/* band label */}
            {band && bandBottom > bandTop && bandTop >= 0 && (
              <text x={8} y={Math.max(12, bandTop + 13)} className="fill-[var(--ds-state-ok-text)] text-[11px] font-medium">
                Objetivo {formatNumber(band[0], metric.decimals)}–{formatNumber(band[1], metric.decimals)}
                {metric.unit ? ` ${metric.unit}` : ""}
              </text>
            )}

            {/* peak annotations */}
            {hasData &&
              notes.map((note, i) => {
                const px = x(note.point.t);
                const py = y(note.point.v);
                if (px < 0 || px > innerW) return null;
                // Prefer the side away from the band edge; flip when the plot edge leaves no room.
                const below = note.kind === "low" ? py < innerH - 36 : py < 36;
                const text = `${note.kind === "low" ? "Mín." : note.kind === "high" ? "Pico" : "Máx."} ${formatMetric(metric.key, note.point.v)}`;
                const labelW = text.length * 6.6 + 52;
                const lx = Math.min(innerW - labelW / 2, Math.max(labelW / 2, px));
                const ly = below ? py + 24 : py - 24;
                return (
                  <motion.g
                    key={`${note.point.t}-${note.kind}`}
                    initial={{ opacity: 0, y: below ? -4 : 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: DURATION.base, delay: reduce ? 0 : DURATION.chart + i * 0.12 }}
                  >
                    <line x1={px} x2={lx} y1={py + (below ? 5 : -5)} y2={ly + (below ? -9 : 9)} stroke="var(--ds-border-strong)" />
                    <g transform={`translate(${lx - labelW / 2},${ly - 10})`}>
                      <rect width={labelW} height={20} rx={6} fill="var(--ds-bg-raised)" stroke="var(--ds-border-default)" />
                      <text x={8} y={13.5} className="num fill-[var(--ds-text-primary)] text-[11px] font-semibold">
                        {text}
                      </text>
                      <text x={labelW - 8} y={13.5} textAnchor="end" className="num fill-[var(--ds-text-muted)] text-[11px]">
                        {formatTime(note.point.t)}
                      </text>
                    </g>
                    <circle cx={px} cy={py} r={4} fill={note.kind === "max" ? metric.color : `var(--ds-state-alert-solid)`} stroke="var(--ds-bg-surface)" strokeWidth={2} />
                  </motion.g>
                );
              })}

            {/* live tail */}
            {hasData && live && tail && x(tail.t) <= innerW + 1 && (
              <g>
                <circle cx={x(tail.t)} cy={y(tail.v)} r={4} fill={metric.color} className="ds-spark-pulse" />
                <circle cx={x(tail.t)} cy={y(tail.v)} r={4} fill={metric.color} stroke="var(--ds-bg-surface)" strokeWidth={2} />
              </g>
            )}

            {/* crosshair */}
            {hovered && (
              <g pointerEvents="none">
                <line x1={x(hovered.t)} x2={x(hovered.t)} y1={0} y2={innerH} stroke="var(--ds-chart-crosshair)" />
                {compareAt && <circle cx={x(compareAt.t)} cy={y(compareAt.v)} r={3.5} fill="var(--ds-bg-surface)" stroke="var(--ds-chart-compare)" strokeWidth={2} />}
                <circle cx={x(hovered.t)} cy={y(hovered.v)} r={5} fill={metric.color} stroke="var(--ds-bg-surface)" strokeWidth={2.5} />
              </g>
            )}
            <rect
              width={innerW}
              height={innerH}
              fill="transparent"
              onPointerMove={onPointer}
              onPointerDown={onPointer}
              onPointerLeave={() => setHover(null)}
              style={{ touchAction: "pan-y" }}
            />
          </g>
        </svg>
      )}

      <AnimatePresence>
        {hovered && (
          <motion.div
            key="tip"
            role={keyboard ? "status" : undefined}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: DURATION.fast, ease: EASE.enter }}
            className="pointer-events-none absolute z-10 min-w-40 rounded-md border border-line bg-raised px-3 py-2 shadow-md"
            style={{ top: M.top, left: tipLeft ? undefined : tipX + 14, right: tipLeft ? width - tipX + 14 : undefined }}
          >
            <p className="num text-caption text-muted">{formatTime(hovered.t, true)}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="h-0.5 w-3 rounded-full" style={{ background: metric.color }} aria-hidden />
              <span className="num text-label font-semibold text-fg">{formatMetric(metric.key, hovered.v)}</span>
            </div>
            {compareAt && (
              <div className="mt-0.5 flex items-center gap-2">
                <span className="h-0 w-3 border-t-2 border-dashed border-[var(--ds-chart-compare)]" aria-hidden />
                <span className="num text-small text-fg-2">{formatMetric(metric.key, compareAt.v)}</span>
                <span className="truncate text-caption text-muted">{compare?.label}</span>
              </div>
            )}
            {band && (
              <p className={cn("mt-1 text-caption font-medium", placement(hovered.v, band) === "in" ? "text-ok-text" : "text-alert-text")}>
                {placementText(metric.key, placement(hovered.v, band))}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
