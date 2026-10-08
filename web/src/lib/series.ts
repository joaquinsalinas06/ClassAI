// Time-series helpers: conversion, excursion (out-of-band) and peak detection, deltas, y-domain.
import type { SeriesPoint } from "./types";
import { parseTime } from "./format";

export interface Point {
  t: number; // epoch ms
  v: number;
}

export function toPoints(series: SeriesPoint[] | undefined): Point[] {
  if (!series) return [];
  const points: Point[] = [];
  for (const row of series) {
    const t = parseTime(row.bucket_start);
    if (t != null && Number.isFinite(row.avg)) points.push({ t, v: row.avg });
  }
  return points.sort((a, b) => a.t - b.t);
}

/** Insert keeping time order; same timestamp replaces; keeps at most `cap` newest points. */
export function appendPoint(points: Point[], point: Point, cap = 720): Point[] {
  const last = points[points.length - 1];
  let next: Point[];
  if (!last || point.t > last.t) next = [...points, point];
  else if (point.t === last.t) next = [...points.slice(0, -1), point];
  else {
    const index = points.findIndex((p) => p.t >= point.t);
    next = points[index]?.t === point.t
      ? points.map((p, i) => (i === index ? point : p))
      : [...points.slice(0, index), point, ...points.slice(index)];
  }
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export interface Excursion {
  start: number;
  end: number;
  side: "high" | "low";
  peak: Point;
  /** Distance of the peak beyond the band edge, in metric units. */
  magnitude: number;
}

/**
 * Contiguous runs outside [lo, hi]. Runs on the same side separated by less than `mergeGapMs`
 * are merged so a value hovering on the edge reads as one period, not a barcode.
 */
export function excursions(points: Point[], band: [number, number] | null, mergeGapMs = 2 * 60_000): Excursion[] {
  if (!band || points.length === 0) return [];
  const [lo, hi] = band;
  const runs: Excursion[] = [];
  let current: Excursion | null = null;
  for (const p of points) {
    const side = p.v > hi ? "high" : p.v < lo ? "low" : null;
    if (!side) {
      current = null;
      continue;
    }
    const magnitude = side === "high" ? p.v - hi : lo - p.v;
    const previous = runs[runs.length - 1];
    if (!current && previous && previous.side === side && p.t - previous.end <= mergeGapMs) current = previous;
    if (current && current.side === side) {
      current.end = p.t;
      if (magnitude > current.magnitude) {
        current.magnitude = magnitude;
        current.peak = p;
      }
    } else {
      current = { start: p.t, end: p.t, side, peak: p, magnitude };
      runs.push(current);
    }
  }
  return runs;
}

export function extremes(points: Point[]): { max: Point; min: Point } | null {
  if (points.length === 0) return null;
  let max = points[0]!;
  let min = points[0]!;
  for (const p of points) {
    if (p.v > max.v) max = p;
    if (p.v < min.v) min = p;
  }
  return { max, min };
}

export interface Annotation {
  point: Point;
  kind: "high" | "low" | "max";
}

/** Up to `limit` peaks worth labelling: the largest excursions; if none, the overall maximum. */
export function annotations(points: Point[], band: [number, number] | null, limit = 2): Annotation[] {
  const runs = excursions(points, band).sort((a, b) => b.magnitude - a.magnitude).slice(0, limit);
  if (runs.length > 0) return runs.map((r) => ({ point: r.peak, kind: r.side })).sort((a, b) => a.point.t - b.point.t);
  const ext = extremes(points);
  return ext && points.length > 2 ? [{ point: ext.max, kind: "max" }] : [];
}

/** Change of the latest value against the value `windowMs` earlier (nearest point at or before). */
export function deltaOver(points: Point[], windowMs: number): number | null {
  const last = points[points.length - 1];
  if (!last) return null;
  const target = last.t - windowMs;
  let reference: Point | null = null;
  for (const p of points) {
    if (p.t <= target) reference = p;
    else break;
  }
  if (!reference) reference = points[0]!;
  return reference === last ? null : last.v - reference.v;
}

/** y-domain that always contains the data and the target band, at least `minSpan` wide, with 8% headroom. */
export function yDomain(values: number[], band: [number, number] | null, minSpan: number, clamp?: [number, number]): [number, number] {
  const all = [...values, ...(band ? band.filter(Number.isFinite) : [])];
  if (all.length === 0) return clamp ?? [0, 1];
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;
  if (clamp) {
    lo = Math.max(clamp[0], lo);
    hi = Math.min(clamp[1], hi);
  }
  return [lo, hi];
}
