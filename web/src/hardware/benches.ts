import example from "./example.json";
import { nfcAssembly } from "./nfc";
import { assemblyGeometry } from "./geometry";
import { parseAssembly, type Assembly, type Definition, type Part, type Wire } from "./model";

export interface BenchGuide {
  assembly: Assembly;
  firmware?: string;
  profile?: string;
  action: string;
  expected: string;
  diagnosis: string;
  blockers: string[];
}
const copy = (a: Assembly) => parseAssembly(JSON.stringify(a));
const esp = parseAssembly(JSON.stringify(example)).catalog.find(d => d.id === "esp32")!;
const resistor: Definition = { id: "resistor", name: "Resistencia", pending: "Leer bandas y comprobar patas en tiras distintas.", pins: [{id:"1",kind:"passive"},{id:"2",kind:"passive"}] };
const led: Definition = { id: "led", name: "LED · ánodo A / cátodo K", pending: "Confirmar A/K por encapsulado y patas; no omitir resistencia serie de 1 kΩ.", pins: [{id:"A",kind:"passive"},{id:"K",kind:"passive"}] };
const button: Definition = { id: "button", name: "Pulsador de cuatro patas", pending: "Parejas A1/A2 y B1/B2 de referencia: identificar internamente el pulsador real antes de conectar.", pins: ["A1","A2","B1","B2"].map(id=>({id,kind:"passive",bus:id[0],required:false})) };
function base(id: string, name: string, definitions: Definition[], parts: Part[]): Assembly {
  return {version:1,bankId:id,layout:"breadboard",name,note:"Referencia física, sin escala métrica. USB desconectado al armar. Usar A-01 solo tras identificar placa/puerto y preservar respaldo; B-02/NFC permanece conservado. Cables reutilizados entre ensayos; cero H–H.",board:{rows:30,rails:true},catalog:[{...esp,pending:"A-01: cotejar serigrafía, USB y respaldo antes de carga. VIN no certifica salida de 5 V.",pins:esp.pins.map(p=>({...p,required:false,function:undefined}))},...definitions],parts:[{id:"esp1",definition:"esp32",inventory:"A-01 · identificar antes de cargar",holes:{}},...parts],wires:[],revisions:[]};
}
function wire(a: Assembly, from: string, to: string, color: Wire["color"], pending?: string) {
  const jumper = from.startsWith("bb:") && to.startsWith("bb:") ? "M–M" : "M–H";
  const i=a.wires.length+1;
  a.wires.push({id:`c${i}`,from,to,color,jumper,pending,note:`Cable ${i} · ${jumper} · ${from} → ${to}. ${pending ? `NO conectar: ${pending}` : "Conectar sin USB; comprobar etiquetas y agujeros."}`});
}
function route(a: Assembly) {
  const {ends}=assemblyGeometry(a);
  a.wires.forEach((w,i)=>{
    const from=ends.get(w.from)!,to=ends.get(w.to)!;
    const module = from[0]>850 || to[0]>850;
    const lane=module?825+(i%8)*12:335+(i%7)*11;
    if(from[0]<100 || to[0]<100) {
      const start=from[0]<100?from:to, end=from[0]<100?to:from;
      const outside=30-(i%5)*4, below=745+i*12;
      const bends: [number,number][]=[[outside,start[1]],[outside,below],[lane,below],[lane,end[1]]];
      w.bends=from[0]<100?bends:bends.reverse();
    } else if(a.bankId === "led-boton" && w.from === "bb:J18") {
      w.bends=[[795,from[1]],[795,558],[470,558],[470,to[1]]];
    } else w.bends=[[lane,from[1]],[lane,to[1]]];
  });
  return parseAssembly(JSON.stringify(a));
}
const ledButton=base("led-boton","M-01 · LED rojo y pulsador",[resistor,led,button],[
  {id:"r1",definition:"resistor",inventory:"C-01 · 1 kΩ",resistance:1000,holes:{"1":"C8","2":"G8"}},
  {id:"led1",definition:"led",inventory:"C-05 · rojo",holes:{A:"H8",K:"H11"}},
  {id:"button1",definition:"button",inventory:"C-04",holes:{A1:"E18",A2:"E20",B1:"F18",B2:"F20"}},
]);
wire(ledButton,"esp1:GND","bb:LN28","black");
wire(ledButton,"esp1:GPIO25","bb:A8","green");
wire(ledButton,"bb:J11","bb:LN11","black");
wire(ledButton,"esp1:GPIO32","bb:A18","yellow");
wire(ledButton,"bb:J18","bb:LN18","black");

const status=base("leds","M-01B · Tres LEDs de estado",[resistor,led],[]);
[ ["C-05 · rojo",25,6],["B-06 · amarillo",26,13],["B-05 · verde",27,20] ].forEach(([inventory,gpio,row],i)=>{
  const r=Number(row);
  status.parts.push({id:`r${i+1}`,definition:"resistor",inventory:"C-01 · confirmar tres unidades",resistance:1000,holes:{"1":`C${r}`,"2":`G${r}`}}, {id:`led${i+1}`,definition:"led",inventory:String(inventory),holes:{A:`H${r}`,K:`H${r+3}`}});
  wire(status,`esp1:GPIO${gpio}`,`bb:A${r}`,["red","yellow","green"][i] as Wire["color"]);
  wire(status,`bb:J${r+3}`,`bb:LN${r+3}`,"black");
});
wire(status,"esp1:GND","bb:LN28","black");

function moduleBench(id: string, name: string, inventory: string, pins: Definition["pins"], pending: string) {
  return base(id,name,[{id,name,pending,pins}], [{id:"module1",definition:id,inventory,holes:{},placement:{x:1010,y:150}}]);
}
const sound=moduleBench("ruido","M-06 · Detector B-08","B-08 · AO/G/+/DO; modelo pendiente",[
  {id:"AO",kind:"signal"},{id:"G",kind:"ground"},{id:"VCC",kind:"power"},{id:"DO",kind:"signal",required:false}
],"Orden AO/G/+/DO reportado en foto, orientar la misma cara. Identificar modelo, VCC y máximo AO. DO libre; no es INMP441.");
wire(sound,"esp1:3V3","bb:LP28","red","Confirmar alimentación de B-08 a 3,3 V; no adoptar la ficha de un KY-038 parecido.");
wire(sound,"bb:LP5","module1:VCC","red","Confirmar variante y VCC de B-08.");
wire(sound,"esp1:GND","bb:LN28","black");wire(sound,"bb:LN7","module1:G","black");
wire(sound,"module1:AO","bb:A10","green","Confirmar tensión AO compatible con ADC; dimensionar adaptación si hace falta.");
wire(sound,"esp1:GPIO34","bb:B10","green");

const mic=moduleBench("microfono","M-07A · INMP441","D-07 · INMP441",[
  {id:"VCC",kind:"power",voltage:3.3},{id:"GND",kind:"ground"}, {id:"SD",kind:"signal"}, {id:"LR",kind:"passive"}, {id:"WS",kind:"signal"},{id:"SCK",kind:"signal"}
],"INMP441 según inventario; cotejar etiquetas/cabecera y desacoplo. Terminales mostrados por función: orden del breakout pendiente, no trasladar posiciones.");
wire(mic,"esp1:3V3","bb:LP28","red");wire(mic,"bb:LP4","module1:VCC","red","Cotejar VCC, cabecera y desacoplo del breakout real.");
wire(mic,"esp1:GND","bb:LN28","black");wire(mic,"bb:LN6","module1:GND","black");wire(mic,"bb:LN8","module1:LR","black","Identificar L/R real; fijar canal izquierdo a GND.");
[[26,"SCK",12,"blue"],[25,"WS",16,"yellow"],[33,"SD",20,"green"]].forEach(([gpio,pin,row,color])=>{
  wire(mic,`esp1:GPIO${gpio}`,`bb:A${row}`,color as Wire["color"]);
  wire(mic,`bb:B${row}`,`module1:${pin}`,color as Wire["color"],"Confirmar etiqueta del terminal; su posición dibujada no identifica el conector real.");
});

const ambient=parseAssembly(JSON.stringify(example));ambient.bankId="ambiente";
ambient.wires.forEach(w=>{
 w.jumper=w.from.startsWith("bb:")&&w.to.startsWith("bb:")?"M–M":"M–H";
 if([w.from,w.to].some(x=>x.startsWith("pir1:")||x==="esp1:VIN")) w.pending="Identificar PIR y VCC/OUT/GND reales, fuente y niveles. VIN USB no confirmado; no conectar aún.";
 if([w.from,w.to].some(x=>x==="dht1:VCC"))w.pending="Confirmar B-03 a 3,3 V y pull-up a esa tensión.";
});
ambient.parts.find(p=>p.id==="esp1")!.inventory="A-01 · identificar, B-02 queda en NFC";
const dht=copy(ambient);dht.bankId="dht11";dht.name="M-04 · DHT11 aislado";dht.parts=dht.parts.filter(p=>p.definition!=="pir");dht.wires=dht.wires.filter(w=>!w.from.startsWith("pir1:")&&!w.to.startsWith("pir1:")&&!w.from.endsWith(":VIN")&&!w.from.endsWith(":GPIO27")&&!w.to.endsWith(":GPIO27"));
const pir=copy(ambient);pir.bankId="pir";pir.name="M-05 · PIR aislado";pir.parts=pir.parts.filter(p=>!["dht11","resistor"].includes(p.definition));pir.wires=pir.wires.filter(w=>[w.from,w.to].some(x=>x.startsWith("pir1:")||x==="esp1:VIN"||x==="esp1:GPIO27")||w.from==="esp1:GND");

// Unidentified modules have explicit terminal panels, never a claimed physical header order.
const matrix=moduleBench("matriz","M-08A · Matriz 8×8","B-10 · controlador por leer",["VCC","GND","DIN","CS","CLK","DOUT"].map(id=>({id,kind:id==="GND"?"ground":id==="VCC"?"power":"signal",required:!['DOUT'].includes(id)})),"Conector de entrada VCC/GND/DIN/CS/CLK reportado; leer chip. Buffer 3,3→5 V y fuente no inventariados. No cablear GPIO directo.");
const buzzer=moduleBench("buzzer","M-08B · Buzzer polarizado","B-09",[{id:"PLUS",kind:"passive"},{id:"MINUS",kind:"passive"}],"Signo + reportado; activo/pasivo, tensión y corriente pendientes. Driver y protección por dimensionar; sin conexión a GPIO.");
const fan=base("ventilador","M-09 · Relé doble y ventilador",[
 {id:"relay",name:"B-11 · relé doble 5VDC",pending:"Panel de terminales por función; identificar jumper JD-VCC/VCC/GND, lógica y adaptación IN1. Canal 2 libre.",pins:["VCC","JD_VCC","GND","IN1","IN2","COM1","NO1","NC1"].map(id=>({id,kind:"passive",required:false}))},
 {id:"fan",name:"D-05 · ventilador DC 5 V",pending:"Fuente, corriente de arranque, polaridad y conector pendientes; no usar Dupont como cable de potencia por defecto.",pins:[{id:"PLUS",kind:"passive",required:false},{id:"MINUS",kind:"passive",required:false}]}
],[{id:"relay1",definition:"relay",inventory:"B-11",holes:{},placement:{x:920,y:140}},{id:"fan1",definition:"fan",inventory:"D-05",holes:{},placement:{x:1200,y:140}}]);
// No fictional buffer, transistor or source is instantiated as a received component.
const commonBlockers=["Identificar A-01/puerto y preservar respaldo privado antes de cargar.","Comprobar protoboard real, tipos y alcance de jumpers, con USB desconectado."];
const guide=(assembly:Assembly,firmware:string|undefined,action:string,expected:string,diagnosis:string,blockers:string[]=[],profile?:string):BenchGuide=>({assembly,firmware,profile,action,expected,diagnosis,blockers:[...commonBlockers,...blockers]});
export const benches: Record<string,BenchGuide> = {
 nfc:guide({...copy(nfcAssembly),bankId:"nfc",note:"Referencia B-02/D-01 conservada: HCE físico y asistencia persistida R-023, con RF intermitente. 12 M–H, seis redes; no hubo nuevo ensayo ni carga. IRQ/RSTO libres. Ver banco-nfc.md."},"classai_node","Conservar el montaje B-02/D-01 y el ensayo R-023.","Referencia física existente; RF intermitente pendiente.","Consultar banco-nfc.md; no sustituir firmware operativo."),
 ambiente:guide(ambient,"ambient_bench","Probar primero DHT11 y PIR separados; después ejecutar ambos.","20 lecturas DHT válidas y PIR LOW→HIGH→LOW→HIGH tras estabilización.","DHT inválido: revisar DATA/pull-up sin alimentación. PIR fijo: esperar, revisar etiquetas, modo y fuente.",["Confirmar DHT11/pull-up a 3,3 V; identificar PIR y fuente. VIN no es salida 5 V garantizada."]),
 dht11:guide(dht,"ambient_bench","Observar 20 lecturas; desconectar DATA solo con USB retirado para ensayar error y reiniciar.","temp_c/rh_pct válidos o null con dht_valid:false; nunca cero inventado.","Error: revisar −/OUT/+, GPIO4 y pull-up a 3,3 V.",["Confirmar B-03, alimentación y pull-up del breakout."],"dht"),
 pir:guide(pir,"ambient_bench","Esperar 60 s, moverse, retirarse y volver a entrar.","Calentamiento motion:null; después cambios sin repetición continua.","HIGH fijo: esperar retardo, revisar H/L y sensibilidad apagado; no cambiar pines por apariencia.",["Identificar B-04 o D-06, VCC/OUT/GND, fuente y nivel OUT."],"pir"),
 "led-boton":guide(route(ledButton),"led_button_bench","Pulsar, mantener y soltar; repetir.","Una alternancia del LED por pulsación; mantener no repite. Serial 115200.","LED apagado: A/K, R1 y filas. Botón fijo: identificar parejas; no puentear las dos entradas."),
 leds:guide(route(status),"status_led_bench","Enviar red, yellow, green y off por Serial.","Solo un LED activo; off apaga los tres.","Color equivocado: cotejar GPIO25/26/27 y extremos de cada resistencia.",["Confirmar tres resistencias C-01 de 1 kΩ libres; cantidad no contada."]),
 ruido:guide(route(sound),"sound_bench","Comparar silencio relativo, conversación y palmada durante varias ventanas.","min/max, pico a pico y noise_rel varían; no son dB ni garantizan tres niveles sin ensayo.","Saturación: desconectar, revisar alimentación/niveles; DO queda libre.",["Modelo B-08, VCC y máximo AO sin confirmar; adaptación si procede."]),
 microfono:guide(route(mic),"inmp441_bench","Hablar y dar una palmada cerca del micrófono; no soplar sobre él.","Ventanas con muestras, pico/RMS relativos; error o timeout explícito.","Ceros: cotejar L/R, canal y SD; revisar SCK/WS y soldadura sin USB.",["Confirmar cabecera, orden real y desacoplo de D-07."]),
 matriz:guide(matrix,undefined,"Identificar chip y preparar adaptación/fuente antes del barrido.","Patrón de baja intensidad pendiente; no se energiza con este diseño incompleto.","No omitir adaptación para intentar hacerlo funcionar.",["Leer controlador; faltan buffer compatible con pinout y desacoplo, fuente 5 V dimensionada y cables de potencia."]),
 buzzer:guide(buzzer,undefined,"Identificar modelo y tipo antes de elegir driver.","Aviso breve y parada pendientes de circuito dimensionado.","No aplicar tone ni tensión por ensayo/error.",["Faltan tensión, consumo, tipo y etapa de accionamiento/protección."]),
 ventilador:guide(fan,undefined,"Identificar relé, fuente y conector antes de conmutar carga.","Boot apagado y ON/OFF sin resets: ensayo futuro.","No alimentar motor/bobinas desde GPIO/3V3 ni presumir disparo LOW.",["Faltan fuente 5 V, capacidad/arranque, cable de potencia/conector y adaptación lógica; jumper por revisar."]),
};
export function assemblyBank(a:Assembly):string { return a.bankId ?? (a.parts.some(p=>p.definition==="pn532")?"nfc":"ambiente"); }
export function benchAssembly(id:string):Assembly { return copy(benches[id]?.assembly ?? nfcAssembly); }
