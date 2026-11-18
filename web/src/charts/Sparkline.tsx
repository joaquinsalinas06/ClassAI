import { area, curveMonotoneX, line } from "d3-shape";
import { scaleLinear } from "d3-scale";
import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { DRAW_EASE, useGrowingTail } from "./TimeSeries";
import type { Point } from "../lib/series";
import { yDomain } from "../lib/series";
import { useSize } from "./useSize";
import { DURATION } from "../ui/motion";

/** Compact trend line with the target band behind it. Values are always labelled next to it (relief rule). */
export function Sparkline({ points, extras, band, color, minSpan, height = 40, live, windowMs, className }: {
  points: Point[];
  /** Thinner lines behind the main one (e.g. one per node while `points` is their average). */
  extras?: { points: Point[]; color: string }[];
  band?: [number, number] | null;
  color: string;
  minSpan: number;
  height?: number;
  live?: boolean;
  /** Show only the last `windowMs` of data. */
  windowMs?: number;
  className?: string;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const gradientId = `spark${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const last = points[points.length - 1];
  const reduce = useReducedMotion();
  const visible = useGrowingTail(windowMs && last ? points.filter((p) => p.t >= last.t - windowMs) : points, !!live && !reduce);
  const ready = width > 0 && visible.length > 1;

  let body = null;
  if (ready) {
    const pad = 3;
    const from = last!.t - (windowMs ?? Infinity);
    const others = (extras ?? []).map((e) => ({ color: e.color, points: e.points.filter((p) => p.t >= from) })).filter((e) => e.points.length > 1);
    const t0 = Math.min(visible[0]!.t, ...others.map((e) => e.points[0]!.t));
    const x = scaleLinear().domain([t0, last!.t]).range([pad, width - pad - (live ? 4 : 0)]);
    const [lo, hi] = yDomain([...visible, ...others.flatMap((e) => e.points)].map((p) => p.v), band ?? null, minSpan);
    const y = scaleLinear().domain([lo, hi]).range([height - pad, pad]);
    const path = line<Point>().x((p) => x(p.t)).y((p) => y(p.v)).curve(curveMonotoneX)(visible) ?? "";
    const fill = area<Point>().x((p) => x(p.t)).y0(height).y1((p) => y(p.v)).curve(curveMonotoneX)(visible) ?? "";
    const tail = visible[visible.length - 1]!;
    body = (
      <svg width={width} height={height} className="block overflow-visible" aria-hidden>
        <defs>
          <clipPath id={`${gradientId}r`}>
            {/* draw-in: line and area grow left to right */}
            <motion.rect
              x={-4}
              y={-4}
              width={width + 8}
              height={height + 8}
              style={{ transformBox: "fill-box", transformOrigin: "0% 50%" }}
              initial={{ transform: reduce ? "scaleX(1)" : "scaleX(0)" }}
              animate={{ transform: "scaleX(1)" }}
              transition={{ duration: DURATION.chart, ease: DRAW_EASE }}
            />
          </clipPath>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.18" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {band && (
          <rect
            x={0}
            width={width}
            y={Math.max(0, y(Math.min(band[1], hi)))}
            height={Math.max(0, y(Math.max(band[0], lo)) - y(Math.min(band[1], hi)))}
            fill="var(--ds-chart-band)"
            rx={3}
          />
        )}
        <g clipPath={`url(#${gradientId}r)`}>
          {others.length === 0 && <path d={fill} fill={`url(#${gradientId})`} />}
          {others.map((e) => (
            <path key={e.color} d={line<Point>().x((p) => x(Math.min(p.t, last!.t))).y((p) => y(p.v)).curve(curveMonotoneX)(e.points) ?? ""}
              fill="none" stroke={e.color} strokeWidth={1.25} strokeOpacity={0.9} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          <path d={path} fill="none" stroke={color} strokeWidth={others.length ? 2.5 : 1.75} strokeLinecap="round" strokeLinejoin="round" />
          <g transform={`translate(${x(tail.t)},${y(tail.v)})`}>
            {live && <circle r={2.75} fill={color} className="ds-spark-pulse" />}
            <motion.circle
              key={last!.t}
              r={2.75}
              fill={color}
              stroke="var(--ds-bg-surface)"
              strokeWidth={1.5}
              initial={reduce ? false : { transform: "scale(0.3)" }}
              animate={{ transform: "scale(1)" }}
              transition={{ type: "spring", duration: 0.45, bounce: 0.3 }}
            />
          </g>
        </g>
      </svg>
    );
  }
  return (
    <div ref={ref} className={className} style={{ height }}>
      {body}
    </div>
  );
}
