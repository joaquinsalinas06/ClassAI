import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "./cn";
import { EASE } from "./motion";

/** Tweens between values by writing text directly (no re-render per frame). */
export function AnimatedNumber({ value, format, className, from, duration = 0.6 }: {
  value: number | null | undefined;
  format: (n: number) => string;
  className?: string;
  /** Start value on first mount (e.g. 0 for a count-up). Defaults to no mount animation. */
  from?: number;
  duration?: number;
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
    return () => controls.stop();
  }, [value, reduce, duration]);

  return (
    <span ref={ref} className={cn("num", className)}>
      {value == null || !Number.isFinite(value) ? "—" : format(from ?? value)}
    </span>
  );
}
