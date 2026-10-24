import { describe, expect, it } from "vitest";
import example from "./example.json";
import { analyze, parseAssembly, recordRevision, type Assembly } from "./model";
const fresh = () => parseAssembly(JSON.stringify(example));
const wire = (a: Assembly, from: string, to: string) => a.wires.push({ id: `test${a.wires.length}`, from, to, note: "" });
const errors = (a: Assembly) => analyze(a).findings.filter(f => f.level === "error").map(f => f.text).join(" ");
describe("hardware assembly", () => {
  it("shares row halves, but isolates the gap and neighboring rows", () => {
    const result = analyze(fresh());
    expect(result.connected("esp1:GND", "bb:E2")).toBe(true);
    expect(result.connected("esp1:GND", "bb:F2")).toBe(false);
    expect(result.connected("esp1:GND", "bb:A3")).toBe(false);
  });
  it("keeps example power explicitly incomplete without inventing a physical PASS", () => {
    const a = fresh();
    expect(errors(a)).toBe("");
    expect(analyze(a).findings.some(f => f.text.includes("pir1:VCC: sin conexión"))).toBe(true);
    expect(analyze(a).findings.some(f => f.text.includes("dht1:VCC: sin conexión"))).toBe(true);
  });
  it("rejects sharing a GPIO between DHT and PIR, even through breadboard strips", () => {
    const a = fresh();
    wire(a, "esp1:GPIO4", "bb:A10"); wire(a, "pir1:OUT", "bb:E10");
    expect(errors(a)).toContain("Funciones de señal incompatibles");
  });
  it("namespaces GPIOs by ESP32 instance", () => {
    const a = fresh();
    a.parts.push({ ...a.parts[0]!, id: "esp2", holes: {} });
    expect(analyze(a).connected("esp1:GPIO4", "esp2:GPIO4")).toBe(false);
  });
  it("flags power shorts and accidentally joined source outputs", () => {
    const a = fresh(); wire(a, "esp1:3V3", "bb:D2");
    expect(errors(a)).toContain("Alimentación en conflicto");
    const b = fresh(); b.parts.push({ ...b.parts[0]!, id: "esp2", holes: {} });
    wire(b, "esp1:3V3", "esp2:3V3"); expect(errors(b)).toContain("Alimentación en conflicto");
  });
  it("flags occupied holes and shorted resistors, without treating resistance as a wire", () => {
    const a = fresh(); a.parts.push({ id: "r1", definition: "resistor", inventory: "C-01", holes: { "1": "C20", "2": "G20" } });
    expect(analyze(a).connected("r1:1", "r1:2")).toBe(false);
    a.parts.at(-1)!.holes["2"] = "D20";
    expect(errors(a)).toContain("resistencia queda puenteada");
    wire(a, "esp1:3V3", "bb:C20"); expect(errors(a)).toContain("mismo agujero");
  });
  it("validates input references, unique identifiers, limits and value types", () => {
    for (const mutate of [
      (a: Assembly) => { a.wires[0]!.to = "bb:K2"; },
      (a: Assembly) => { a.wires[0]!.to = "bb:A31"; },
      (a: Assembly) => { a.wires[0]!.to = "esp404:GND"; },
      (a: Assembly) => { a.parts.push(a.parts[0]!); },
      (a: Assembly) => { a.catalog[0]!.pins[0]!.voltage = Number.POSITIVE_INFINITY; },
      (a: Assembly) => { a.parts[0]!.holes = { unknown: "A1" }; },
    ]) { const a = fresh(); mutate(a); expect(() => parseAssembly(JSON.stringify(a))).toThrow(); }
    expect(() => parseAssembly("null")).toThrow();
    expect(() => parseAssembly("x".repeat(500001))).toThrow();
  });
  it("preserves snapshots without recursive revision history", () => {
    const a = fresh(), b = recordRevision(a, "Propuesta inicial; sin ensayo");
    b.wires.pop(); const c = recordRevision(b, "Retiré un cable");
    expect(parseAssembly(c.revisions[0]!.snapshot).wires).toEqual(a.wires);
    expect(parseAssembly(c.revisions[1]!.snapshot).revisions).toEqual([]);
    expect(a.revisions).toEqual([]);
    expect(() => recordRevision(a, "  ")).toThrow();
  });
});
