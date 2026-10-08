// Comfort model mirrored from backend/tuner.py (reference of firmware comfort.h) plus metric metadata.
import type { ChartMetric, ComfortConfig, ComfortState, Readings } from "./types";
import { formatNumber, withUnit } from "./format";

export const FACTORY_CONFIG: Omit<ComfortConfig, "room"> = {
  v: 1,
  params_version: 0,
  temp_c: [21, 24],
  rh_pct: [40, 60],
  lux: [300, 500],
  noise_rel_max: 0.5,
  weights: { temp: 0.35, rh: 0.2, lux: 0.2, noise: 0.25 },
  ok_min: 80,
  regular_min: 60,
  source: { temp: "factory", rh: "factory", noise: "factory", lux: "factory" },
};

const TEMP_FALLOFF_C = 3;
const NOISE_FALLOFF = 0.3;
const valid = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);

function score(value: number, low: number, high: number, falloff: number): number {
  if (value >= low && value <= high) return 100;
  const distance = value < low ? low - value : value - high;
  return Math.max(0, 100 * (1 - distance / falloff));
}

/** Same formula, weights and rounding (floor(x + 0.5)) as tuner.comfort_index. -1 when no sensor is valid. */
export function comfortIndex(cfg: Pick<ComfortConfig, "weights" | "temp_c" | "rh_pct" | "lux" | "noise_rel_max">, r: Readings): number {
  const parts: [number, number][] = [];
  const { weights } = cfg;
  if (valid(r.temp_c)) parts.push([weights.temp, score(r.temp_c, cfg.temp_c[0], cfg.temp_c[1], TEMP_FALLOFF_C)]);
  if (valid(r.rh_pct)) parts.push([weights.rh, score(r.rh_pct, cfg.rh_pct[0], cfg.rh_pct[1], Math.max(cfg.rh_pct[1] - cfg.rh_pct[0], 1e-6))]);
  if (valid(r.lux)) parts.push([weights.lux, score(r.lux, cfg.lux[0], cfg.lux[1], Math.max(cfg.lux[1] - cfg.lux[0], 1e-6))]);
  if (valid(r.noise_rel)) parts.push([weights.noise, score(r.noise_rel, -Infinity, cfg.noise_rel_max, NOISE_FALLOFF)]);
  const total = parts.reduce((sum, [w]) => sum + w, 0);
  if (total <= 0) return -1;
  const value = parts.reduce((sum, [w, s]) => sum + w * s, 0) / total;
  return Math.min(100, Math.max(0, Math.floor(value + 0.5)));
}

/** tuner.comfort_state: no valid sensors (-1 / null) is REGULAR. */
export function comfortState(cfg: Pick<ComfortConfig, "ok_min" | "regular_min">, comfort: number | null | undefined): ComfortState {
  if (comfort == null || comfort < 0) return "REGULAR";
  if (comfort >= cfg.ok_min) return "OK";
  return comfort >= cfg.regular_min ? "REGULAR" : "ALERT";
}

export const STATE_LABEL: Record<ComfortState, string> = { OK: "Confortable", REGULAR: "Regular", ALERT: "Alerta" };
export const STATE_HINT: Record<ComfortState, string> = {
  OK: "Las condiciones están dentro del rango objetivo.",
  REGULAR: "Una o más variables se alejan del rango; aún es tolerable.",
  ALERT: "Condiciones fuera de rango. El nodo puede activar el ventilador.",
};
export const stateKey = (state: ComfortState | null | undefined) =>
  state === "OK" ? "ok" : state === "ALERT" ? "alert" : state === "REGULAR" ? "regular" : "offline";

export interface MetricMeta {
  key: ChartMetric;
  label: string;
  short: string;
  unit: string;
  decimals: number;
  color: string; // CSS var
  /** Sensible y-axis floor/ceiling so a flat line doesn't look dramatic. */
  minSpan: number;
}

export const METRICS: Record<ChartMetric, MetricMeta> = {
  comfort: { key: "comfort", label: "Índice de confort", short: "Confort", unit: "", decimals: 0, color: "var(--ds-metric-comfort)", minSpan: 30 },
  temp_c: { key: "temp_c", label: "Temperatura", short: "Temperatura", unit: "°C", decimals: 1, color: "var(--ds-metric-temp)", minSpan: 4 },
  rh_pct: { key: "rh_pct", label: "Humedad relativa", short: "Humedad", unit: "%", decimals: 0, color: "var(--ds-metric-rh)", minSpan: 20 },
  lux: { key: "lux", label: "Iluminación", short: "Luz", unit: "lx", decimals: 0, color: "var(--ds-metric-lux)", minSpan: 200 },
  noise_rel: { key: "noise_rel", label: "Ruido relativo", short: "Ruido", unit: "rel.", decimals: 2, color: "var(--ds-metric-noise)", minSpan: 0.3 },
};
export const SENSOR_METRICS = ["temp_c", "rh_pct", "lux", "noise_rel"] as const satisfies readonly ChartMetric[];
export const CHART_METRICS = ["comfort", ...SENSOR_METRICS] as const satisfies readonly ChartMetric[];

export function formatMetric(metric: ChartMetric, value: number | null | undefined, unit = true): string {
  const meta = METRICS[metric];
  const text = formatNumber(value, meta.decimals);
  return unit && value != null && meta.unit ? withUnit(text, meta.unit) : text;
}

/** Target range for a metric (score 100 zone). Comfort uses [ok_min, 100]. */
export function bandOf(metric: ChartMetric, cfg: ComfortConfig | null | undefined): [number, number] | null {
  if (!cfg) return null;
  switch (metric) {
    case "temp_c": return cfg.temp_c;
    case "rh_pct": return cfg.rh_pct;
    case "lux": return cfg.lux;
    case "noise_rel": return [0, cfg.noise_rel_max];
    case "comfort": return [cfg.ok_min, 100];
  }
}

export type Placement = "in" | "low" | "high" | "unknown";
/** Where a value sits against its band. Pass `decimals` to judge the value as displayed (60.4 % shown as "60" is in range). */
export function placement(value: number | null | undefined, band: [number, number] | null, decimals?: number): Placement {
  if (value == null || !Number.isFinite(value) || !band) return "unknown";
  if (decimals != null) value = Number(value.toFixed(decimals));
  if (value < band[0]) return "low";
  if (value > band[1]) return "high";
  return "in";
}

const PLACEMENT_TEXT: Record<Exclude<ChartMetric, "comfort">, Record<"low" | "high", string>> = {
  temp_c: { low: "Hace frío", high: "Hace calor" },
  rh_pct: { low: "Aire seco", high: "Aire húmedo" },
  lux: { low: "Poca luz", high: "Exceso de luz" },
  noise_rel: { low: "Silencio", high: "Ruido alto" },
};
export function placementText(metric: ChartMetric, p: Placement): string {
  if (p === "in") return "En rango";
  if (p === "unknown") return "Sin dato";
  if (metric === "comfort") return p === "low" ? "Bajo el objetivo" : "En rango";
  return PLACEMENT_TEXT[metric][p];
}

/** Fan relay rule of the node firmware (classai_node.ino): on when ALERT and too hot, off when OK, 60 s hold. */
export const RELAY_MIN_HOLD_MS = 60_000;
export function nextFanState(
  fan: { on: boolean; changedAt: number },
  state: ComfortState,
  tempC: number | null | undefined,
  tempMax: number,
  now: number,
): { on: boolean; changedAt: number } {
  let want = fan.on;
  if (state === "ALERT" && valid(tempC) && tempC > tempMax) want = true;
  if (state === "OK") want = false;
  if (want !== fan.on && now - fan.changedAt >= RELAY_MIN_HOLD_MS) return { on: want, changedAt: now };
  return fan;
}

const SOURCE_TEXT: Record<string, string> = {
  ashrae55_adaptive: "ASHRAE 55 adaptativo",
  factory: "Valores de fábrica",
  fixed: "Fijo",
  baseline_p90: "Línea base P90 de la clase",
  en12464: "EN 12464-1 (aula diurna)",
  en12464_evening: "EN 12464-1 (clase nocturna)",
};
export const sourceText = (source: string | undefined) => (source ? SOURCE_TEXT[source] ?? source : "—");
