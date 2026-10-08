import { useLayoutEffect, useRef, useState } from "react";

/** Element content size via ResizeObserver (charts render at real pixels for crisp 2px lines). */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.width - rect.width) < 0.5 && Math.abs(s.height - rect.height) < 0.5 ? s : { width: rect.width, height: rect.height }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}
