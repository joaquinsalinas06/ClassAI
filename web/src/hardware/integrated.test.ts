import { describe, expect, it } from "vitest";
import { benches, benchAssembly } from "./benches";
import { analyze, parseAssembly } from "./model";
import { assemblyGeometry } from "./geometry";

const integrated=["nodo-acceso","nodo-ambiente","nodo-asistente"];
describe("integrated physical node proposals",()=>{
 it("round trips H–H and independent four-board references without supply shorts",()=>{
  for(const id of integrated){
   const a=benchAssembly(id),r=analyze(a),geo=assemblyGeometry(a);
   expect(parseAssembly(JSON.stringify(a))).toEqual(a);
   expect(a.wires.some(w=>w.jumper==="H–H")).toBe(true);
   expect(r.findings.filter(f=>f.level==="error"),id).toEqual([]);
   expect(r.connected("esp1:3V3","esp1:VIN")).toBe(false);
   expect(r.connected("esp1:3V3","esp1:GND")).toBe(false);
   expect(analyze({...a,wires:a.wires.map(w=>({...w,pending:undefined}))}).findings.filter(f=>f.level==="error"),id).toEqual([]);
   for(const w of a.wires){expect(geo.ends.has(w.from),`${id}/${w.from}`).toBe(true);expect(geo.ends.has(w.to),`${id}/${w.to}`).toBe(true);expect(w.bends).toBeDefined();}
  }
  expect(benches["nodo-asistente"]!.assembly.parts.filter(p=>p.definition==="breadboard400")).toHaveLength(1);
 });
 it("uses the integrated firmware pins and preserves LDR dividers and BL protection",()=>{
  const access=analyze(benchAssembly("nodo-acceso"));
  for(const [pin,terminal] of [[18,"SCK"],[19,"MISO"],[23,"MOSI"],[5,"SS"]])expect(access.connected(`esp1:GPIO${pin}`,`nfc1:${terminal}`)).toBe(true);
  for(const id of ["nodo-ambiente","nodo-asistente"]){
   const a=analyze(benchAssembly(id));
   expect(a.connected("esp1:3V3","ldr1:1")).toBe(true);
   expect(a.connected("esp1:GPIO35","ldr1:2")).toBe(true);
   expect(a.connected("rLight:1","ldr1:2")).toBe(true);
   expect(a.connected("rLight:2","esp1:GND")).toBe(true);
   expect(a.connected("rLight:1","rLight:2")).toBe(false);
  }
  const assistant=analyze(benchAssembly("nodo-asistente"));
  for(const [pin,terminal] of [[18,"SCK"],[19,"WS"],[34,"SD"]])expect(assistant.connected(`esp1:GPIO${pin}`,`mic1:${terminal}`)).toBe(true);
  expect(assistant.connected("esp1:GPIO21","rSD:1")).toBe(true);
  expect(assistant.connected("rSD:2","esp1:GND")).toBe(true);
  expect(assistant.connected("rBL:1","rBL:2")).toBe(false);
  expect(assistant.connected("p4:LP1","bb:LP1")).toBe(true);
  expect(assistant.connected("p4:RP1","bb:RP1")).toBe(false); // power bridge remains conditional.
  expect(benchAssembly("nodo-asistente").parts[0]?.pinout).toBe("devkit38-reference");
 });
 it("validates footprints and occupancy on the second board separately",()=>{
  const a=benchAssembly("nodo-asistente");
  expect(()=>parseAssembly(JSON.stringify({...a,parts:a.parts.map(p=>p.id==="rSD"?{...p,boardId:"missing"}:p)}))).toThrow();
  a.wires.push({id:"occupy",from:"p4:C8",to:"p4:A25",note:"invalid collision"});
  expect(analyze(a).findings.some(f=>f.level==="error"&&f.text.includes("p4:C8"))).toBe(true);
 });
});
