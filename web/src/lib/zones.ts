// Per-zone light (two LDRs) and motion (two PIRs): minute backfill from /zones plus live node samples.
import { appendPoint, toPoints, type Point } from "./series";
import type { ZoneRole, ZonesResponse } from "./types";

export const ZONE_ROLES = ["access", "environment"] as const satisfies readonly ZoneRole[];
export const ZONE_LABEL: Record<ZoneRole, { light: string; motion: string; color: string }> = {
  access: { light: "Acceso", motion: "Entrada", color: "var(--ds-metric-rh)" },
  environment: { light: "Ambiente", motion: "Interior", color: "var(--ds-metric-noise)" },
};

const MINUTE = 60_000;
export const ACTIVITY_WINDOW_MIN = 5;

export type ZoneSamples = Record<ZoneRole, Point[]>;
export interface ZoneLive {
  light: ZoneSamples;
  presence: ZoneSamples;
}
export const emptyZoneLive = (): ZoneLive => ({ light: { access: [], environment: [] }, presence: { access: [], environment: [] } });

export interface ZoneLine {
  role: ZoneRole;
  label: string;
  color: string;
  points: Point[];
}
export interface ZoneSeries {
  /** Average of the node lines (equal to the only line when one node reports). */
  light: Point[];
  /** % of time with motion, rolling 5-minute window, both PIRs combined. */
  motion: Point[];
  lines: { light: ZoneLine[]; motion: ZoneLine[] };
}

/** Live sample of one node snapshot; light in %, presence as 0/1. */
export function appendZoneSample(live: ZoneLive, role: ZoneRole, t: number, light: unknown, presence: unknown, cap = 720): ZoneLive {
  const next = { light: { ...live.light }, presence: { ...live.presence } };
  if (typeof light === "number" && Number.isFinite(light)) next.light[role] = appendPoint(live.light[role], { t, v: light * 100 }, cap);
  if (typeof presence === "boolean" || typeof presence === "number") next.presence[role] = appendPoint(live.presence[role], { t, v: presence ? 1 : 0 }, cap);
  return next;
}

/** Backfill minutes before the first live sample, then the live samples. */
export function mergeLive(backfill: Point[], live: Point[]): Point[] {
  if (!live.length) return backfill;
  const cut = Math.floor(live[0]!.t / MINUTE) * MINUTE;
  return [...backfill.filter((p) => p.t < cut), ...live];
}

/**
 * Average of several series sampled at different instants: at every timestamp of any series, the mean of
 * each series' latest value no older than `maxGap`. One series in, the same series out.
 */
export function averageLines(lines: Point[][], maxGap = 90_000): Point[] {
  const series = lines.filter((l) => l.length > 0);
  if (series.length <= 1) return series[0] ?? [];
  const times = [...new Set(series.flatMap((l) => l.map((p) => p.t)))].sort((a, b) => a - b);
  const index = series.map(() => -1);
  const out: Point[] = [];
  for (const t of times) {
    let sum = 0;
    let n = 0;
    series.forEach((l, i) => {
      while (index[i]! + 1 < l.length && l[index[i]! + 1]!.t <= t) index[i]!++;
      const p = l[index[i]!];
      if (p && t - p.t <= maxGap) {
        sum += p.v;
        n++;
      }
    });
    if (n) out.push({ t, v: sum / n });
  }
  return out;
}

/** Mean value per minute (minute start → mean). */
function perMinute(points: Point[]): Map<number, number> {
  const acc = new Map<number, [number, number]>();
  for (const p of points) {
    const m = Math.floor(p.t / MINUTE) * MINUTE;
    const a = acc.get(m) ?? [0, 0];
    a[0] += p.v;
    a[1]++;
    acc.set(m, a);
  }
  return new Map([...acc].map(([m, [s, n]]) => [m, s / n]));
}

/**
 * Continuous activity in %: per minute, the mean motion fraction of the zones that reported; then the mean of
 * the minutes with data inside the last `windowMin` minutes. One point per minute (the current one updates).
 */
export function activity(zones: Point[][], windowMin = ACTIVITY_WINDOW_MIN): Point[] {
  const maps = zones.map(perMinute);
  const minutes = [...new Set(maps.flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
  const combined = minutes.map((m) => {
    const values = maps.map((map) => map.get(m)).filter((v): v is number => v != null);
    return { t: m, v: values.reduce((s, v) => s + v, 0) / values.length };
  });
  return combined.map((p, i) => {
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0 && combined[j]!.t > p.t - windowMin * MINUTE; j--) {
      sum += combined[j]!.v;
      n++;
    }
    return { t: p.t, v: (sum / n) * 100 };
  });
}

export function buildZones(backfill: ZonesResponse | undefined, live: ZoneLive = emptyZoneLive()): ZoneSeries {
  const rows = (role: ZoneRole) => backfill?.zones?.find((z) => z.role === role);
  const light = ZONE_ROLES.map((role) => ({
    role,
    points: mergeLive(toPoints(rows(role)?.light).map((p) => ({ t: p.t, v: p.v * 100 })), live.light[role]),
  }));
  const presence = ZONE_ROLES.map((role) => ({ role, points: mergeLive(toPoints(rows(role)?.presence), live.presence[role]) }));
  const withData = <T extends { points: Point[] }>(list: T[]) => list.filter((l) => l.points.length > 0);
  const lightLines = withData(light).map(({ role, points }) => ({ role, label: ZONE_LABEL[role].light, color: ZONE_LABEL[role].color, points }));
  const motionLines = withData(presence).map(({ role, points }) => ({ role, label: ZONE_LABEL[role].motion, color: ZONE_LABEL[role].color, points: activity([points]) }));
  return {
    light: averageLines(lightLines.map((l) => l.points)),
    motion: activity(withData(presence).map((l) => l.points)),
    lines: { light: lightLines, motion: motionLines },
  };
}
