// Integrated proposals reuse the existing component references; they do not approve power branches.
import { base, resistor, led, button, route } from "./bench_layout";
import { contacts, contactStrip, type Assembly, type Definition, type Part, type Wire } from "./model";
import type { BenchGuide } from "./benches";

const rail5="Confirmar ruta USB–VIN y capacidad de corriente de esta placa antes de conectar 5 V.";
const level="Adaptación 3,3→5 V pendiente de disponer, identificar y verificar; no sustituirla con un cable.";
const stage="Etapa de buzzer por identificar/validar; este bloque muestra funciones, no el pinout de un transistor recibido.";
const label=(end:string)=>end.startsWith("bb:")?`P · ${end.slice(3)}`:end.replace(":", " · ").replace("GPIO", "GPIO ");
function add(a:Assembly,from:string,to:string,color:Wire["color"],detail:string,pending?:string,jumper?:Wire["jumper"]) {
 const contact=(e:string)=>e.startsWith("bb:")||e.startsWith("p4:");
 const used=new Set([...a.wires.flatMap(w=>[w.from,w.to]),...a.parts.flatMap(p=>Object.values(p.holes).map(h=>`${p.boardId??"bb"}:${h}`))]);
 const free=(end:string)=>{
  if(!contact(end)||!used.has(end))return end;
  const [board,hole]=end.split(":") as [string,string];
  const strip=contactStrip(hole,a.board),row=Number(hole.replace(/\D/g,""));
  const alternative=contacts(a.board).filter(h=>contactStrip(h,a.board)===strip&&!used.has(`${board}:${h}`))
   .sort((a,b)=>Math.abs(Number(a.replace(/\D/g,""))-row)-Math.abs(Number(b.replace(/\D/g,""))-row))[0];
  if(!alternative)throw new Error(`No free equivalent contact for ${end}`);
  return `${board}:${alternative}`;
 };
 from=free(from);to=free(to);
 const type=jumper??(contact(from)&&contact(to)?"M–M":contact(from)||contact(to)?"M–H":"H–H");
 const number=a.wires.length+1;
 a.wires.push({id:`c${number}`,from,to,color,jumper:type,pending,note:`${number}. ${detail} · ${type} · ${label(from)} → ${label(to)}${pending?` · NO CONECTAR: ${pending}`:" · USB desconectado."}`});
}
function part(id:string,definition:string,inventory:string,x:number,y:number):Part{return {id,definition,inventory,holes:{},placement:{x,y}};}
function rails(a:Assembly){
 add(a,"esp1:GND","bb:LN2","black","Masa común del nodo");
 add(a,"bb:LN29","bb:RN29","black","Unir solo los dos rieles negativos");
 add(a,"esp1:3V3","bb:LP2","red","Riel positivo izquierdo: 3,3 V");
 add(a,"esp1:VIN","bb:RP2","orange","Riel positivo derecho: 5 V USB",rail5);
}
function power(a:Assembly,id:string,vcc:string,gnd:string,row:number,voltage:3.3|5=3.3,board="bb",pending?:string){
 add(a,`${board}:${voltage===3.3?"LP":"RP"}${row}`,`${id}:${vcc}`,voltage===3.3?"red":"orange",`Alimentar ${id} a ${voltage} V`,pending??(voltage===5?rail5:undefined));
 add(a,`${board}:LN${row}`,`${id}:${gnd}`,"black",`Retorno de ${id}`);
}
function light(a:Assembly,row:number){
 a.parts.push({id:"ldr1",definition:"ldr",inventory:"Fotoresistencia · una de las disponibles",holes:{"1":`C${row}`,"2":`C${row+3}`}},
  {id:"rLight",definition:"resistor",inventory:"Resistencia 10 kΩ · caracterizar rango ADC",resistance:10000,holes:{"1":`E${row+3}`,"2":`E${row+6}`}});
 add(a,`bb:LP${row}`,`bb:A${row}`,"red","Divisor LDR: extremo superior a 3,3 V");
 add(a,"esp1:GPIO35",`bb:B${row+3}`,"purple","Unión LDR/resistencia hacia ADC1 GPIO35");
 add(a,`bb:A${row+6}`,`bb:LN${row+6}`,"black","Divisor LDR: resistencia a GND");
}
function indicator(a:Assembly,id:string,pin:number,row:number,inventory:string,color:Wire["color"]){
 a.parts.push({id:`r${id}`,definition:"resistor",inventory:"Resistencia 1 kΩ · una por LED",resistance:1000,holes:{"1":`C${row}`,"2":`G${row}`}},
 {id,definition:"led",inventory,holes:{A:`H${row}`,K:`H${row+2}`}});
 add(a,`esp1:GPIO${pin}`,`bb:A${row}`,color,`${inventory}: control con resistencia en serie`);
 add(a,`bb:J${row+2}`,`bb:RN${row+2}`,"black",`${inventory}: cátodo a GND`);
}
export function completeIntegratedBenches(benches:Record<string,BenchGuide>){
 const cloneDef=(bank:string,id:string):Definition=>JSON.parse(JSON.stringify(benches[bank]!.assembly.catalog.find(d=>d.id===id)!));
 const ldr:Definition={id:"ldr",name:"Fotoresistencia · luz relativa",pending:"Modelo y orientación hacia el aula por comprobar; no mide lux sin calibración.",pins:[{id:"1",kind:"passive"},{id:"2",kind:"passive"}]};
 const levelshift:Definition={id:"levelshift",name:"Adaptación 3,3 → 5 V",pending:level,pins:[{id:"VCC",kind:"power",voltage:5},{id:"GND",kind:"ground"},...['DIN','CLK','CS'].flatMap(id=>[{id:`IN_${id}`,kind:"signal" as const},{id:`OUT_${id}`,kind:"signal" as const}])]};
 const driver:Definition={id:"driver",name:"Etapa del buzzer · por validar",pending:stage,pins:[{id:"IN",kind:"signal"},{id:"GND",kind:"ground"},{id:"OUT",kind:"passive"}]};
 const access=base("nodo-acceso","Acceso · B-02 · P1",[cloneDef("nfc","pn532"),cloneDef("matriz","matriz"),cloneDef("pir","pir"),cloneDef("buzzer","buzzer"),levelshift,driver,resistor,led,button],[
  part("nfc1","pn532","D-01 · PN532 V3 · SPI",1020,160),part("matrix1","matriz","B-10 · matriz 8×8",1490,650),
  part("pir1","pir","B-04 · movimiento en entrada",1510,160),part("adapt1","levelshift","Adaptación no inventariada · pendiente",1010,690),
  part("drive1","driver","Etapa no identificada · pendiente",70,1000),part("buzz1","buzzer","B-09 · buzzer",1010,1060),
  {id:"button1",definition:"button",inventory:"C-04 · solicitar inicio/cierre",holes:{A1:"E20",A2:"E22",B1:"F20",B2:"F22"}},
 ]);
 access.parts[0]!.inventory="B-02 · universidad · acceso";
 rails(access);power(access,"nfc1","VCC","GND",5);
 for(const [gpio,pin,color] of [[18,"SCK","blue"],[19,"MISO","purple"],[23,"MOSI","green"],[5,"SS","yellow"]] as const)add(access,`esp1:GPIO${gpio}`,`nfc1:${pin}`,color,`PN532 SPI · ${pin}`);
 indicator(access,"led1",25,12,"LED de confirmación", "green");
 add(access,"esp1:GPIO32","bb:A20","yellow","Botón a entrada con pull-up interno");add(access,"bb:J20","bb:RN20","black","Retorno del botón");
 power(access,"pir1","VCC","GND",7,5,"bb","Confirmar VCC/OUT/GND y nivel de salida de este PIR.");add(access,"pir1:OUT","esp1:GPIO35","purple","PIR de entrada · señal 3,3 V", "Verificar salida del PIR; GPIO35 no tiene polarización interna.");
 power(access,"adapt1","VCC","GND",9,5,"bb",level);power(access,"matrix1","VCC","GND",11,5);
 for(const [gpio,pin,color] of [[13,"DIN","green"],[14,"CLK","blue"],[27,"CS","yellow"]] as const){add(access,`esp1:GPIO${gpio}`,`adapt1:IN_${pin}`,color,`Matriz · entrada ${pin} de adaptación`,level);add(access,`adapt1:OUT_${pin}`,`matrix1:${pin}`,color,`Matriz · salida ${pin} de adaptación`,level);}
 add(access,"esp1:GPIO17","drive1:IN","yellow","Control del buzzer",stage);add(access,"bb:LN25","drive1:GND","black","Masa de la etapa de buzzer");
 add(access,"drive1:OUT","buzz1:MINUS","black","Retorno conmutado de buzzer",stage);add(access,"bb:LP25","buzz1:PLUS","red","Buzzer: alimentación solo tras identificar tensión",stage);

 const environment=base("nodo-ambiente","Ambiente · A-01 · P2",[cloneDef("ambiente","dht11"),cloneDef("pir","pir"),cloneDef("ruido","ruido"),cloneDef("ventilador","relay"),cloneDef("ventilador","fan"),ldr,resistor,led],[
  part("dht1","dht11","B-03 · DHT11",1010,170),part("pir1","pir","D-06 · movimiento del aula",1510,170),
  part("sound1","ruido","B-08 · ruido relativo AO",1010,560),part("relay1","relay","B-11 · un canal; resto libre",1510,580),part("fan1","fan","D-05 · ventilador 5 V",1510,1100),
 ]);
 environment.parts[0]!.inventory="A-01 · Adrián · ambiente";
 rails(environment);light(environment,4);power(environment,"dht1","VCC","GND",10);add(environment,"esp1:GPIO4","dht1:DATA","green","DHT11 · OUT con pull-up del módulo hacia 3,3 V");
 power(environment,"pir1","VCC","GND",12,5,"bb","Verificar alimentación y salida del PIR D-06.");add(environment,"esp1:GPIO27","pir1:OUT","yellow","PIR ambiente · señal lógica verificada", "Cotejar nivel de OUT del PIR.");
 power(environment,"sound1","VCC","G",14);add(environment,"esp1:GPIO34","sound1:AO","purple","Ruido relativo · AO34; DO sin cable");
 indicator(environment,"ledGreen",18,17,"B-05 · LED verde","green");indicator(environment,"ledYellow",19,21,"B-06 · LED amarillo","yellow");indicator(environment,"ledRed",23,25,"C-05 · LED rojo","red");
 power(environment,"relay1","VCC","GND",16,5);add(environment,"bb:RP19","relay1:IN2","orange","Mantener canal 2 desactivado", "Solo para la variante LOW-trigger ya identificada; confirmar IN2 y jumper.");add(environment,"esp1:GPIO26","relay1:IN1","yellow","Control de relé · nivel de disparo según interfaz", "Verificar compatibilidad 3,3 V, jumper, polaridad y estado OFF del relé.");
 add(environment,"bb:RP18","relay1:COM1","orange","Potencia del fan hacia COM1", "Capacidad USB, arranque y cableado de potencia por verificar.","potencia");
 add(environment,"relay1:NO1","fan1:PLUS","orange","Contacto NO1 hacia positivo del fan", "No habilitar hasta validar fuente y corriente del fan.","potencia");
 add(environment,"fan1:MINUS","bb:RN18","black","Retorno de potencia del fan", "Retorno de potencia por verificar.","potencia");

 const breadboard:Definition={id:"breadboard400",name:"P4 · protoboard 400 puntos",pending:"Referencia de 30 filas; comprobar continuidad real de rieles.",pins:contacts({rows:30,rails:true}).map(id=>({id,kind:"passive",required:false,bus:/^(LP|LN|RP|RN)/.test(id)?id.replace(/\d+/,""):`${id.slice(1)}-${"ABCDE".includes(id[0]!)?"L":"R"}`}))};
 const assistant=base("nodo-asistente","Asistente · E-01 · P3/P4",[cloneDef("pantalla","tft"),cloneDef("microfono","microfono"),cloneDef("audio-salida","amp"),cloneDef("audio-salida","speaker"),breadboard,ldr,resistor],[
  part("p4","breadboard400","Segunda protoboard · audio y potencia",1010,110),part("tft1","tft","D-04 · TFT ST7789",1590,160),
  part("mic1","microfono","D-07 · INMP441",70,900),part("amp1","amp","D-08 · MAX98357A",1590,760),part("speaker1","speaker","D-09 · una bocina",1590,1160),
  {id:"rSD",definition:"resistor",inventory:"Pull-down SD · 1 kΩ",resistance:1000,boardId:"p4",holes:{"1":"C8","2":"C12"}},
 ]);
 assistant.parts[0]!.inventory="E-01 · Joaquín · Type-C 38 pines";assistant.parts[0]!.pinout="devkit38-reference";
 assistant.catalog[0]!.name="ESP32 · 38 pines · referencia DevKitC";assistant.catalog[0]!.pending="Cotejar cada etiqueta real de E-01; el dibujo no identifica el pinout de su clon.";
 rails(assistant);light(assistant,5);
 add(assistant,"bb:LP29","p4:LP29","red","Llevar 3,3 V desde P3 a P4");add(assistant,"bb:LN28","p4:LN28","black","Masa P3/P4 del mismo nodo");add(assistant,"bb:RP29","p4:RP29","orange","Llevar 5 V desde P3 a P4",rail5);
 power(assistant,"tft1","VCC","GND",14);
 assistant.parts.push({id:"rBL",definition:"resistor",inventory:"BL TFT · 1 kΩ en serie",resistance:1000,boardId:"p4",holes:{"1":"C20","2":"G20"}});
 add(assistant,"p4:LP20","p4:A20","red","Retroiluminación TFT: entrada a resistencia de 1 kΩ");
 add(assistant,"p4:J20","tft1:BL","red","Retroiluminación con resistencia en serie", "Confirmar conexión BL de esta variante; no puentear la resistencia por ensayo/error.");
 for(const [gpio,pin,color] of [[14,"SCL","blue"],[23,"SDA","green"],[5,"CS","yellow"],[27,"DC","purple"],[26,"RST","yellow"]] as const)add(assistant,`esp1:GPIO${gpio}`,`tft1:${pin}`,color,`TFT SPI · ${pin}`);
 power(assistant,"mic1","VCC","GND",18);add(assistant,"bb:LN20","mic1:LR","black","Fijar micrófono en canal izquierdo");
 for(const [gpio,pin,color] of [[18,"SCK","blue"],[19,"WS","yellow"],[34,"SD","green"]] as const)add(assistant,`esp1:GPIO${gpio}`,`mic1:${pin}`,color,`Micrófono I²S0 · ${pin}`);
 power(assistant,"amp1","VIN","GND",5,5,"p4");
 for(const [gpio,pin,color] of [[33,"BCLK","blue"],[25,"LRC","yellow"],[22,"DIN","green"]] as const)add(assistant,`esp1:GPIO${gpio}`,`amp1:${pin}`,color,`Bocina I²S1 · ${pin}`);
 add(assistant,"esp1:GPIO21","p4:A8","purple","Control SD21 y pull-down");add(assistant,"p4:B8","amp1:SD","purple","Unión SD21/pull-down hacia SD del amplificador");add(assistant,"p4:A12","p4:LN12","black","Pull-down SD hacia masa");
 add(assistant,"amp1:SPK_PLUS","speaker1:PLUS","orange","Bocina diferencial · positivo", "Revisar bornera y una sola bocina antes de armar.","altavoz");add(assistant,"amp1:SPK_MINUS","speaker1:MINUS","black","Bocina diferencial · negativo, nunca GND", "No conectar SPK− a masa.","altavoz");

 for(const [a,role] of [[access,1],[environment,2],[assistant,3]] as const){
  a.note=`Montaje integrado propuesto · ${a.name}. Cuatro protoboards entre los tres nodos; no duplicar inventario. M–M/M–H/H–H admitidos para este diseño; contar disponibilidad y alcance antes de armar. H–H une dos cabeceras macho. LP=3,3 V, RP=5 V condicionado, LN/RN=GND local. Alimentación USB propia; no unir fuentes de nodos distintos. Cables pendientes visibles como discontinuos; no colocar ni energizar esas ramas hasta resolver su condición.`;
  a.catalog=a.catalog.map(d=>({...d,pins:d.pins.map(pin=>({...pin,required:false}))}));
  benches[a.bankId!]={assembly:route(a),firmware:"classai_multinode",role,action:"Colocar componentes sin USB, después masas, rieles y señales siguiendo los pasos. Revisar los cables discontinuos aparte; el visor no energiza ni carga firmware.",expected:"Montaje coherente con el perfil, sin redes de 3,3/5 V unidas y con ramas condicionadas sin habilitar. Después realizar el ensayo físico conjunto.",diagnosis:"Ante fallo: stop/desarmar, retirar USB y cotejar extremo/etiqueta/red. No usar el dibujo como medición de tensión.",blockers:["Reidentificar placa, puerto y respaldo antes de cargar. E-01 requiere cotejar pinout real de 38 contactos.","H–H autorizados para la propuesta; cantidad, longitud y recepción concreta sin contar.","5 V USB, niveles y capacidad de matriz/relé/amplificador por validar; bloques de adaptación no son material recibido.","Dos LDR en total, una en ambiente y otra en asistente; no medir lux sin calibración."]};
 }
}
