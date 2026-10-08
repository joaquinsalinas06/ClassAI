import { motion } from "motion/react";
import type { ComfortState } from "../lib/types";
import { stateKey } from "../lib/comfort";
import { formatNumber } from "../lib/format";
import { EASE } from "../ui/motion";

/** Compact comfort ring for tiles: full circle, value arc in state color, number inside. */
export function ComfortRing({ value, state, size = 64, offline }: { value: number | null | undefined; state: ComfortState | null | undefined; size?: number; offline?: boolean }) {
  const stroke = size * 0.1;
  const r = (size - stroke) / 2;
  const valid = value != null && value >= 0;
  const key = offline ? "offline" : stateKey(state);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Confort ${valid ? formatNumber(value) : "sin datos"} de 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`var(--ds-state-${key}-subtle)`} strokeWidth={stroke} />
        {valid && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`var(--ds-state-${key}-solid)`}
            strokeWidth={stroke}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: Math.max(0.001, value / 100) }}
            transition={{ duration: 0.9, ease: EASE.emphasized }}
          />
        )}
      </svg>
      <span className="num absolute inset-0 flex items-center justify-center font-semibold tracking-[-0.03em] text-fg" style={{ fontSize: size * 0.3 }}>
        {valid ? formatNumber(value) : "—"}
      </span>
    </div>
  );
}
