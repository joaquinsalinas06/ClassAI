import { motion, useReducedMotion } from "motion/react";
import type { ComfortState } from "../lib/types";
import { stateKey } from "../lib/comfort";
import { formatNumber } from "../lib/format";
import { EASE } from "../ui/motion";

/** Inline 0–100 bar for tables; the tick marks the OK threshold. Number is always printed beside it. */
export function ComfortBar({ value, state, okMin = 80, width = 72 }: { value: number | null | undefined; state: ComfortState | null; okMin?: number; width?: number }) {
  const valid = value != null && value >= 0;
  const reduce = useReducedMotion();
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative h-1.5 overflow-hidden rounded-full bg-sunken" style={{ width }} aria-hidden>
        {valid && (
          <motion.span
            className="absolute inset-0 origin-left rounded-full"
            style={{ background: `var(--ds-state-${stateKey(state)}-solid)` }}
            initial={reduce ? false : { transform: "scaleX(0)" }}
            animate={{ transform: `scaleX(${Math.min(100, value) / 100})` }}
            transition={{ duration: 0.8, ease: EASE.emphasized, delay: 0.15 }}
          />
        )}
        <span className="absolute inset-y-0 w-px bg-[var(--ds-bg-surface)]" style={{ left: `${okMin}%` }} />
      </span>
      <span className="num w-7 text-right text-fg">{valid ? formatNumber(value) : "—"}</span>
    </span>
  );
}
