import type { ReactNode } from "react";
import { cn } from "./cn";
import type { ComfortState } from "../lib/types";
import { STATE_LABEL, stateKey } from "../lib/comfort";
import { StateIcon } from "./icons";

export type Tone = "neutral" | "info" | "ok" | "regular" | "alert" | "offline";

const tones: Record<Tone, string> = {
  neutral: "border-line bg-sunken text-fg-2",
  info: "border-transparent bg-info-subtle text-info",
  ok: "border-ok-border bg-ok-subtle text-ok-text",
  regular: "border-regular-border bg-regular-subtle text-regular-text",
  alert: "border-alert-border bg-alert-subtle text-alert-text",
  offline: "border-offline-border bg-offline-subtle text-offline-text",
};

export function Badge({ tone = "neutral", icon, children, className, size = "md" }: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap border font-medium",
        size === "sm" ? "h-5 rounded-xs px-1.5 text-micro" : "h-6 rounded-sm px-2 text-caption",
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Comfort state: color + icon + label, always together. */
export function StateBadge({ state, size = "md", offline, className }: {
  state: ComfortState | null | undefined;
  size?: "sm" | "md";
  offline?: boolean;
  className?: string;
}) {
  const key = offline ? "offline" : stateKey(state);
  return (
    <Badge tone={key} size={size} className={className} icon={<StateIcon state={offline ? null : state} size={size === "sm" ? 12 : 14} />}>
      {offline ? "Sin conexión" : state ? STATE_LABEL[state] : "Sin datos"}
    </Badge>
  );
}

/** Small status dot; `pulse` for live things. */
export function Dot({ tone, pulse, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  const color = { neutral: "text-faint", info: "text-info", ok: "text-ok", regular: "text-regular", alert: "text-alert", offline: "text-offline" }[tone];
  return (
    <span className={cn("relative inline-flex size-2 shrink-0 rounded-full bg-current", color, pulse && "ds-pulse", className)} aria-hidden />
  );
}
