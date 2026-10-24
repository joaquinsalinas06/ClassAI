import { assemblyGeometry } from "./geometry";
import type { KeyboardEvent } from "react";
import { silkscreen30 } from "./pinouts";
import { contactStrip, contacts, definition, type Assembly, type Wire, type WireColor } from "./model";

export const wireColors: Record<WireColor, { label: string; hex: string }> = {
  red: { label: "Rojo · 3,3 V", hex: "#db3345" },
  black: { label: "Negro · GND", hex: "#252d38" },
  orange: { label: "Naranja · 5 V nominal", hex: "#dc7519" },
  green: { label: "Verde · DATA DHT11", hex: "#15855e" },
  yellow: { label: "Amarillo · OUT PIR", hex: "#b78a08" },
  blue: { label: "Azul", hex: "#2867c7" },
  purple: { label: "Violeta", hex: "#8753b7" },
};
export function terminalLabel(end: string) {
  if (end.startsWith("bb:")) {
    const h = end.slice(3), m = /^(LP|LN|RP|RN)(\d+)$/.exec(h);
    return m ? `Riel ${m[1]![0] === "L" ? "izquierdo" : "derecho"} ${m[1]![1] === "P" ? "+" : "−"} · ${m[2]}` : `Agujero ${h}`;
  }
  const [part, pin] = end.split(":");
  const name = part === "esp1" ? "ESP32" : part === "dht1" ? "DHT11" : part === "pir1" ? "PIR" : part;
  const label = part === "dht1" ? ({ GND: "−", DATA: "OUT", VCC: "+" }[pin!] ?? pin) : pin;
  return `${name} · ${label?.replace("GND_L", "GND").replace("GPIO", "GPIO ")}`;
}
export function AssemblyBoard({ assembly, wires, selected, onSelect, connected, zoom = 1, pirBack = false }: {
  assembly: Assembly; wires: Wire[]; selected: string; onSelect: (s: string) => void;
  connected: (x: string, y: string) => boolean; zoom?: number; pirBack?: boolean;
}) {
  const { point, ends, origin, height, ys, width, offset } = assemblyGeometry(assembly);
  const active = (end: string) => connected(selected, end);
  const key = (e: KeyboardEvent, end: string) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(end); } };
  const labelPin = silkscreen30;
  const pinMark = (end: string, x: number, y: number, text?: string, labelX = x, labelY = y - 15) => <g key={end} role="button" tabIndex={0} aria-label={`Terminal ${end}`} onClick={() => onSelect(end)} onKeyDown={e => key(e, end)} style={{ cursor: "pointer" }}>
    {active(end) && <circle cx={x} cy={y} r="12" fill="#59b3e9" opacity=".35" />}
    <rect x={x - 5} y={y - 5} width="10" height="10" rx="1" fill="#d5b865" stroke="#70582b" />
    {text && <text x={labelX} y={labelY} textAnchor="middle" fontSize="12" fontWeight="600" fill="#26344a">{text}</text>}<title>{terminalLabel(end)}</title>
  </g>;
  return <svg data-assembly-board width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`} className="block max-w-none" aria-label="Protoboard con rieles, ESP32 de 30 pines, DHT11 y PIR; guía de referencia">
    <defs>
      <linearGradient id="metal" x2="1" y2="1"><stop stopColor="#f2f4f5"/><stop offset=".5" stopColor="#b0bbc6"/><stop offset="1" stopColor="#e2e6e9"/></linearGradient>
      <radialGradient id="lens" cx="35%" cy="25%"><stop stopColor="#fff"/><stop offset="1" stopColor="#d6e0e7"/></radialGradient>
      <filter id="wire-shadow" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="2" stdDeviation="1.2" floodOpacity=".18"/></filter>
    </defs>
    <title>Guía de referencia con terminales y alimentaciones completas, sin ensayo eléctrico</title>
    <rect width={width} height={height} fill="#edf2f5" />
    <text x={70 + (offset ? 240 : 0)} y="65" fill="#28364b" fontSize="18" fontWeight="600">ESP32 · 30 pines</text>
    <text x={70 + (offset ? 240 : 0)} y="88" fill="#62738a" fontSize="12">USB abajo · DevKit V1 de referencia</text>
    <text x={420 + offset} y="65" fill="#28364b" fontSize="18" fontWeight="600">Protoboard · {assembly.board.rows} filas</text>
    <text x={420 + offset} y="88" fill="#62738a" fontSize="12">A–E y F–J separados · rieles {assembly.board.splitRails ? "partidos a mitad" : "continuos, comprobar"}</text>
    <rect x={410 + offset} y="110" width="400" height={assembly.board.rows * 18 + 62} rx="18" fill="#fffefa" stroke="#c8d1d7" strokeWidth="2" />
    <rect x={585 + offset} y="140" width="38" height={assembly.board.rows * 18 + 6} rx="5" fill="#e2e7e8" />
    {assembly.board.rails && (["LP", "LN", "RP", "RN"] as const).map(rail => {
      const [x] = point(`${rail}1`);
      const source = assembly.parts.flatMap(p => definition(assembly,p).pins.filter(pin => pin.kind === "source" || pin.kind === "ground").map(pin => ({ end: `${p.id}:${pin.id}`, pin }))).find(p => connected(`bb:${rail}1`, p.end));
      const voltage = source?.pin.voltage;
      const color = source?.pin.kind === "ground" ? "#526276" : voltage === 3.3 ? "#db3345" : voltage === 5 ? "#dc7519" : "#87929f";
      return <g key={rail}><text x={x} y="135" textAnchor="middle" fontSize="16" fill={color}>{rail[1] === "P" ? "+" : "−"}</text>
        {[0, ...(assembly.board.splitRails ? [1] : [])].map(section => <line key={section} x1={x - 9} x2={x - 9} y1={section ? ys(Math.ceil(assembly.board.rows / 2) + 1) - 5 : 145} y2={section || !assembly.board.splitRails ? ys(assembly.board.rows) + 8 : ys(Math.ceil(assembly.board.rows / 2)) + 5} stroke={color} strokeWidth="2" />)}
        <text x={x} y={Math.max(160 + assembly.board.rows * 18, assembly.layout === "breadboard" ? 790 : 0) + (rail[1] === "N" ? 14 : 0)} textAnchor="middle" fill={color} fontSize="12">{source?.pin.kind === "ground" ? "GND" : voltage === undefined ? "Libre" : `${String(voltage).replace(".", ",")} V${voltage === 5 ? "*" : ""}`}</text></g>;
    })}
    {[..."ABCDEFGHIJ"].map(c => <text key={c} x={point(`${c}1`)[0]} y="135" textAnchor="middle" fontSize="11" fill="#667081">{c}</text>)}
    {Array.from({ length: assembly.board.rows }, (_, i) => <g key={i}><text x={480 + offset} y={ys(i + 1) + 4} textAnchor="end" fontSize="10" fill="#758194">{i + 1}</text><text x={733 + offset} y={ys(i + 1) + 4} fontSize="10" fill="#758194">{i + 1}</text></g>)}
    {contacts(assembly.board).map(h => { const [x, y] = point(h); return <g key={h} role="button" tabIndex={0} aria-label={`Contacto ${h}`} onKeyDown={e => key(e, `bb:${h}`)} onClick={() => onSelect(`bb:${h}`)} style={{ cursor: "pointer" }}>
      {active(`bb:${h}`) && <circle cx={x} cy={y} r="8" fill="#3b9edc" opacity=".3"/>}<rect x={x - 3.4} y={y - 3.4} width="6.8" height="6.8" rx="1.8" fill={active(`bb:${h}`) ? "#237db3" : "#737f8d"}/><title>{h} · {contactStrip(h, assembly.board)}</title></g>; })}
    {[...origin].map(([id, { x, y, type }]) => {
      const p = assembly.parts.find(p => p.id === id)!;
      if (type === "esp32") return <g key={id}>
        <rect x={x} y={y} width="230" height="470" rx="12" fill="#203b37" stroke="#102623" strokeWidth="3"/>
        <rect x={x + 12} y={y + 8} width="14" height="422" rx="3" fill="#101a1b"/><rect x={x + 204} y={y + 8} width="14" height="422" rx="3" fill="#101a1b"/>
        <rect x={x + 44} y={y + 15} width="142" height="100" fill="#1d2526"/>
        <path d={`M${x+55} ${y+85} v-50 h12 v50 h12 v-50 h12 v50 h12 v-50 h12 v50 h12 v-50 h12`} stroke="#baac6b" fill="none" strokeWidth="4"/>
        <rect x={x + 52} y={y + 115} width="126" height="150" rx="3" fill="url(#metal)" stroke="#6a7781"/>
        <text x={x + 115} y={y + 152} textAnchor="middle" fill="#3b454b" fontSize="13" fontWeight="700">ESP-WROOM-32</text>
        <text x={x + 115} y={y + 178} textAnchor="middle" fill="#616970" fontSize="11">Wi-Fi / Bluetooth</text>
        <text x={x + 115} y={y + 225} textAnchor="middle" fill="#535f69" fontSize="22">CE</text>
        <rect x={x + 92} y={y + 294} width="45" height="42" fill="#1c2328" stroke="#87929a"/>
        <text x={x + 115} y={y + 355} textAnchor="middle" fill="#dce6e1" fontSize="10">USB–UART</text>
        <rect x={x + 66} y={y + 392} width="32" height="25" rx="3" fill="#c2c9c7"/><circle cx={x + 82} cy={y + 404} r="7" fill="#222c2a"/>
        <rect x={x + 134} y={y + 392} width="32" height="25" rx="3" fill="#c2c9c7"/><circle cx={x + 150} cy={y + 404} r="7" fill="#222c2a"/>
        <text x={x + 82} y={y + 437} textAnchor="middle" fill="#dce6e1" fontSize="10">EN</text><text x={x + 150} y={y + 437} textAnchor="middle" fill="#dce6e1" fontSize="10">BOOT</text>
        <rect x={x + 81} y={y + 439} width="68" height="40" rx="4" fill="url(#metal)" stroke="#6c7581" strokeWidth="2"/><rect x={x + 91} y={y + 467} width="48" height="9" rx="3" fill="#34414c"/>
        {definition(assembly,p).pins.map(pin => { const pt = ends.get(`${id}:${pin.id}`)!; const left = pt[0] < x; return <g key={pin.id}>{pinMark(`${id}:${pin.id}`,pt[0],pt[1])}<text x={left ? x+31 : x+199} y={pt[1]+4} textAnchor={left?"start":"end"} fill={pin.id.startsWith("GND")?"#e0e4e1":pin.id==="3V3"||pin.id==="VIN"?"#f0ba77":"#d4ded9"} fontSize="11">{labelPin(pin.id)}</text></g>; })}
        <path d={`M${x+115} ${y+480} v60 q0 25 35 25 h85`} stroke="#27313e" strokeWidth="12" fill="none"/><text x={x+115} y={y+590} textAnchor="middle" fill="#344255" fontSize="13">USB de datos → computadora</text>
      </g>;
      if (type !== "dht11" && type !== "pir") return <g key={id}>
        <rect x={x-8} y={y+6} width="185" height={50+definition(assembly,p).pins.length*24} rx="6" fill="#dce6ef" stroke="#9aafc0"/>
        <text x={x+5} y={y+25} fill="#26344a" fontSize="12">{definition(assembly,p).name.slice(0,23)}</text>
        {definition(assembly,p).pins.map(pin=>{const pt=ends.get(`${id}:${pin.id}`)!;return <g key={pin.id}>{pinMark(`${id}:${pin.id}`,pt[0],pt[1])}<text x={pt[0]+12} y={pt[1]+4} fill="#26344a" fontSize="12">{pin.id.slice(0,20)}</text></g>;})}
      </g>;
      const isDht = type === "dht11";
      return <g key={id}>
        <text x={x + 65} y={y - 12} textAnchor="middle" fill="#28364b" fontWeight="600" fontSize="17">{isDht ? "DHT11" : type === "pir" ? "PIR · HC-SR501" : definition(assembly,p).name}</text>
        <rect x={x - 5} y={y + 3} width="145" height="177" rx="5" fill={isDht ? "#243c5d" : "#26734d"} stroke="#1b4335" strokeWidth="2"/>
        {isDht ? <g><rect x={x + 7} y={y + 12} width="121" height="125" rx="5" fill="#3188c8" stroke="#14669e" strokeWidth="2"/>{Array.from({length:6},(_,i)=><g key={i}>{[0,1,2].map(j=><rect key={j} x={x+17+i*17} y={y+25+j*31} width="9" height="20" rx="2" fill="#134e79"/>)}</g>)}<text x={x+65} y={y+158} textAnchor="middle" fill="#dce6f0" fontSize="11">−     OUT     +</text></g> : <g>
          {pirBack ? <g>
            {[12,105].flatMap(dx=>[24,92].map(dy=><g key={`${dx}-${dy}`}><ellipse cx={x+dx} cy={y+dy} rx="12" ry="16" fill="#202d30"/><ellipse cx={x+dx} cy={y+dy-4} rx="10" ry="9" fill="url(#metal)"/><path d={`M${x+dx-4} ${y+dy-4} h8 M${x+dx} ${y+dy-8} v8`} stroke="#6d7a83"/></g>))}
            <rect x={x+37} y={y+28} width="47" height="75" fill="#20272a"/><text x={x+61} y={y+67} fill="#dce5df" fontSize="9" textAnchor="middle">BISS0001</text>
            <text x={x+66} y={y+129} fill="#e0eadf" fontSize="10" textAnchor="middle">VCC / OUT / GND: leer PCB</text>
          </g> : <g>
          <circle cx={x+65} cy={y+73} r="65" fill="url(#lens)" stroke="#b8c5cf" strokeWidth="2"/>
          {[0,1,2,3].map(i=><ellipse key={i} cx={x+65} cy={y+73} rx={15+i*13} ry="61" fill="none" stroke="#c3d0da"/>)}
          {[35,57,80,102].map(dy=><path key={dy} d={`M${x+10} ${y+dy} Q${x+65} ${y+dy+15} ${x+120} ${y+dy}`} stroke="#c3d0da" fill="none"/>)}
          </g>}
          <rect x={x+8} y={y+143} width="25" height="23" rx="3" fill="#dd9435"/><rect x={x+47} y={y+143} width="25" height="23" rx="3" fill="#dd9435"/>
          <path d={`M${x+10} ${y+154} h20 M${x+49} ${y+154} h20`} stroke="#594529" strokeWidth="2"/>
          <rect x={x+99} y={y+145} width="25" height="15" fill="#e3c326"/><text x={x+112} y={y+175} textAnchor="middle" fontSize="9" fill="#f0e9b1">H / L</text>
        </g>}
        {definition(assembly,p).pins.map(pin => {const pt=ends.get(`${id}:${pin.id}`)!;return <g key={pin.id}><path d={`M${pt[0]} ${y+180} V${pt[1]}`} stroke="#b89c50" strokeWidth="5"/>{pinMark(`${id}:${pin.id}`,pt[0],pt[1],undefined,pt[0],pt[1]-14)}</g>;})}
        <text x={x+65} y={y+(isDht?260:285)} textAnchor="middle" fontSize="11" fill="#64748b">{isDht ? "Orden − OUT + reportado" : "Orden de pines por confirmar"}</text>
      </g>;
    })}
    {wires.map((w, i) => {
      const a = ends.get(w.from), b = ends.get(w.to); if (!a || !b) return null;
      const c = wireColors[w.color ?? "blue"].hex;
      const across = (a[0] < 400 && b[0] > 850) || (b[0] < 400 && a[0] > 850);
      const d = w.bends !== undefined ? `M${a} ${w.bends.map(p=>`L${p}`).join(" ")} L${b}` : across ? `M${a} H${330 + i * 3} V${760 + (i%3)*16} H875 V${b[1]} H${b[0]}` : a[0] > 850 || b[0] > 850 ? `M${a} H${850 + (i%4)*12} V${b[1]} H${b[0]}` : `M${a} H${350 + (i%4)*12} V${b[1]} H${b[0]}`;
      return <g key={w.id} data-wire={w.id}><path d={d} stroke="#fffefa" strokeWidth={active(w.from)?10:8} strokeLinecap="round" strokeLinejoin="round" fill="none"/><path data-wire-color={w.color??"blue"} d={d} stroke={c} strokeWidth={active(w.from)?5.5:4} strokeLinecap="round" strokeLinejoin="round" filter="url(#wire-shadow)" fill="none"><title>{terminalLabel(w.from)} → {terminalLabel(w.to)}</title></path><circle cx={a[0]} cy={a[1]} r="4.2" fill={c}/><circle cx={b[0]} cy={b[1]} r="4.2" fill={c}/></g>;
    })}

    {[...origin].filter(([,o]) => o.type === "dht11" || o.type === "pir").map(([id]) => {
      const p=assembly.parts.find(p=>p.id===id)!;
      return <g key={`labels-${id}`}>{definition(assembly,p).pins.map(pin=>{
        const pt=ends.get(`${id}:${pin.id}`)!;
        const text=p.definition==="dht11"?({GND:"−",DATA:"OUT",VCC:"+"}[pin.id]??pin.id):pin.id;
        return <g key={pin.id}><rect x={pt[0]-19} y={pt[1]-23} width="38" height="16" rx="3" fill="#fffefa"/><text x={pt[0]} y={pt[1]-11} textAnchor="middle" fontSize="12" fontWeight="600" fill="#26344a">{text}</text></g>;
      })}</g>;
    })}
    {assembly.parts.filter(p=>Object.keys(p.holes).length).map(p=>{
      const entries=Object.entries(p.holes),a=entries[0]&&point(entries[0][1]),b=entries[1]&&point(entries[1][1]);if(!a||!b)return null;
      const cx=(a[0]+b[0])/2,cy=(a[1]+b[1])/2,angle=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI,value=p.resistance??1000;
      const bands=value===10000?["#764124","#202020","#e77a20","#c3a243"]:value===1000?["#764124","#202020","#d92f36","#c3a243"]:null;
      return <g key={p.id}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#b6b3a8" strokeWidth="3"/><g transform={`translate(${cx} ${cy}) rotate(${angle})`}><rect x="-29" y="-9" width="58" height="18" rx="7" fill="#dfc79c" stroke="#a99470"/>{bands?.map((color,i)=><rect key={i} x={-18+i*12} y="-9" width="5" height="18" fill={color}/>)}</g><text x={cx} y={cy-20} textAnchor="middle" fontSize="12" fontWeight="600" fill="#344255">{p.id} · {value>=1000?`${value/1000} kΩ`:`${value} Ω`}</text>{entries.map(([pin,h])=>{const [x,y]=point(h);return pinMark(`${p.id}:${pin}`,x,y);})}</g>;
    })}
  </svg>;
}
