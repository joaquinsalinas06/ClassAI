import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { nfcAssembly, nfcConnections } from "./nfc";
import { analyze, parseAssembly, recordRevision, terminals } from "./model";
import { assemblyGeometry } from "./geometry";
import { pn532SpiFrontCCW } from "./pinouts";
import { routingMetrics } from "./routing";
const fresh = () => parseAssembly(JSON.stringify(nfcAssembly));

describe("PN532 physical assembly", () => {
  it("preserves exactly the six direct nets using twelve distinct breadboard contacts", () => {
    const a = fresh(), direct = fresh();
    direct.wires = nfcConnections.map((c,i)=>({ id:`direct-${i}`, from:`esp1:${c.esp}`, to:`nfc1:${c.pin}`, note:"reference only" }));
    const actual = analyze(a), expected = analyze(direct);
    for (const x of terminals(a)) for (const y of terminals(a)) expect(actual.connected(x,y),`${x}/${y}`).toBe(expected.connected(x,y));
    expect(actual.findings.filter(f=>f.level==="error")).toEqual([]);
    expect(a.wires).toHaveLength(12);
    expect(a.wires.every(w=>w.from.startsWith("bb:") !== w.to.startsWith("bb:"))).toBe(true);
    expect(new Set(a.wires.flatMap(w=>[w.from,w.to]).filter(e=>e.startsWith("bb:"))).size).toBe(12);
    for (const c of nfcConnections) {
      expect(actual.connected(`bb:${c.espHole}`,`bb:${c.moduleHole}`)).toBe(true);
      if (c.espHole.startsWith("A")) expect(actual.connected(`bb:${c.espHole}`,`bb:F${c.espHole.slice(1)}`)).toBe(false);
      for (const rail of ["RP","RN"]) expect(actual.connected(`bb:${rail}1`,`esp1:${c.esp}`)).toBe(false);
    }
    for (const pin of ["IRQ","RSTO"]) expect(a.wires.some(w=>[w.from,w.to].includes(`nfc1:${pin}`))).toBe(false);
    expect(actual.findings.some(f=>f.text.includes("sin conexión propuesta"))).toBe(false);
  });
  it("keeps neighboring positive/negative rails separate and works within split upper halves", () => {
    const a=fresh();a.board.splitRails=true;
    const result=analyze(a);
    expect(result.connected("esp1:3V3","nfc1:VCC")).toBe(true);
    expect(result.connected("esp1:GND","nfc1:GND")).toBe(true);
    expect(result.connected("bb:LP2","bb:LN2")).toBe(false);
    expect(result.connected("bb:LP2","bb:LP16")).toBe(false);
    expect(result.connected("bb:LN4","bb:LN16")).toBe(false);
    expect(result.findings.filter(f=>f.level==="error")).toEqual([]);
    a.wires.push({id:"short-rails",from:"bb:LP3",to:"bb:LN3",note:"invalid short for test"});
    expect(analyze(a).findings.some(f=>f.level==="error"&&f.text.includes("Alimentación"))).toBe(true);
  });
  it("matches actual firmware SPI pins and logical catalog routing", () => {
    const firmware = readFileSync(new URL("../../../firmware/nfc_bench/nfc_bench.ino", import.meta.url),"utf8");
    for (const [name,value] of [["SCK",18],["MISO",19],["MOSI",23],["SS",5]] as const) {
      expect(firmware).toContain(`${name}_PIN = ${value}`);
      expect(nfcConnections.find(c=>c.pin===name)?.esp).toBe(`GPIO${value}`);
    }
    expect(nfcConnections.find(c=>c.pin==="VCC")?.esp).toBe("3V3");
    const metrics = routingMetrics(fresh());
    expect(metrics.explicit).toBe(true);
    expect(metrics.cables).toBe(12);
    expect(metrics.turns).toBe(24);
  });
  it("uses the manual front-face pin order rotated counterclockwise", () => {
    expect(pn532SpiFrontCCW).toEqual(["RSTO","IRQ","GND","VCC","SS","MOSI","MISO","SCK"]);
    const {ends}=assemblyGeometry(fresh());
    for (let i=1;i<pn532SpiFrontCCW.length;i++) expect(ends.get(`nfc1:${pn532SpiFrontCCW[i]}`)![1]).toBeGreaterThan(ends.get(`nfc1:${pn532SpiFrontCCW[i-1]}`)![1]);
  });
  it("detects a short and wrong SPI function, and round-trips with revision history", () => {
    const a=fresh();
    a.wires[2]!.to="bb:LP14";
    expect(analyze(a).findings.some(f=>f.level==="error"&&f.text.includes("Alimentación"))).toBe(true);
    const swapped=fresh();swapped.wires[4]!.from="esp1:GPIO19";
    expect(analyze(swapped).findings.some(f=>f.text.includes("Funciones de señal incompatibles"))).toBe(true);
    const saved=recordRevision(fresh(),"Diseño NFC, pendiente de prueba física");
    expect(parseAssembly(JSON.stringify(saved))).toEqual(saved);
    expect(parseAssembly(saved.revisions[0]!.snapshot).wires).toEqual(nfcAssembly.wires);
  });
});
