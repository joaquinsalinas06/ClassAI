import type { ComfortState } from "../lib/types";
import { stateKey } from "../lib/comfort";
import { formatNumber } from "../lib/format";

/** Inline 0–100 bar for tables; the tick marks the OK threshold. Number is always printed beside it. */
export function ComfortBar({ value, state, okMin = 80, width = 72 }: { value: number | null | undefined; state: ComfortState | null; okMin?: number; width?: number }) {
  const valid = value != null && value >= 0;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative h-1.5 overflow-hidden rounded-full bg-sunken" style={{ width }} aria-hidden>
        {valid && (
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${Math.min(100, value)}%`, background: `var(--ds-state-${stateKey(state)}-solid)` }}
          />
        )}
        <span className="absolute inset-y-0 w-px bg-[var(--ds-bg-surface)]" style={{ left: `${okMin}%` }} />
      </span>
      <span className="num w-7 text-right text-fg">{valid ? formatNumber(value) : "—"}</span>
    </span>
  );
}
