import { area, curveMonotoneX, line } from "d3-shape";
import { scaleLinear } from "d3-scale";
import { motion } from "motion/react";
import { useId } from "react";
import type { Point } from "../lib/series";
import { yDomain } from "../lib/series";
import { useSize } from "./useSize";
import { DURATION, EASE } from "../ui/motion";

/** Compact trend line with the target band behind it. Values are always labelled next to it (relief rule). */
export function Sparkline({ points, band, color, minSpan, height = 40, live, windowMs, className }: {
  points: Point[];
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
  const visible = windowMs && last ? points.filter((p) => p.t >= last.t - windowMs) : points;
  const ready = width > 0 && visible.length > 1;

  let body = null;
  if (ready) {
    const pad = 3;
    const x = scaleLinear().domain([visible[0]!.t, visible[visible.length - 1]!.t]).range([pad, width - pad - (live ? 4 : 0)]);
    const [lo, hi] = yDomain(visible.map((p) => p.v), band ?? null, minSpan);
    const y = scaleLinear().domain([lo, hi]).range([height - pad, pad]);
    const path = line<Point>().x((p) => x(p.t)).y((p) => y(p.v)).curve(curveMonotoneX)(visible) ?? "";
    const fill = area<Point>().x((p) => x(p.t)).y0(height).y1((p) => y(p.v)).curve(curveMonotoneX)(visible) ?? "";
    const tail = visible[visible.length - 1]!;
    body = (
      <svg width={width} height={height} className="block overflow-visible" aria-hidden>
        <defs>
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
        <path d={fill} fill={`url(#${gradientId})`} />
        <motion.path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: DURATION.chart, ease: EASE.emphasized }}
        />
        <circle cx={x(tail.t)} cy={y(tail.v)} r={2.75} fill={color} stroke="var(--ds-bg-surface)" strokeWidth={1.5} />
        {live && <circle cx={x(tail.t)} cy={y(tail.v)} r={2.75} fill={color} className="ds-spark-pulse" />}
      </svg>
    );
  }
  return (
    <div ref={ref} className={className} style={{ height }}>
      {body}
    </div>
  );
}
