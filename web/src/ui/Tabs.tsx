import { motion } from "motion/react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";
import { SPRING } from "./motion";

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

/** Segmented tabs with a sliding indicator. Arrow keys move selection (roving tabindex). */
export function Tabs<T extends string>({ items, value, onChange, label, size = "md", className }: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (event: KeyboardEvent, index: number) => {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + items.length) % items.length;
    onChange(items[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cn("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md bg-sunken p-0.5", className)}>
      {items.map((item, index) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => { refs.current[index] = el; }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => onKey(e, index)}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-1.5 rounded-[6px] font-medium transition-colors duration-100",
              size === "sm" ? "h-6 px-2 text-caption" : "h-7 px-2.5 text-label",
              active ? "text-fg" : "text-muted hover:text-fg-2",
            )}
          >
            {active && (
              <motion.span
                layoutId={`tab-${id}`}
                transition={SPRING.snappy}
                className="absolute inset-0 rounded-[6px] border border-line bg-surface shadow-xs"
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {item.icon}
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
