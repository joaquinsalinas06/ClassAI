import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { benches, assemblyBank, benchAssembly } from "./benches";
import { analyze, parseAssembly, terminals } from "./model";
import { assemblyGeometry } from "./geometry";
import { routingMetrics } from "./routing";
import { nfcAssembly } from "./nfc";
import example from "./example.json";

describe("physical banks and compatibility",()=>{
 it("round trips every physical bank with drawable contacts and unique holes",()=>{
  for(const [id,g] of Object.entries(benches)) {
   const a=parseAssembly(JSON.stringify(g.assembly)), geo=assemblyGeometry(a);
   expect(assemblyBank(a)).toBe(id);
   expect(analyze(a).findings.filter(f=>f.level==="error"),id).toEqual([]);
   for(const w of a.wires) {expect(geo.ends.has(w.from),`${id}/${w.id} source`).toBe(true);expect(geo.ends.has(w.to)).toBe(true);expect(w.jumper??w.note).not.toContain("H–H");}
   if(!["nfc","ambiente","dht11","pir"].includes(id)&&a.wires.length)expect(routingMetrics(a).explicit).toBe(true);
  }
 });
 it("routes new cables outside the ESP32 PCB body",()=>{
  for(const id of ["led-boton","leds","ruido","microfono"]) {
   const a=benches[id]!.assembly,{ends}=assemblyGeometry(a);
   for(const w of a.wires) {
    const points=[ends.get(w.from)!,...w.bends!,ends.get(w.to)!];
    for(let i=1;i<points.length;i++) {
     const [x1,y1]=points[i-1]!, [x2,y2]=points[i]!;
     const through=y1===y2 ? y1>140&&y1<610&&Math.min(x1,x2)<300&&Math.max(x1,x2)>70 : x1>70&&x1<300&&Math.min(y1,y2)<610&&Math.max(y1,y2)>140;
     expect(through,`${id}/${w.id}`).toBe(false);
    }
   }
  }
 });
 it("keeps all NFC component nets unchanged",()=>{
  const a=analyze(nfcAssembly),b=analyze(benches.nfc!.assembly);
  for(const x of terminals(nfcAssembly))for(const y of terminals(nfcAssembly))expect(b.connected(x,y)).toBe(a.connected(x,y));
 });
 it("recovers legacy bank identity and returns independent drafts",()=>{
  expect(assemblyBank(parseAssembly(JSON.stringify(example)))).toBe("ambiente");
  expect(assemblyBank(nfcAssembly)).toBe("nfc");
  const a=benchAssembly("led-boton");a.parts[0]!.inventory="edited";expect(benchAssembly("led-boton").parts[0]!.inventory).not.toBe("edited");
 });
 it("keeps resistance in series, button pairs separate, and three LEDs independent",()=>{
  const a=analyze(benches["led-boton"]!.assembly);
  expect(a.connected("esp1:GPIO25","r1:1")).toBe(true);
  expect(a.connected("r1:2","led1:A")).toBe(true);
  expect(a.connected("r1:1","r1:2")).toBe(false);
  expect(a.connected("led1:K","esp1:GND")).toBe(true);
  expect(a.connected("button1:A1","button1:A2")).toBe(true);
  expect(a.connected("button1:A1","button1:B1")).toBe(false);
  expect(a.connected("button1:B1","esp1:GND")).toBe(true);
  const s=analyze(benches.leds!.assembly);
  for(const [i,pin] of [25,26,27].entries()) {expect(s.connected(`esp1:GPIO${pin}`,`r${i+1}:1`)).toBe(true);expect(s.connected(`r${i+1}:2`,`led${i+1}:A`)).toBe(true);}
 });
 it("does not include conditional wires in confirmed continuity",()=>{
  const a=benches.ruido!.assembly,r=analyze(a);
  expect(r.connected("module1:AO","esp1:GPIO34")).toBe(false);
  expect(r.connected("module1:VCC","esp1:3V3")).toBe(false);
  expect(r.findings.some(f=>f.text.includes("Confirmar tensión AO"))).toBe(true);
  const duplicate={...a,wires:[...a.wires,{id:"duplicate",from:"esp1:GND",to:"bb:A10",note:"",pending:"No conectar"}]};
  expect(analyze(duplicate).findings.some(f=>f.level==="error"&&f.text.includes("A10"))).toBe(true);
  const confirmed={...a,wires:a.wires.map(w=>({...w,pending:undefined}))};
  expect(analyze(confirmed).connected("module1:AO","esp1:GPIO34")).toBe(true);
 });
 it("isolates DHT and PIR footprints and preserves each intended net when conditions resolve",()=>{
  for(const id of ["dht11","pir"]) {
   const a=benches[id]!.assembly;
   expect(a.parts.some(p=>p.definition===(id==="dht11"?"pir":"dht11"))).toBe(false);
   const original=parseAssembly(JSON.stringify(example));
   const after=analyze({...a,wires:a.wires.map(w=>({...w,pending:undefined}))}),before=analyze(original);
   for(const x of terminals(a))for(const y of terminals(a))expect(after.connected(x,y),`${id}:${x}/${y}`).toBe(before.connected(x,y));
  }
 });
 it("keeps firmware assignments aligned with physical signals",()=>{
  for(const [id,sketch,pins] of [["ruido","sound_bench",[34]],["microfono","inmp441_bench",[26,25,33]],["leds","status_led_bench",[25,26,27]]] as const) {
   const src=readFileSync(new URL(`../../../firmware/${sketch}/${sketch}.ino`,import.meta.url),"utf8");
   const a=benches[id]!.assembly,r=analyze({...a,wires:a.wires.map(w=>({...w,pending:undefined}))});
   for(const pin of pins){expect(src).toMatch(new RegExp(`= ?${pin}\\b`));expect(a.wires.some(w=>w.from===`esp1:GPIO${pin}`||w.to===`esp1:GPIO${pin}`)).toBe(true);}
   if(id==="microfono")for(const [pin,name]of [[26,"SCK"],[25,"WS"],[33,"SD"]])expect(r.connected(`esp1:GPIO${pin}`,`module1:${name}`)).toBe(true);
  }
 });
 it("rejects malformed optional metadata and footprints",()=>{
  const a=benchAssembly("led-boton");
  for(const value of [{...a,bankId:"../bad"},{...a,wires:[{...a.wires[0],jumper:"H–H"}]},{...a,parts:[{...a.parts[0],placement:{x:NaN,y:0}}]}])expect(()=>parseAssembly(JSON.stringify(value))).toThrow();
 });
});
