import { base, wire, route, resistor } from "./bench_layout";
import type { BenchGuide } from "./benches";
import type { Assembly, Definition } from "./model";
import { assemblyGeometry } from "./geometry";
const pin=(id:string,kind:"source"|"ground"|"power"|"signal"|"passive"="passive",voltage?:number)=>({id,kind,voltage,required:false});
function leftFacing(a:Assembly){a.parts.find(p=>p.id==="esp1")!.placement={x:1000,y:140};}
function power(a:Assembly,from:string,to:string,color:"orange"|"black",pending?:string){wire(a,from,to,color,pending);a.wires.at(-1)!.jumper="potencia";a.wires.at(-1)!.note=a.wires.at(-1)!.note.replace("M–H","potencia DC por bornes");}
const checks=["Identificar placa A-01/puerto, preservar respaldo y armar sin alimentación. B-02/NFC se conserva."];
function simple(a:Assembly,original:BenchGuide,blockers:string[]):BenchGuide {return {...original,profile:undefined,assembly:route(a),blockers:[...checks,...blockers],adaptation:original};}
export function simplifyBenches(benches:Record<string,BenchGuide>){
 // Put the board next to the GPIO edge actually used. Circuit nets remain unchanged.
 for(const id of ["led-boton","leds"]){
  const a=benches[id]!.assembly;leftFacing(a);
  for(const r of a.parts.filter(p=>p.definition==="resistor")){const row=r.holes["1"]!.slice(1);r.holes={"1":`G${row}`,"2":`C${row}`};}
  for(const l of a.parts.filter(p=>p.definition==="led")){const row=l.holes.A!.slice(1),ground=l.holes.K!.slice(1);l.holes={A:`B${row}`,K:`B${ground}`};}
  if(id==="led-boton")a.parts.find(p=>p.id==="button1")!.holes={A1:"E18",A2:"F18",B1:"E20",B2:"F20"};
  for(const w of a.wires){
   if(w.from==="esp1:GPIO32")w.to="bb:J18";
   if(w.from==="bb:J18"){w.from="bb:J20";w.to="bb:RN20";}
   if(w.from.startsWith("esp1:GPIO25")||id==="leds"&&w.from.startsWith("esp1:GPIO"))w.to=w.to.replace("bb:A","bb:J");
   if(w.from.startsWith("bb:J")&&!["bb:J18","bb:J20"].includes(w.from))w.from=w.from.replace("bb:J","bb:A");
  }
  for(const w of a.wires){
   if(w.from==="esp1:GND"){w.from="esp1:GND_L";w.to="bb:RN28";w.note="M–H negro: GND izquierdo del ESP32 al riel negativo derecho cercano RN28.";}
   if(w.from==="bb:J20"){w.to="bb:RN20";w.note="M–M negro: J20 al negativo derecho RN20, junto al pulsador.";}
  }
  wire(a,"bb:LN30","bb:RN30","black");a.wires.at(-1)!.note="M–M negro: puente corto LN30–RN30 para compartir masa entre rieles; no rodear ESP32 ni pulsador.";
  if(id==="led-boton") {
    a.parts.find(p=>p.id==="r1")!.holes={"1":"G14","2":"C14"};
    a.parts.find(p=>p.id==="led1")!.holes={A:"B14",K:"B17"};
    a.parts.find(p=>p.id==="button1")!.holes={A1:"E6",A2:"F6",B1:"E8",B2:"F8"};
    for(const w of a.wires){
      if(w.from==="esp1:GPIO25")w.to="bb:J14";
      if(w.from==="esp1:GPIO32")w.to="bb:J6";
      if(w.from==="bb:A11"){w.from="bb:A17";w.to="bb:LN17";}
      if(w.from==="bb:J20"){w.from="bb:J8";w.to="bb:RN8";}
      w.note=`${w.jumper} · ${w.from} → ${w.to}. Montar sin USB; el pulsador está arriba y el LED debajo para mantener el orden de GPIO y evitar cruces.`;
    }
  }
  benches[id]!.assembly=route(a);
  // Separate lanes in the free gap: no signal crosses the LED or another PCB.
  for(const w of a.wires)if(w.from.startsWith("esp1:GPIO")){
    const pin=Number(w.from.slice(9)),lane=pin===32?930:pin===25?900:870;
    const row=Number(w.to.slice(4));
    const y=168+(["EN","GPIO36","GPIO39","GPIO34","GPIO35","GPIO32","GPIO33","GPIO25","GPIO26","GPIO27","GPIO14","GPIO12","GPIO13","GND_L","VIN"].indexOf(w.from.slice(5)))*27;
    w.bends=[[lane,y],[lane,150+(row-1)*18]];
  }
 }
 for(const id of ["ambiente","dht11"]) {
   const a=benches[id]!.assembly;a.parts=a.parts.filter(p=>p.definition!=="resistor");
   a.wires=a.wires.filter(w=>!(w.from==="bb:LP8"&&w.to==="bb:J8"));
   const d=a.catalog.find(d=>d.id==="dht11")!;d.pending="Módulo DHT11 de tres pines del laboratorio UTEC, Anexo X: pull-up de 10 kΩ integrado y alimentación 3–5,5 V. Para ESP32 usar 3,3 V; cotejar +/OUT/−, no trasladar la orientación de otra foto.";
   for(const w of a.wires)if([w.from,w.to].includes("dht1:VCC")){w.pending=undefined;w.note="M–H rojo: + del módulo DHT11 a 3,3 V. Pull-up integrado, según guía UTEC aportada.";}
   a.note+=" Guía UTEC aportada: breakout DHT11 con pull-up integrado; se elimina R externa.";
   benches[id]!.blockers=benches[id]!.blockers.map(s=>s.replace("Confirmar B-03, alimentación y pull-up del breakout.","Cotejar etiquetas +/OUT/− del módulo DHT11 de laboratorio, alimentado a 3,3 V.").replace("Confirmar DHT11/pull-up a 3,3 V; identificar PIR y fuente.","DHT11 con pull-up integrado; cotejar etiquetas del PIR y fuente."));
   benches[id]!.assembly=route(a);
 }
 const mic=benches.microfono!.assembly;leftFacing(mic);mic.parts.find(p=>p.id==="module1")!.placement={x:70,y:170};mic.parts.find(p=>p.id==="module1")!.rotation=180;
 for(const w of mic.wires)w.pending=undefined;
 benches.microfono!.blockers=[...checks,"Cotejar VCC/GND/SD/LR/WS/SCK mirando la misma cara del INMP441; alimentar a 3,3 V."];
 benches.microfono!.assembly=route(mic);

 const matrix:Definition={id:"matriz",name:"Módulo matriz 8×8",pending:"MAX7219 del laboratorio, Anexo K aportado; dos conectores de cinco pines. Entrada DIN recibe datos; DOUT es salida para cascada. Conexión directa solo si el módulo admite HIGH de 3,3 V; MAX7219 estándar a 5 V requiere adaptación. Ver alternativa en Compatibilidad.",pins:[pin("VCC","power",5),pin("GND","ground"),pin("DIN","signal"),pin("CS","signal"),pin("CLK","signal"),pin("VCC_OUT"),pin("GND_OUT"),pin("DOUT","signal"),pin("CS_OUT"),pin("CLK_OUT")]};
 const m=base("matriz","M-08A · Matriz · montaje simple",[matrix],[{id:"matrix1",definition:"matriz",inventory:"B-10 · matriz 8×8",holes:{},placement:{x:70,y:170},rotation:180}]);leftFacing(m);
 wire(m,"esp1:GND_L","bb:RN21","black");power(m,"esp1:VIN","bb:LP26","orange");wire(m,"bb:LP12","matrix1:VCC","orange");wire(m,"bb:LN11","matrix1:GND","black");wire(m,"bb:LN30","bb:RN30","black");
 [[13,"DIN",9,"green"],[14,"CLK",5,"blue"],[27,"CS",7,"yellow"]].forEach(([gpio,target,row,color])=>{wire(m,`esp1:GPIO${gpio}`,`bb:J${row}`,color as "green"|"blue"|"yellow");wire(m,`bb:H${row}`,`matrix1:${target}`,color as "green"|"blue"|"yellow");});
 benches.matriz=simple(m,benches.matriz!,["UTEC Anexo K: VCC a 5 V, GND común, DIN GPIO13, CLK GPIO14 y CS GPIO27 en este firmware.","Cotejar la cabecera IN/DIN de la matriz; la cabecera OUT/DOUT es para cascada y no recibe el cable de datos."]);
 const bz:Definition={id:"buzzer",name:"Buzzer de dos patas",pending:"Referencia directa de dos cables como en clase; alimentación a 3,3 V reportada. Antes de conectar al GPIO, confirmar piezo/entrada de alta impedancia o consumo compatible. Si es una carga mayor, usar la alternativa con transistor.",pins:[pin("PLUS"),pin("MINUS")]};
 const b=base("buzzer","M-08B · Buzzer sobre protoboard",[bz],[{id:"bz1",definition:"buzzer",inventory:"B-09 · dos patas",holes:{PLUS:"G14",MINUS:"G17"}}]);
 wire(b,"esp1:GPIO17","bb:J14","yellow");wire(b,"esp1:GND","bb:J17","black");
 b.note+=" Buzzer insertado en dos tiras distintas: ajustar filas al paso real sin forzar las patas ni unir + y −. Dibujo no métrico.";
 benches.buzzer=simple(b,benches.buzzer!,["Conexión usada en clase: GPIO17 a la pata + y GND a la pata −; cotejar el signo + antes de insertar.","Ensayo breve de 120 ms; detener si no suena, se calienta o reinicia la placa."]);
 benches.buzzer.expected="Pulso o tono breve y apagado tras 120 ms; sin zumbido permanente al arrancar. Tipo y consumo deben corresponder al montaje elegido.";
 const relay:Definition={id:"relay",name:"Módulo relé doble",pending:"Guía UTEC Anexo V: módulo relé doble de lógica 5 V y activo LOW. El módulo incluye sus relés; no se añaden bobinas externas. Referencia LOW-trigger con puente VCC/JD-VCC existente. Confirmar que IN1 acepta control 3,3 V sin devolver 5 V al GPIO. Si no, usar adaptación.",pins:[pin("VCC","power",5),pin("GND","ground"),pin("IN1","signal"),pin("IN2"),pin("COM1"),pin("NO1"),pin("NC1")]};
 const fan:Definition={id:"fan",name:"Ventilador DC 5 V",pending:"D-05 está recibido, pero falta una fuente 5 V con corriente de arranque suficiente y adaptar su conector/polaridad. En la vista principal el fan permanece completamente desconectado.",pins:[pin("PLUS"),pin("MINUS")]};
 const supply5:Definition={id:"supply5",name:"Fuente DC regulada 5 V / 2 A",pending:"Fuente genérica necesaria para el ventilador; no está en el inventario recibido.",pins:[pin("PLUS","source",5),pin("GND","ground",0)]};
 const f=base("ventilador","M-09 · Relé y ventilador",[relay,fan,supply5],[{id:"relay1",definition:"relay",inventory:"B-11 · módulo relé doble",holes:{},placement:{x:70,y:150},rotation:180},{id:"fan1",definition:"fan",inventory:"D-05 · ventilador 5 V",holes:{},placement:{x:70,y:440}},{id:"ps1",definition:"supply5",inventory:"Fuente genérica regulada 5 V / 2 A · necesaria",holes:{},placement:{x:70,y:700}}]);leftFacing(f);
 wire(f,"esp1:GND_L","bb:RN28","black");wire(f,"bb:LN30","bb:RN30","black");
 power(f,"esp1:VIN","bb:LP26","orange");
 wire(f,"esp1:GPIO26","bb:J12","green");wire(f,"bb:H12","relay1:IN1","green");
 power(f,"bb:LP5","relay1:VCC","orange");power(f,"bb:LN7","relay1:GND","black");power(f,"bb:LP9","relay1:IN2","orange");
 power(f,"ps1:PLUS","relay1:COM1","orange");power(f,"relay1:NO1","fan1:PLUS","orange");power(f,"fan1:MINUS","ps1:GND","black");
 benches.ventilador=simple(f,benches.ventilador!,["UTEC Anexo V: relé a 5 V, GND común e IN1 activo LOW; en este banco IN1 usa GPIO26.","La fuente genérica regulada 5 V / 2 A es necesaria para la rama COM1 → NO1 → fan y todavía no está recibida.","Rojo del fan a NO1 y negro al negativo de la fuente; cotejar polaridad y adaptar el conector blanco sin forzarlo."]);
 benches.ventilador.action="Con la fuente de 5 V disponible, enviar arm y on: el relé cierra COM1–NO1 durante hasta 2 s y alimenta el fan; stop apaga y desarma.";
 benches.ventilador.expected="El relé hace clic, el ventilador gira durante la orden y ambos vuelven a reposo sin reiniciar el ESP32.";
 benches.ventilador.diagnosis="Sin giro: stop, retirar USB y la fuente; revisar VCC/GND/IN1, COM1/NO1 y polaridad del fan antes de repetir.";
 const fanAssembly=benches.ventilador!.assembly;
 const setRoute=(id:string,bends:[number,number][])=>{fanAssembly.wires.find(w=>w.id===id)!.bends=bends;};
 setRoute("c1",[[850,519],[850,672]]);                  // ESP GND → right negative rail
 setRoute("c2",[[457,672],[785,672]]);                 // short ground-rail bridge
 setRoute("c3",[[900,546],[900,720],[400,720],[400,600]]); // conditional USB 5 V → left + rail
 setRoute("c4",[[900,384],[900,348]]);                  // GPIO26 → J12
 setRoute("c5",[[430,348],[390,348],[390,269],[310,269]]); // H12 → IN1
 setRoute("c6",[[415,222],[350,222],[350,205],[310,205]]); // + rail → VCC
 setRoute("c7",[[445,258],[370,258],[370,237],[310,237]]); // − rail → GND
 setRoute("c8",[[405,294],[330,294],[330,301],[310,301]]); // + rail → IN2

 // The owned setup has USB but no separate 5 V adapter. Keep the former full
 // supply circuit as the compatibility view and make the primary audio view a
 // short, explicitly conditional, low-volume USB/VIN reference.
 const fullAudio=benches["audio-salida"]!,fullAudioAssembly=fullAudio.assembly;
 const ampDef={...fullAudioAssembly.catalog.find(d=>d.id==="amp")!,pending:"D-08 · MAX98357A: confirmar breakout/cabecera. VIN/5V del USB solo después de identificar A-01 y únicamente para un tono inicial de nivel bajo; no demuestra margen de potencia. SD21 habilita y LOW silencia."};
 const speakerDef={...fullAudioAssembly.catalog.find(d=>d.id==="speaker")!};
 const audio=base("audio-salida","M-07B · Audio mono por USB · nivel bajo",[ampDef,speakerDef,resistor],[
  {id:"amp1",definition:"amp",inventory:"D-08 · MAX98357A",holes:{},placement:{x:70,y:150},rotation:180},
  {id:"speaker1",definition:"speaker",inventory:"D-09 · usar solo una · 4 Ω / 3 W",holes:{},placement:{x:70,y:510},rotation:180},
  {id:"rsd",definition:"resistor",inventory:"C-01 · 1 kΩ pull-down SD",resistance:1000,holes:{"1":"G22","2":"G25"}},
 ]);leftFacing(audio);
 wire(audio,"esp1:GND_L","bb:RN28","black");wire(audio,"bb:RN20","amp1:GND","black");
 wire(audio,"esp1:VIN","bb:J6","orange");wire(audio,"bb:H6","amp1:VIN","orange");
 [[33,"BCLK",10,"blue"],[25,"LRC",14,"yellow"],[22,"DIN",18,"green"]].forEach(([gpio,target,row,color])=>{
  wire(audio,`esp1:GPIO${gpio}`,`bb:J${row}`,color as "blue"|"yellow"|"green");
  wire(audio,`bb:H${row}`,`amp1:${target}`,color as "blue"|"yellow"|"green");
 });
 wire(audio,"esp1:GPIO21","bb:J22","purple");wire(audio,"bb:H22","amp1:SD","purple");wire(audio,"bb:J25","bb:RN25","black");
 for(const [output,input] of [["SPK_PLUS","PLUS"],["SPK_MINUS","MINUS"]]){
  wire(audio,`amp1:${output}`,`speaker1:${input}`,"purple");
  const w=audio.wires.at(-1)!;w.jumper="altavoz";
  w.note=`Conductor de bocina: ${output} → ${input}, mediante la bornera y el adaptador soldado, por revisar. No es un jumper H–H; ninguno de los dos conductores va a GND.`;
 }
 audio.note+=" Audio sin H–H: 12 M–H y 1 M–M, más los dos conductores de la bocina con su adaptador soldado por revisar. Cada M–H une un pin macho a un agujero. VIN usa H6/J6; BCLK H10/J10; LRC H14/J14; DIN H18/J18; SD H22/J22 y resistencia en G22/G25. H y J de la misma fila están unidos; filas distintas no. GND conserva RN28/RN20 y el puente J25/RN25. USB/VIN sigue condicionado a identificar la ruta de alimentación real; el circuito de fuente separada se conserva en Compatibilidad.";
 benches["audio-salida"]=simple(audio,fullAudio,[
  "MAX98357A: VIN al pin VIN/5V del ESP32 alimentado por USB, GND común, BCLK33, LRC25, DIN22 y SD21.",
  "Usar solo 12 M–H y 1 M–M libres: señales y VIN por pares H/J de la misma fila. Contar disponibilidad y alcance reales antes de armar. El par de bocina requiere su bornera/adaptador soldado; no sustituirlo por empalmes al aire.",
  "Ensayo inicial al 1 % con una sola bocina; detener ante reset, calentamiento o distorsión. El circuito con fuente separada queda en Compatibilidad.",
  ...fullAudio.blockers.filter(s=>!s.startsWith("Fuente 5 V/2 A propuesta")),
 ]);
 benches["audio-salida"]!.diagnosis="Enviar stop ante un fallo y retirar USB. Revisar VIN/5V, GND, BCLK, LRC, DIN, SD y el par SPK±; no cambiar pines ni soldar con alimentación.";
 // Separate the amplifier leads so a vertical route never runs along other pins.
 const drawnAudio=benches["audio-salida"]!.assembly,{ends}=assemblyGeometry(drawnAudio);
 const lanes:Record<string,number>={SPK_MINUS:330,SPK_PLUS:345,GND:360,BCLK:375,LRC:390,DIN:405,SD:420,VIN:435};
 for(const w of drawnAudio.wires){
  const amp=[w.from,w.to].find(end=>end.startsWith("amp1:"));if(!amp)continue;
  const lane=lanes[amp.slice(5)]!,from=ends.get(w.from)!,to=ends.get(w.to)!;
  w.bends=[[lane,from[1]],[lane,to[1]]];
 }
}
