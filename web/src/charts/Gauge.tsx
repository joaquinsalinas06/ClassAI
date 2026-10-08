import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";
import type { ComfortState } from "../lib/types";
import { stateKey } from "../lib/comfort";
import { formatNumber } from "../lib/format";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { SPRING } from "../ui/motion";

const START = 135; // degrees, SVG polar (0 = +x, clockwise)
const SWEEP = 270;

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
};
function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a0 = START + from * SWEEP;
  const a1 = START + to * SWEEP;
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/**
 * Comfort gauge: 270° ring whose track shows the three state zones (alert < regular_min ≤ regular < ok_min ≤ ok),
 * a value arc in the current state color that springs to the new value, and the number in the middle.
 */
export function Gauge({ value, state, okMin = 80, regularMin = 60, size = 220, offline, label = "Índice de confort" }: {
  value: number | null | undefined;
  state: ComfortState | null | undefined;
  okMin?: number;
  regularMin?: number;
  size?: number;
  offline?: boolean;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const stroke = Math.round(size * 0.062);
  const c = size / 2;
  const r = c - stroke / 2 - 22;
  const valid = value != null && value >= 0;
  const target = valid ? Math.min(100, Math.max(0, value)) : 0;

  const spring = useSpring(0, SPRING.gauge);
  useEffect(() => {
    if (reduce) spring.jump(target);
    else spring.set(target);
  }, [target, reduce, spring]);
  const pathLength = useTransform(spring, (v) => Math.max(0.0001, v / 100));
  const capX = useTransform(spring, (v) => polar(c, c, r, START + (v / 100) * SWEEP)[0]);
  const capY = useTransform(spring, (v) => polar(c, c, r, START + (v / 100) * SWEEP)[1]);

  const key = offline ? "offline" : stateKey(state);
  const color = `var(--ds-state-${key}-solid)`;
  const zones: [number, number, string][] = [
    [0, regularMin / 100, "alert"],
    [regularMin / 100, okMin / 100, "regular"],
    [okMin / 100, 1, "ok"],
  ];
  const gap = 1.2 / SWEEP; // small visual gap between zones
  const ticks = [regularMin, okMin];

  return (
    <div className="relative" style={{ width: size, height: size * 0.86 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${valid ? formatNumber(target) : "sin datos"} de 100`}>
        {zones.map(([from, to, zone]) => (
          <path
            key={zone}
            d={arc(c, c, r, from + (from > 0 ? gap : 0), to - (to < 1 ? gap : 0))}
            fill="none"
            stroke={`var(--ds-state-${offline ? "offline" : zone}-subtle)`}
            strokeWidth={stroke}
            strokeLinecap={from === 0 || to === 1 ? "round" : "butt"}
          />
        ))}
        {ticks.map((t) => {
          const [x0, y0] = polar(c, c, r + stroke / 2 + 3, START + (t / 100) * SWEEP);
          const [x1, y1] = polar(c, c, r + stroke / 2 + 8, START + (t / 100) * SWEEP);
          const [lx, ly] = polar(c, c, r + stroke / 2 + 16, START + (t / 100) * SWEEP);
          return (
            <g key={t}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--ds-border-strong)" strokeWidth={1.5} strokeLinecap="round" />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="num fill-[var(--ds-text-muted)] text-[10px] font-medium">
                {t}
              </text>
            </g>
          );
        })}
        {valid && (
          <>
            <motion.path
              d={arc(c, c, r, 0, 1)}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              style={{ pathLength, transition: "stroke 400ms var(--ds-motion-easing-standard)" }}
            />
            <motion.circle
              cx={capX}
              cy={capY}
              r={stroke / 2 - 2.5}
              fill="var(--ds-bg-surface)"
              style={{ transition: "fill 400ms" }}
            />
          </>
        )}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center" style={{ top: size * 0.3 }}>
        <AnimatedNumber
          value={valid ? target : null}
          from={0}
          duration={1.1}
          format={(n) => formatNumber(n)}
          className="text-hero font-[540] text-fg"
        />
        <span className="mt-1 text-caption text-muted">de 100</span>
      </div>
    </div>
  );
}
