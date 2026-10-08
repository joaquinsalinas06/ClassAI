import {
  AudioLines, CircleAlert, CircleCheck, Droplets, Gauge, PersonStanding, Sun, Thermometer, TriangleAlert, WifiOff,
  type LucideProps,
} from "lucide-react";
import type { ChartMetric, ComfortState } from "../lib/types";

export const METRIC_ICON: Record<ChartMetric | "presence", React.ComponentType<LucideProps>> = {
  comfort: Gauge,
  temp_c: Thermometer,
  rh_pct: Droplets,
  lux: Sun,
  noise_rel: AudioLines,
  presence: PersonStanding,
};

export function MetricIcon({ metric, size = 16, className }: { metric: ChartMetric | "presence"; size?: number; className?: string }) {
  const Icon = METRIC_ICON[metric];
  return <Icon size={size} className={className} aria-hidden />;
}

export function StateIcon({ state, size = 14, className }: { state: ComfortState | null | undefined; size?: number; className?: string }) {
  const Icon = state === "OK" ? CircleCheck : state === "REGULAR" ? CircleAlert : state === "ALERT" ? TriangleAlert : WifiOff;
  return <Icon size={size} className={className} aria-hidden />;
}
