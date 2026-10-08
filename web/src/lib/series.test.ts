import { describe, expect, it } from "vitest";
import { annotations, appendPoint, deltaOver, excursions, toPoints, yDomain, type Point } from "./series";

const M = 60_000;
const pts = (values: number[]): Point[] => values.map((v, i) => ({ t: i * M, v }));

describe("series", () => {
  it("converts backend buckets to sorted points", () => {
    const points = toPoints([
      { bucket_start: "2026-10-14 14:05", samples: 60, min: 1, max: 3, avg: 2 },
      { bucket_start: "2026-10-14 14:00", samples: 60, min: 1, max: 3, avg: 1 },
    ]);
    expect(points.map((p) => p.v)).toEqual([1, 2]);
    expect(points[0]!.t).toBe(Date.UTC(2026, 9, 14, 14, 0));
  });

  it("appends, replaces same timestamp, inserts out of order and caps", () => {
    let p = pts([1, 2, 3]);
    p = appendPoint(p, { t: 3 * M, v: 4 });
    expect(p.map((x) => x.v)).toEqual([1, 2, 3, 4]);
    p = appendPoint(p, { t: 3 * M, v: 5 });
    expect(p.map((x) => x.v)).toEqual([1, 2, 3, 5]);
    p = appendPoint(p, { t: 1.5 * M, v: 9 });
    expect(p.map((x) => x.v)).toEqual([1, 2, 9, 3, 5]);
    expect(appendPoint(p, { t: 10 * M, v: 0 }, 3).map((x) => x.v)).toEqual([3, 5, 0]);
  });

  it("finds out-of-band runs, merges short gaps and keeps the peak", () => {
    const runs = excursions(pts([22, 25, 28, 29.5, 26, 27.5, 24, 22, 19, 22]), [21, 27]);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ side: "high", start: 2 * M, end: 5 * M, peak: { v: 29.5 } });
    expect(runs[0]!.magnitude).toBeCloseTo(2.5);
    expect(runs[1]).toMatchObject({ side: "low", peak: { v: 19 } });
    expect(excursions(pts([22, 23]), [21, 27])).toEqual([]);
    expect(excursions(pts([30]), null)).toEqual([]);
  });

  it("annotates the biggest excursions, else the maximum", () => {
    const a = annotations(pts([22, 28, 22, 31, 22, 18, 22]), [21, 27], 2);
    expect(a.map((x) => x.point.v)).toEqual([31, 18]);
    expect(annotations(pts([22, 24, 23]), [21, 27])).toEqual([{ point: { t: M, v: 24 }, kind: "max" }]);
  });

  it("computes deltas over a window", () => {
    expect(deltaOver(pts([20, 21, 22, 23, 24, 25]), 5 * M)).toBe(5);
    expect(deltaOver(pts([20, 21, 22]), 60 * M)).toBe(2);
    expect(deltaOver(pts([20]), M)).toBeNull();
  });

  it("builds a y-domain that contains data and band with a minimum span", () => {
    const [lo, hi] = yDomain([23, 23.2], [22, 27], 4);
    expect(lo).toBeLessThan(22);
    expect(hi).toBeGreaterThan(27);
    const [a, b] = yDomain([50, 50], null, 20);
    expect(b - a).toBeGreaterThanOrEqual(20);
    expect(yDomain([90, 100], [80, 100], 30, [0, 100])[1]).toBe(100);
  });
});
