import { base, wire, route } from "./bench_layout";
import type { BenchGuide } from "./benches";
import type { Assembly, Definition } from "./model";
const pin=(id:string,kind:"source"|"ground"|"power"|"signal"|"passive"="passive",voltage?:number)=>({id,kind,voltage,required:false});
const supply:Definition={id:"supply5",name:"Fuente DC 5 V / 2 A",pending:"Fuente genérica propuesta por petición del usuario; no recibida ni medida. ESP32 se alimenta por USB, no por VIN.",pins:[pin("PLUS","source",5),pin("GND","ground")]};
function leftFacing(a:Assembly){a.parts.find(p=>p.id==="esp1")!.placement={x:1000,y:140};}
function power(a:Assembly,from:string,to:string,color:"orange"|"black",pending?:string){wire(a,from,to,color,pending);a.wires.at(-1)!.jumper="potencia";a.wires.at(-1)!.note=a.wires.at(-1)!.note.replace("M–H","potencia DC por bornes");}
function source(a:Assembly){a.parts.push({id:"ps1",definition:"supply5",inventory:"PROPUESTA · 5 V DC / 2 A",holes:{},placement:{x:70,y:570},rotation:180});}
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
 const mic=benches.microfono!.assembly;leftFacing(mic);mic.parts.find(p=>p.id==="module1")!.placement={x:70,y:170};mic.parts.find(p=>p.id==="module1")!.rotation=180;benches.microfono!.assembly=route(mic);

 const matrix:Definition={id:"matriz",name:"Módulo matriz 8×8",pending:"MAX7219 del laboratorio, Anexo K aportado; dos conectores de cinco pines. Entrada DIN recibe datos; DOUT es salida para cascada. Conexión directa solo si el módulo admite HIGH de 3,3 V; MAX7219 estándar a 5 V requiere adaptación. Ver alternativa en Compatibilidad.",pins:[pin("VCC","power",5),pin("GND","ground"),pin("DIN","signal"),pin("CS","signal"),pin("CLK","signal"),pin("VCC_OUT"),pin("GND_OUT"),pin("DOUT","signal"),pin("CS_OUT"),pin("CLK_OUT")]};
 const m=base("matriz","M-08A · Matriz · montaje simple",[supply,matrix],[{id:"matrix1",definition:"matriz",inventory:"B-10 · matriz 8×8",holes:{},placement:{x:70,y:170},rotation:180}]);leftFacing(m);source(m);
 wire(m,"esp1:GND_L","bb:RN21","black");power(m,"ps1:GND","bb:LN28","black");power(m,"ps1:PLUS","bb:LP26","orange","Fuente externa 5 V propuesta; confirmar salida antes de energizar.");wire(m,"bb:LP12","matrix1:VCC","orange");wire(m,"bb:LN11","matrix1:GND","black");wire(m,"bb:LN30","bb:RN30","black");
 [[13,"DIN",9,"green"],[14,"CLK",5,"blue"],[27,"CS",7,"yellow"]].forEach(([gpio,target,row,color])=>{wire(m,`esp1:GPIO${gpio}`,`bb:J${row}`,color as "green"|"blue"|"yellow");wire(m,`bb:H${row}`,`matrix1:${target}`,color as "green"|"blue"|"yellow","Confirmar entrada y compatibilidad 3,3 V del módulo. MAX7219 estándar: usar adaptación documentada; no conectar directo.");});
 benches.matriz=simple(m,benches.matriz!,["Fuente externa regulada 5 V/2 A propuesta. Entrada DIN y salida DOUT no se intercambian.","La ruta directa es referencia condicionada: MAX7219 estándar no garantiza HIGH con 3,3 V. Si ese es el controlador, usar el montaje alternativo con AHCT; no se elimina la protección."]);
 const bz:Definition={id:"buzzer",name:"Buzzer de dos patas",pending:"Referencia directa de dos cables como en clase; alimentación a 3,3 V reportada. Antes de conectar al GPIO, confirmar piezo/entrada de alta impedancia o consumo compatible. Si es una carga mayor, usar la alternativa con transistor.",pins:[pin("PLUS"),pin("MINUS")]};
 const b=base("buzzer","M-08B · Buzzer sobre protoboard",[bz],[{id:"bz1",definition:"buzzer",inventory:"B-09 · dos patas",holes:{PLUS:"G14",MINUS:"G17"}}]);
 wire(b,"esp1:GPIO17","bb:J14","yellow","Conexión directa condicionada a tipo y consumo compatibles con GPIO 3,3 V; si no, usar adaptación.");wire(b,"esp1:GND","bb:J17","black");
 b.note+=" Buzzer insertado en dos tiras distintas: ajustar filas al paso real sin forzar las patas ni unir + y −. Dibujo no métrico.";
 benches.buzzer=simple(b,benches.buzzer!,["Dos redes: señal a + y masa a −. Las dos patas y el uso previo desde alimentación Arduino no certifican consumo admisible desde GPIO.","Directo únicamente con piezo/entrada compatible y consumo dentro del presupuesto GPIO; de lo contrario, ver transistor en Compatibilidad. No energizar el tramo condicionado."]);
 benches.buzzer.expected="Pulso o tono breve y apagado tras 120 ms; sin zumbido permanente al arrancar. Tipo y consumo deben corresponder al montaje elegido.";
 const relay:Definition={id:"relay",name:"Módulo relé doble",pending:"Guía UTEC Anexo V: módulo relé doble de lógica 5 V y activo LOW. El módulo incluye sus relés; no se añaden bobinas externas. Referencia LOW-trigger con puente VCC/JD-VCC existente. Confirmar que IN1 acepta control 3,3 V sin devolver 5 V al GPIO. Si no, usar adaptación.",pins:[pin("VCC","power",5),pin("GND","ground"),pin("IN1","signal"),pin("IN2"),pin("COM1"),pin("NO1"),pin("NC1")]};
 const fan:Definition={id:"fan",name:"Ventilador DC 5 V",pending:"Conector y polaridad reales por cotejar. Fuente 5 V/2 A genérica propuesta; comprobar que cubre corriente y arranque. Conexiones de potencia por bornera, fuera de protoboard.",pins:[pin("PLUS"),pin("MINUS")]};
 const f=base("ventilador","M-09 · Relé y ventilador · montaje simple",[supply,relay,fan],[{id:"relay1",definition:"relay",inventory:"B-11 · módulo relé doble",holes:{},placement:{x:70,y:150},rotation:180},{id:"fan1",definition:"fan",inventory:"D-05 · ventilador 5 V",holes:{},placement:{x:70,y:440},rotation:180}]);leftFacing(f);source(f);f.parts.find(p=>p.id==="ps1")!.placement={x:70,y:740};
 wire(f,"esp1:GND_L","bb:LN28","black");power(f,"ps1:GND","bb:LN26","black");wire(f,"esp1:GPIO26","bb:J12","green");wire(f,"bb:H12","relay1:IN1","green","Confirmar módulo LOW-trigger con lógica 3,3 V, sin 5 V retornando a GPIO. Si no es compatible, usar la alternativa NPN.");
 power(f,"ps1:PLUS","relay1:VCC","orange","Confirmar fuente y puente VCC/JD-VCC reales del módulo.");power(f,"ps1:GND","relay1:GND","black");power(f,"ps1:PLUS","relay1:IN2","orange","Solo bajo referencia LOW-trigger: canal 2 apagado a VCC; confirmar lógica real.");power(f,"ps1:PLUS","relay1:COM1","orange");power(f,"relay1:NO1","fan1:PLUS","orange","Polaridad, conector y capacidad de corriente por confirmar.");power(f,"fan1:MINUS","ps1:GND","black");
 benches.ventilador=simple(f,benches.ventilador!,["Fuente genérica externa 5 V/2 A propuesta; rama de potencia por borneras, no por GPIO/protoboard.","Confirmar LOW-trigger y compatibilidad eléctrica 3,3 V de IN1. Si no se confirma, no conectar directo: usar la alternativa con transistor.","El perfil por defecto usa control directo LOW-trigger; la alternativa NPN requiere BENCH_RELAY_NPN_ONLY. Revisar boot sin fan antes de cargar la rama de potencia."]);
 const fanAssembly=benches.ventilador!.assembly;
 fanAssembly.wires.find(w=>w.id==="c8")!.bends=[[310,700],[70,700]];
 for(const [id,lane] of [["c5",340],["c6",358],["c7",376],["c10",394]] as const){
   const w=fanAssembly.wires.find(w=>w.id===id)!;
   const fromY=id==="c5"||id==="c7"?806:id==="c6"?782:482;
   const toY=id==="c5"?205:id==="c6"?237:id==="c7"?301:782;
   w.bends=[[lane,fromY],[lane,toY]];
 }
}
