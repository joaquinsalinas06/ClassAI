import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "./cn";
import { EASE } from "./motion";

/** Tweens between values by writing text directly (no re-render per frame). */
export function AnimatedNumber({ value, format, className, from, duration = 0.6, bump }: {
  value: number | null | undefined;
  format: (n: number) => string;
  className?: string;
  /** Start value on first mount (e.g. 0 for a count-up). Defaults to no mount animation. */
  from?: number;
  duration?: number;
  /** Give a soft scale bump when the value goes up (live counters: arrivals, votes). */
  bump?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef<number | null>(from ?? null);
  const formatRef = useRef(format);
  formatRef.current = format;
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value == null || !Number.isFinite(value)) {
      el.textContent = "—";
      previous.current = null;
      return;
    }
    const start = previous.current ?? value;
    previous.current = value;
    if (reduce || start === value) {
      el.textContent = formatRef.current(value);
      return;
    }
    const controls = animate(start, value, { duration, ease: EASE.standard, onUpdate: (v) => (el.textContent = formatRef.current(v)) });
    const pop = bump && value > start
      ? animate(el, { transform: ["scale(1)", "scale(1.2)", "scale(1)"] }, { duration: 0.5, ease: EASE.emphasized })
      : null;
    return () => {
      controls.stop();
      pop?.complete();
    };
  }, [value, reduce, duration, bump]);

  return (
    <span ref={ref} className={cn("num", bump && "inline-block origin-center", className)}>
      {value == null || !Number.isFinite(value) ? "—" : format(from ?? value)}
    </span>
  );
}
