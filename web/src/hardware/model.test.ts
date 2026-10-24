import { describe, expect, it } from "vitest";
import example from "./example.json";
import { analyze, parseAssembly, recordRevision, type Assembly } from "./model";
const fresh = () => parseAssembly(JSON.stringify(example));
const wire = (a: Assembly, from: string, to: string) => a.wires.push({ id: `test${a.wires.length}`, from, to, note: "" });
const errors = (a: Assembly) => analyze(a).findings.filter(f => f.level === "error").map(f => f.text).join(" ");
describe("hardware assembly", () => {
  it("keeps DHT data directly connected and its pull-up separate from supply", () => {
    const a = fresh(), result = analyze(a);
    expect(result.connected("dht1:DATA", "esp1:GPIO4")).toBe(true);
    for (const hole of ["A8", "B8", "C8", "D8", "E8"]) expect(result.connected("dht1:DATA", `bb:${hole}`)).toBe(true);
    expect(result.connected("dht1:DATA", "esp1:3V3")).toBe(false);
    expect(result.connected("dht1:VCC", "esp1:3V3")).toBe(true);
    a.wires = a.wires.filter(w => !(w.from === "bb:LP8" && w.to === "bb:J8"));
    expect(analyze(a).connected("dht1:VCC", "esp1:3V3")).toBe(true);
    expect(analyze(a).connected("dht1:DATA", "esp1:GPIO4")).toBe(true);
  });
  it("shares row halves, but isolates the gap and neighboring rows", () => {
    const result = analyze(fresh());
    expect(result.connected("bb:A2", "bb:E2")).toBe(true);
    expect(result.connected("bb:A2", "bb:F2")).toBe(false);
    expect(result.connected("bb:A2", "bb:A3")).toBe(false);
  });
  it("completes reference power without declaring physical verification", () => {
    const a = fresh();
    expect(errors(a)).toBe("");
    expect(analyze(a).findings.some(f => f.text.includes("pir1:VCC: sin conexión"))).toBe(false);
    expect(analyze(a).findings.some(f => f.text.includes("dht1:VCC: sin conexión"))).toBe(false);
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
    const a = fresh(); wire(a, "esp1:3V3", "esp1:GND");
    expect(errors(a)).toContain("Alimentación en conflicto");
    const b = fresh(); b.parts.push({ ...b.parts[0]!, id: "esp2", holes: {} });
    wire(b, "esp1:3V3", "esp2:3V3"); expect(errors(b)).toContain("Alimentación en conflicto");
  });
  it("flags occupied holes and shorted resistors, without treating resistance as a wire", () => {
    const a = fresh(); a.parts.push({ id: "r2", definition: "resistor", inventory: "C-01", holes: { "1": "C20", "2": "G20" } });
    expect(analyze(a).connected("r2:1", "r2:2")).toBe(false);
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
  it("models power rail sides and splits independently from signal strips", () => {
    const a=fresh(), r=analyze(a);
    expect(r.connected("bb:LP1","bb:LP30")).toBe(true);
    expect(r.connected("bb:LP1","bb:RP1")).toBe(false);
    expect(r.connected("esp1:3V3","dht1:VCC")).toBe(true);
    expect(r.connected("esp1:VIN","pir1:VCC")).toBe(true);
    expect(r.connected("esp1:GND_L","pir1:GND")).toBe(true);
    a.board.splitRails=true;
    expect(analyze(a).connected("bb:LP1","bb:LP30")).toBe(false);
    expect(analyze(a).connected("esp1:3V3","dht1:VCC")).toBe(false);
  });
  it("roundtrips cable colors, routes and resistor values, and rejects invalid metadata", () => {
    const a=fresh();expect(parseAssembly(JSON.stringify(a))).toEqual(a);
    a.wires[0]!.bends=[[Number.NaN,4]];expect(()=>parseAssembly(JSON.stringify(a))).toThrow();
    const b=fresh();b.parts.at(-1)!.resistance=-1;expect(()=>parseAssembly(JSON.stringify(b))).toThrow();
    const c=fresh();c.wires[0]!.to="bb:LP31";expect(()=>parseAssembly(JSON.stringify(c))).toThrow();
  });
  it("rejects 5 V on the DHT11 reference supply without conflating the pull-up with a short", () => {
    const a=fresh();a.wires=a.wires.filter(w=>w.id!=="w6");
    wire(a,"esp1:VIN","dht1:VCC");
    expect(errors(a)).toContain("tensión de referencia 3.3 V incompatible");
    expect(errors(fresh())).toBe("");
  });
  it("reports floating supplies when continuous rails are replaced with split rails", () => {
    const a=fresh();a.board.splitRails=true;
    expect(analyze(a).findings.some(f=>f.text.includes("dht1:VCC: alimentación sin fuente"))).toBe(true);
    expect(analyze(a).findings.some(f=>f.text.includes("pir1:VCC: alimentación sin fuente"))).toBe(false);
  });
  it("keeps older v1 drafts readable without new display metadata", () => {
    const a=fresh();a.board={rows:30};a.wires=[];a.parts=a.parts.filter(p=>p.definition!=="resistor");
    for(const d of a.catalog) for(const p of d.pins){delete p.required;delete p.bus;}
    expect(parseAssembly(JSON.stringify(a)).name).toBe(a.name);
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
