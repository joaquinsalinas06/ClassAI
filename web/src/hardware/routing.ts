import type { Assembly } from "./model";
import { assemblyGeometry } from "./geometry";

// Drawing-space comparison only: no real cable lengths or electrical certification.
export function routingMetrics(a: Assembly) {
  const { ends } = assemblyGeometry(a);
  let turns = 0, length = 0;
  let explicit = true;
  for (const w of a.wires) {
    const from = ends.get(w.from), to = ends.get(w.to);
    if (!from || !to || w.bends === undefined) { explicit = false; continue; }
    const points = [from, ...w.bends, to].filter((p, i, ps) => i === 0 || p[0] !== ps[i - 1]![0] || p[1] !== ps[i - 1]![1]);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]!, next = points[i]!;
      length += Math.hypot(next[0] - prev[0], next[1] - prev[1]);
      if (i > 1) {
        const before = points[i - 2]!, ax = prev[0] - before[0], ay = prev[1] - before[1], bx = next[0] - prev[0], by = next[1] - prev[1];
        if (ax * by !== ay * bx || ax * bx + ay * by < 0) turns++;
      }
    }
  }
  return { cables: a.wires.length, turns, length: Math.round(length), explicit };
}
