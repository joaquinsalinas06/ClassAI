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
   const a=benches[id]!.assembly,{ends,origin}=assemblyGeometry(a),esp=[...origin.values()].find(p=>p.type==="esp32")!;
   for(const w of a.wires) {
    const points=[ends.get(w.from)!,...w.bends!,ends.get(w.to)!];
    for(let i=1;i<points.length;i++) {
     const [x1,y1]=points[i-1]!, [x2,y2]=points[i]!;
     const through=y1===y2 ? y1>esp.y&&y1<esp.y+470&&Math.min(x1,x2)<esp.x+230&&Math.max(x1,x2)>esp.x : x1>esp.x&&x1<esp.x+230&&Math.min(y1,y2)<esp.y+470&&Math.max(y1,y2)>esp.y;
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
 it("connects the B-08 3V3, GND and AO34 recipe",()=>{
  const a=benches.ruido!.assembly,r=analyze(a);
  expect(r.connected("module1:AO","esp1:GPIO34")).toBe(true);
  expect(r.connected("module1:VCC","esp1:3V3")).toBe(true);
  expect(r.connected("module1:G","esp1:GND")).toBe(true);
  const duplicate={...a,wires:[...a.wires,{id:"duplicate",from:"esp1:GND",to:"bb:A10",note:"",pending:"No conectar"}]};
  expect(analyze(duplicate).findings.some(f=>f.level==="error"&&f.text.includes("A10"))).toBe(true);
 });
 it("isolates DHT and PIR footprints and preserves each intended net when conditions resolve",()=>{
  for(const id of ["dht11","pir"]) {
   const a=benches[id]!.assembly;
   expect(a.parts.some(p=>p.definition===(id==="dht11"?"pir":"dht11"))).toBe(false);
   const original=parseAssembly(JSON.stringify(example));
   original.parts=original.parts.filter(p=>p.definition!=="resistor");original.wires=original.wires.filter(w=>!(w.from==="bb:LP8"&&w.to==="bb:J8"));
   const after=analyze({...a,wires:a.wires.map(w=>({...w,pending:undefined}))}),before=analyze(original);
   const shared=terminals(a).filter(t=>!t.startsWith("ps1:")&&t!=="esp1:VIN"&&t!=="pir1:VCC");
   for(const x of shared)for(const y of shared)expect(after.connected(x,y),`${id}:${x}/${y}`).toBe(before.connected(x,y));
   if(id==="pir") {expect(after.connected("esp1:VIN","pir1:VCC")).toBe(true);expect(a.parts.some(p=>p.id==="ps1")).toBe(false);}
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

describe("complete reference circuits",()=>{
 const intended=(id:string)=>{const a=benches[id]!.adaptation?.assembly ?? benchAssembly(id);return {a,r:analyze({...a,wires:a.wires.map(w=>({...w,pending:undefined}))})};};
 it("contains real wires, pin-numbered components and firmware for all available output benches",()=>{
  for(const id of ["matriz","buzzer","ventilador","audio-salida","pantalla"]) {
   const g=benches[id]!;expect(g.firmware).toBeTruthy();expect(g.assembly.wires.length).toBeGreaterThan(1);
   expect(analyze(g.assembly).findings.filter(f=>f.level==="error")).toEqual([]);
   expect(intended(id).r.findings.filter(f=>f.level==="error"),id).toEqual([]);
   expect(g.blockers.join(" ").length).toBeGreaterThan(40);
  }
 });
 it("matches all three AHCT channels, power and unused input enables without bypassing the buffer",()=>{
  const {a,r}=intended("matriz");
  for(const [gpio,input,output,target]of [[13,"A1","Y1","DIN"],[14,"A2","Y2","CLK"],[27,"A3","Y3","CS"]]) {
   expect(r.connected(`esp1:GPIO${gpio}`,`u1:${input}`)).toBe(true);expect(r.connected(`u1:${output}`,`matrix1:${target}`)).toBe(true);
   expect(r.connected(`esp1:GPIO${gpio}`,`matrix1:${target}`)).toBe(false);
  }
  for(const pin of ["OE1","OE2","OE3","GND","A4"])expect(r.connected(`u1:${pin}`,"ps1:GND")).toBe(true);
  for(const pin of ["VCC","OE4"])expect(r.connected(`u1:${pin}`,"ps1:PLUS")).toBe(true);
  expect(a.wires.some(w=>[w.from,w.to].includes("matrix1:DOUT"))).toBe(false);
  expect(a.parts.find(p=>p.id==="u1")!.holes).toMatchObject({OE1:"E10",GND:"E16",VCC:"F10",Y3:"F16"});
 });
 it("isolates GPIO from both transistor collector loads and retains series base/pull-down resistors",()=>{
  for(const [id,gpio,load]of [["buzzer",17,"bz1:MINUS"],["ventilador",26,"relay1:IN1"]]as const){
   const {r}=intended(id);expect(r.connected(`esp1:GPIO${gpio}`,"rb:1")).toBe(true);expect(r.connected("rb:2","q1:B")).toBe(true);
   expect(r.connected("rp:1","q1:B")).toBe(true);expect(r.connected("rp:2","esp1:GND")).toBe(true);expect(r.connected("q1:E","esp1:GND")).toBe(true);
   expect(r.connected("q1:C",load)).toBe(true);expect(r.connected(`esp1:GPIO${gpio}`,load)).toBe(false);
  }
  const {r}=intended("buzzer");expect(r.connected("d1:A","bz1:MINUS")).toBe(true);expect(r.connected("d1:K","bz1:PLUS")).toBe(true);
 });
 it("keeps motor power off protoboard, keeps COM/NO distinct and connects suppression across the fan",()=>{
  const {a,r}=intended("ventilador");
  expect(r.connected("ps1:PLUS","relay1:COM1")).toBe(true);expect(r.connected("relay1:NO1","fan1:PLUS")).toBe(true);
  expect(r.connected("ps1:PLUS","fan1:PLUS")).toBe(false);expect(r.connected("fan1:MINUS","ps1:GND")).toBe(true);
  expect(r.connected("d2:K","fan1:PLUS")).toBe(true);expect(r.connected("d2:A","fan1:MINUS")).toBe(true);
  for(const w of a.wires.filter(w=>w.from.startsWith("fan1:")||w.to.startsWith("fan1:")))expect(`${w.from} ${w.to}`).not.toContain("bb:");
  expect(r.connected("esp1:VIN","ps1:PLUS")).toBe(false);expect(r.connected("esp1:3V3","ps1:PLUS")).toBe(false);
 });
 it("uses a differential speaker pair, shutdown pull-down and joint-profile audio pins",()=>{
  const {r}=intended("audio-salida");for(const [gpio,pin]of [[33,"BCLK"],[25,"LRC"],[22,"DIN"],[21,"SD"]])expect(r.connected(`esp1:GPIO${gpio}`,`amp1:${pin}`)).toBe(true);
  expect(r.connected("amp1:SPK_PLUS","speaker1:PLUS")).toBe(true);expect(r.connected("amp1:SPK_MINUS","speaker1:MINUS")).toBe(true);
  for(const pin of ["SPK_PLUS","SPK_MINUS"])expect(r.connected(`amp1:${pin}`,"esp1:GND")).toBe(false);
  expect(r.connected("rsd:1","amp1:SD")).toBe(true);expect(r.connected("rsd:2","esp1:GND")).toBe(true);
 });
 it("keeps backlight current limiting in series and models PIR USB 5 V without an invented source",()=>{
  const {r}=intended("pantalla");expect(r.connected("esp1:3V3","rbl:1")).toBe(true);expect(r.connected("rbl:2","tft1:BL")).toBe(true);expect(r.connected("esp1:3V3","tft1:BL")).toBe(false);
  for(const id of ["ambiente","pir"]){const a=benchAssembly(id),p=analyze({...a,wires:a.wires.map(w=>({...w,pending:undefined}))});expect(p.connected("esp1:VIN","pir1:VCC")).toBe(true);expect(a.parts.some(part=>part.id==="ps1")).toBe(false);}
 });
});

describe("readable minimal assemblies",()=>{
 it("connects audio male headers through distinct breadboard contacts with only M–H and M–M jumpers",()=>{
  const a=benchAssembly("audio-salida");
  expect(a.wires.filter(w=>w.jumper==="M–H")).toHaveLength(12);
  expect(a.wires.filter(w=>w.jumper==="M–M")).toHaveLength(1);
  for(const w of a.wires.filter(w=>w.jumper==="M–H"))expect(Number(w.from.startsWith("bb:"))+Number(w.to.startsWith("bb:")),w.id).toBe(1);
  for(const row of [6,10,14,18,22]){
   expect(a.wires.some(w=>w.from===`bb:H${row}`||w.to===`bb:H${row}`)).toBe(true);
   expect(a.wires.some(w=>w.from===`bb:J${row}`||w.to===`bb:J${row}`)).toBe(true);
  }
  expect(analyze(a).findings.filter(f=>f.level==="error")).toEqual([]);
  const speaker=a.wires.filter(w=>w.jumper==="altavoz");expect(speaker).toHaveLength(2);
  for(const w of speaker)expect(w.note).toContain("adaptador soldado");
 });
 it("preserves every LED/button terminal pair when adding the nearby ground rail bridge",()=>{
  const a=benchAssembly("led-boton"),old=structuredClone(a);
  old.parts.find(p=>p.id==="button1")!.holes={A1:"E18",A2:"E20",B1:"F18",B2:"F20"};
  old.parts.find(p=>p.id==="r1")!.holes={"1":"C8","2":"G8"};old.parts.find(p=>p.id==="led1")!.holes={A:"H8",K:"H11"};
  old.wires=[["esp1:GND","bb:LN28"],["esp1:GPIO25","bb:A8"],["bb:J11","bb:LN11"],["esp1:GPIO32","bb:A18"],["bb:J18","bb:LN18"]].map(([from,to],i)=>({id:`old${i}`,from:from!,to:to!,note:""}));
  const before=analyze(old),after=analyze(a);
  for(const x of terminals(a))for(const y of terminals(a))expect(after.connected(x,y),`${x}/${y}`).toBe(before.connected(x,y));
  expect(a.wires.find(w=>w.from==="bb:J8")?.to).toBe("bb:RN8");
  expect(a.wires.some(w=>w.from==="bb:LN30"&&w.to==="bb:RN30")).toBe(true);
  expect(routingMetrics(a).turns).toBeLessThan(15);
 });
 it("keeps proposed stages in compatibility while primary drawings stay direct",()=>{
  for(const id of ["matriz","buzzer","ventilador"]) {
   const g=benches[id]!;expect(g.assembly.parts.some(p=>["resistor","npn","ahct125"].includes(p.definition))).toBe(false);
   expect(g.adaptation).toBeTruthy();expect(g.assembly.wires.some(w=>w.pending)).toBe(false);
  }
  expect(benches.matriz!.assembly.parts.filter(p=>p.definition==="matriz")).toHaveLength(1);
 });
 it("shows the generic 5 V source only where the fan circuit needs it",()=>{
  for(const id of ["ambiente","pir","matriz","audio-salida"])expect(benches[id]!.assembly.parts.some(p=>p.definition==="supply5")).toBe(false);
  const a=benches.ventilador!.assembly;
  expect(a.parts.some(p=>p.definition==="supply5")).toBe(true);
  expect(a.wires.some(w=>w.from.startsWith("fan1:")||w.to.startsWith("fan1:"))).toBe(true);
  expect(a.wires.some(w=>w.pending)).toBe(false);
  expect(benches.ventilador!.expected).toContain("ventilador gira");
 });
 it("connects relay control and the complete COM-NO fan branch",()=>{
  const a=benches.ventilador!.assembly,r=analyze({...a,wires:a.wires.map(w=>({...w,pending:undefined}))});
  expect(r.connected("esp1:VIN","relay1:VCC")).toBe(true);
  expect(r.connected("esp1:VIN","relay1:IN2")).toBe(true);
  expect(r.connected("esp1:GND_L","relay1:GND")).toBe(true);
  expect(r.connected("esp1:GPIO26","relay1:IN1")).toBe(true);
  expect(r.connected("relay1:COM1","ps1:PLUS")).toBe(true);
  expect(r.connected("relay1:NO1","fan1:PLUS")).toBe(true);
  expect(r.connected("fan1:MINUS","ps1:GND")).toBe(true);
  expect(r.connected("relay1:NC1","fan1:PLUS")).toBe(false);
 });
 it("uses the UTEC three-pin DHT module's integrated pull-up instead of an extra breadboard resistor",()=>{
  for(const id of ["ambiente","dht11"])expect(benches[id]!.assembly.parts.some(p=>p.definition==="resistor")).toBe(false);
 });
 it("keeps every primary recipe complete instead of drawing dangling partial nets",()=>{
  const expected:Record<string,[string,string][]>= {
   ambiente:[["esp1:3V3","dht1:VCC"],["esp1:GND","dht1:GND"],["esp1:GPIO4","dht1:DATA"],["esp1:VIN","pir1:VCC"],["esp1:GND","pir1:GND"],["esp1:GPIO27","pir1:OUT"]],
   dht11:[["esp1:3V3","dht1:VCC"],["esp1:GND","dht1:GND"],["esp1:GPIO4","dht1:DATA"]],
   pir:[["esp1:VIN","pir1:VCC"],["esp1:GND","pir1:GND"],["esp1:GPIO27","pir1:OUT"]],
   ruido:[["esp1:3V3","module1:VCC"],["esp1:GND","module1:G"],["esp1:GPIO34","module1:AO"]],
   microfono:[["esp1:3V3","module1:VCC"],["esp1:GND","module1:GND"],["esp1:GPIO26","module1:SCK"],["esp1:GPIO25","module1:WS"],["esp1:GPIO33","module1:SD"],["esp1:GND","module1:LR"]],
   matriz:[["esp1:VIN","matrix1:VCC"],["esp1:GND_L","matrix1:GND"],["esp1:GPIO13","matrix1:DIN"],["esp1:GPIO14","matrix1:CLK"],["esp1:GPIO27","matrix1:CS"]],
   buzzer:[["esp1:GPIO17","bz1:PLUS"],["esp1:GND","bz1:MINUS"]],
   ventilador:[["esp1:VIN","relay1:VCC"],["esp1:GND_L","relay1:GND"],["esp1:GPIO26","relay1:IN1"],["ps1:PLUS","relay1:COM1"],["relay1:NO1","fan1:PLUS"],["fan1:MINUS","ps1:GND"]],
   "audio-salida":[["esp1:VIN","amp1:VIN"],["esp1:GND_L","amp1:GND"],["esp1:GPIO33","amp1:BCLK"],["esp1:GPIO25","amp1:LRC"],["esp1:GPIO22","amp1:DIN"],["esp1:GPIO21","amp1:SD"],["amp1:SPK_PLUS","speaker1:PLUS"],["amp1:SPK_MINUS","speaker1:MINUS"]],
   pantalla:[["esp1:3V3","tft1:VCC"],["esp1:GND","tft1:GND"],["esp1:GPIO14","tft1:SCL"],["esp1:GPIO23","tft1:SDA"],["esp1:GPIO26","tft1:RST"],["esp1:GPIO27","tft1:DC"],["esp1:GPIO5","tft1:CS"]],
  };
  for(const [id,pairs] of Object.entries(expected)){
   const a=benches[id]!.assembly,r=analyze(a);
   expect(a.wires.some(w=>w.pending),id).toBe(false);
   for(const [from,to] of pairs)expect(r.connected(from,to),`${id}: ${from} → ${to}`).toBe(true);
  }
 });
});
