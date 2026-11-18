import { describe, expect, it } from "vitest";
import { activity, appendZoneSample, averageLines, buildZones, emptyZoneLive, mergeLive } from "./zones";

const at = (min: number, s = 0) => Date.UTC(2026, 10, 17, 23, min, s);

describe("zones", () => {
  it("averages two nodes sampled at different instants and passes one node through", () => {
    const a = [{ t: at(0), v: 40 }, { t: at(0, 20), v: 50 }];
    const b = [{ t: at(0, 10), v: 80 }];
    expect(averageLines([a, b])).toEqual([{ t: at(0), v: 40 }, { t: at(0, 10), v: 60 }, { t: at(0, 20), v: 65 }]);
    expect(averageLines([a, []])).toBe(a);
    expect(averageLines([])).toEqual([]);
    // a node silent for longer than maxGap leaves the average
    expect(averageLines([[{ t: at(0), v: 10 }], [{ t: at(5), v: 90 }]]).at(-1)).toEqual({ t: at(5), v: 90 });
  });

  it("turns presence into a continuous rolling % combining both PIRs", () => {
    const entrance = [0, 1, 2, 3].map((m) => ({ t: at(m), v: m >= 2 ? 1 : 0 }));
    const interior = [{ t: at(3), v: 0 }, { t: at(3, 30), v: 1 }];
    const out = activity([entrance, interior], 5);
    expect(out.map((p) => p.t)).toEqual([at(0), at(1), at(2), at(3)]);
    expect(out.map((p) => Math.round(p.v))).toEqual([0, 0, 33, 44]); // minute 3: mean(1, 0.5)=75; window (0+0+100+75)/4
    expect(activity([entrance], 1).map((p) => p.v)).toEqual([0, 0, 100, 100]);
  });

  it("merges minute backfill with live samples and ignores invalid values", () => {
    expect(mergeLive([{ t: at(0), v: 1 }, { t: at(1), v: 2 }], [{ t: at(1, 30), v: 3 }])).toEqual([{ t: at(0), v: 1 }, { t: at(1, 30), v: 3 }]);
    let live = appendZoneSample(emptyZoneLive(), "access", at(2), 0.45, true);
    live = appendZoneSample(live, "access", at(2, 5), null, null);
    expect(live.light.access).toEqual([{ t: at(2), v: 45 }]);
    expect(live.presence.access).toEqual([{ t: at(2), v: 1 }]);
    const zones = buildZones({
      room: "l201", start: "", end: "",
      zones: [{ device: "l201-access", role: "access", light: [{ bucket_start: "2026-11-17 23:00", samples: 3, min: 0.4, max: 0.6, avg: 0.5 }], presence: [] },
        { device: "l201-environment", role: "environment", light: [], presence: [{ bucket_start: "2026-11-17 23:00", samples: 4, min: 0, max: 1, avg: 0.25 }] }],
    }, live);
    expect(zones.lines.light.map((l) => l.label)).toEqual(["Acceso"]);
    expect(zones.light).toEqual([{ t: at(0), v: 50 }, { t: at(2), v: 45 }]); // one node: the average is that line
    expect(zones.lines.motion.map((l) => l.label)).toEqual(["Entrada", "Interior"]);
    expect(zones.motion.at(-1)?.t).toBe(at(2));
  });
});
