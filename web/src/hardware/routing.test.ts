import { describe, expect, it } from "vitest";
import example from "./example.json";
import { analyze, parseAssembly, terminals } from "./model";
import { assemblyGeometry } from "./geometry";
import { routingMetrics } from "./routing";
const fresh = () => parseAssembly(JSON.stringify(example));

describe("compact wiring", () => {
  it("preserves every component net from the previous 12-wire circuit", () => {
    const compact = fresh(), previous = fresh();
    previous.parts = previous.parts.map(p => ({ ...p, holes: { ...p.holes } }));
    previous.wires = [
      ["esp1:GND", "bb:LN28"], ["bb:LN2", "bb:RN2"], ["esp1:3V3", "bb:LP29"], ["esp1:VIN", "bb:RP29"],
      ["bb:LN5", "dht1:GND"], ["bb:LP5", "dht1:VCC"], ["dht1:DATA", "bb:A8"], ["esp1:GPIO4", "bb:B8"],
      ["bb:LP8", "bb:J8"], ["bb:RN20", "pir1:GND"], ["bb:RP20", "pir1:VCC"], ["pir1:OUT", "esp1:GPIO27"],
    ].map(([from, to], i) => ({ id: `old${i}`, from: from!, to: to!, note: "" }));
    const before = analyze(previous), after = analyze(compact);
    for (const x of terminals(compact)) for (const y of terminals(compact)) expect(after.connected(x, y), `${x} / ${y}`).toBe(before.connected(x, y));
    expect(after.findings.filter(f => f.level === "error")).toEqual([]);
    expect(after.connected("bb:RP1", "esp1:VIN")).toBe(false);
    expect(after.connected("bb:RN1", "esp1:GND")).toBe(false);
  });
  it("reduces diagram length and turns without confusing pixels with cable size", () => {
    const metrics = routingMetrics(fresh());
    expect(metrics).toEqual({ cables: 10, turns: 20, length: 4144, explicit: true });
    expect(metrics.length).toBeLessThan(7420);
    expect(metrics.turns).toBeLessThan(38);
  });
  it("preserves legacy layout and rejects unknown layouts", () => {
    const a = fresh(); delete a.layout;
    expect(parseAssembly(JSON.stringify(a)).layout).toBeUndefined();
    expect(assemblyGeometry(a).ends.get("esp1:GPIO4")).toEqual([308, 438]);
    expect(assemblyGeometry(fresh()).ends.get("esp1:GPIO4")).toEqual([548, 438]);
    expect(() => parseAssembly(JSON.stringify({ ...a, layout: "unknown" }))).toThrow();
    delete a.wires[0]!.bends;
    expect(routingMetrics(a).explicit).toBe(false);
  });
});
