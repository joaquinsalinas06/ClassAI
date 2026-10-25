import example from "./example.json";
import { assemblyGeometry } from "./geometry";
import { parseAssembly, type Assembly, type Definition, type Part, type Wire } from "./model";
export const copy = (a: Assembly) => parseAssembly(JSON.stringify(a));
const esp = parseAssembly(JSON.stringify(example)).catalog.find(d => d.id === "esp32")!;
export const resistor: Definition = { id: "resistor", name: "Resistencia", pending: "Leer bandas y comprobar patas en tiras distintas.", pins: [{id:"1",kind:"passive"},{id:"2",kind:"passive"}] };
export const led: Definition = { id: "led", name: "LED · ánodo A / cátodo K", pending: "Confirmar A/K por encapsulado y patas; no omitir resistencia serie de 1 kΩ.", pins: [{id:"A",kind:"passive"},{id:"K",kind:"passive"}] };
export const button: Definition = { id: "button", name: "Pulsador de cuatro patas", pending: "Parejas A1/A2 y B1/B2 de referencia: identificar internamente el pulsador real antes de conectar.", pins: ["A1","A2","B1","B2"].map(id=>({id,kind:"passive",bus:id[0],required:false})) };
export function base(id: string, name: string, definitions: Definition[], parts: Part[]): Assembly {
  return {version:1,bankId:id,layout:"breadboard",name,note:"Referencia física, sin escala métrica. USB desconectado al armar. Usar A-01 solo tras identificar placa/puerto y preservar respaldo; B-02/NFC permanece conservado. Cables reutilizados entre ensayos; cero H–H.",board:{rows:30,rails:true},catalog:[{...esp,pending:"A-01: cotejar serigrafía, USB y respaldo antes de carga. VIN no certifica salida de 5 V.",pins:esp.pins.map(p=>({...p,required:false,function:undefined}))},...definitions],parts:[{id:"esp1",definition:"esp32",inventory:"A-01 · identificar antes de cargar",holes:{}},...parts],wires:[],revisions:[]};
}
export function wire(a: Assembly, from: string, to: string, color: Wire["color"], pending?: string) {
  const jumper = from.startsWith("bb:") && to.startsWith("bb:") ? "M–M" : "M–H";
  const i=a.wires.length+1;
  a.wires.push({id:`c${i}`,from,to,color,jumper,pending,note:`Cable ${i} · ${jumper} · ${from} → ${to}. ${pending ? `NO conectar: ${pending}` : "Conectar sin USB; comprobar etiquetas y agujeros."}`});
}
export function route(a: Assembly) {
  const {ends,origin}=assemblyGeometry(a);
  const boxes=[...origin].map(([id,o])=>({left:o.type==="esp32"?o.x:o.x+8,right:o.type==="esp32"?o.x+230:o.x+238,top:o.type==="esp32"?o.y:o.y+6,bottom:o.type==="esp32"?o.y+470:o.y+50+a.catalog.find(d=>d.id===a.parts.find(p=>p.id===id)!.definition)!.pins.length*24}));
  for(const [id,o] of origin)if(o.type==="dht11"||o.type==="pir") {
    const index=[...origin.keys()].indexOf(id);boxes[index]={left:o.x-5,right:o.x+140,top:o.y+3,bottom:o.y+180};
  }
  for(const part of a.parts.filter(p=>Object.keys(p.holes).length)) {
    const pts=Object.keys(part.holes).map(pin=>ends.get(`${part.id}:${pin}`)!);
    const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
    if(part.definition==="ahct125")boxes.push({left:Math.min(...xs)+7,right:Math.max(...xs)-7,top:Math.min(...ys)-8,bottom:Math.max(...ys)+8});
    else if(part.definition==="button")boxes.push({left:Math.min(...xs)-12,right:Math.max(...xs)+12,top:Math.min(...ys)-12,bottom:Math.max(...ys)+12});
    else if(part.definition==="npn")boxes.push({left:cx+14,right:cx+35,top:cy-14,bottom:cy+14});
    else {
      const horizontal=Math.max(...xs)-Math.min(...xs)>=Math.max(...ys)-Math.min(...ys);
      const rx=part.definition==="resistor"?(horizontal?33:13):(part.definition==="led"?17:15),ry=part.definition==="resistor"?(horizontal?13:33):(part.definition==="led"?17:13);
      boxes.push({left:cx-rx,right:cx+rx,top:cy-ry,bottom:cy+ry});
    }
  }
  const clear=(u:readonly number[],v:readonly number[])=>!boxes.some(b=>u[0]===v[0]?u[0]!>b.left&&u[0]!<b.right&&Math.max(u[1]!,v[1]!)>b.top&&Math.min(u[1]!,v[1]!)<b.bottom:u[1]!>b.top&&u[1]!<b.bottom&&Math.max(u[0]!,v[0]!)>b.left&&Math.min(u[0]!,v[0]!)<b.right);
  a.wires.forEach((w,i)=>{
    const from=ends.get(w.from)!,to=ends.get(w.to)!,margin=12+(i%5)*7;
    const xs=[...new Set([from[0],to[0],12,...boxes.flatMap(b=>[Math.max(8,b.left-margin),b.right+margin])])].sort((x,y)=>x-y);
    const ys=[...new Set([from[1],to[1],120,...boxes.flatMap(b=>[Math.max(110,b.top-margin),b.bottom+margin])])].sort((x,y)=>x-y);
    const start=ys.indexOf(from[1])*xs.length+xs.indexOf(from[0]),target=ys.indexOf(to[1])*xs.length+xs.indexOf(to[0]);
    const point=(n:number):[number,number]=>[xs[n%xs.length]!,ys[Math.floor(n/xs.length)]!];
    const distance=new Map<number,number>([[start,0]]),parent=new Map<number,number>(),open=[start],closed=new Set<number>();
    while(open.length){
      open.sort((x,y)=>(distance.get(x)!+Math.abs(point(x)[0]-to[0])+Math.abs(point(x)[1]-to[1]))-(distance.get(y)!+Math.abs(point(y)[0]-to[0])+Math.abs(point(y)[1]-to[1])));
      const current=open.shift()!;if(closed.has(current))continue;if(current===target)break;closed.add(current);
      const col=current%xs.length,row=Math.floor(current/xs.length);
      for(const next of [col>0?current-1:-1,col<xs.length-1?current+1:-1,row>0?current-xs.length:-1,row<ys.length-1?current+xs.length:-1]) {
        if(next<0||closed.has(next)||!clear(point(current),point(next)))continue;
        const p=point(current),q=point(next),cost=distance.get(current)!+Math.abs(p[0]-q[0])+Math.abs(p[1]-q[1])+1;
        if(cost<(distance.get(next)??Infinity)){distance.set(next,cost);parent.set(next,current);open.push(next);}
      }
    }
    if(!distance.has(target))throw new Error(`No route outside component bodies: ${a.bankId}/${w.id}`);
    const path:[number,number][]=[];let cursor=target;
    while(cursor!==start){path.unshift(point(cursor));cursor=parent.get(cursor)!;}path.unshift(point(start));
    w.bends=path.filter((p,j)=>j>0&&j<path.length-1&&((path[j-1]![0]===p[0])!==(path[j+1]![0]===p[0])));
  });
  return parseAssembly(JSON.stringify(a));
}
