import type { Mission, LinkKind } from "./missions";
const colors: Record<LinkKind, string> = { power: "#ce3247", ground: "#263647", signal: "#147b60", speaker: "#7650ab", flow: "#276ab0" };
function Symbol({ shape, x, y }: { shape: string; x: number; y: number }) {
  if (shape === "speaker" || shape === "fan") return <g transform={`translate(${x} ${y})`}><rect width="62" height="62" rx="8" fill="#273747"/><circle cx="31" cy="31" r="23" fill="#61768c" stroke="#d4dfe7" strokeWidth="2"/>{shape === "fan" ? [0,90,180,270].map(a=><path key={a} transform={`rotate(${a} 31 31)`} d="M31 31 Q10 12 22 9 Q43 10 31 31" fill="#1f2b38"/>) : <circle cx="31" cy="31" r="10" fill="#29394a"/>}</g>;
  if (shape === "computer") return <g transform={`translate(${x} ${y})`}><rect y="3" width="64" height="43" rx="4" fill="#334b64"/><rect x="5" y="8" width="54" height="32" fill="#c8e6f0"/><path d="M-5 52 H69 L60 45 H5 Z" fill="#8c9ba8"/></g>;
  const fill = shape === "nfc" ? "#246c4b" : shape === "screen" ? "#b32d43" : shape === "esp32" ? "#24443d" : "#285e85";
  return <g transform={`translate(${x} ${y})`}>
    <rect width="64" height="64" rx="5" fill={fill} stroke="#163149"/>
    {[0,1,2,3,4].map(i=><g key={i}><rect x="-4" y={8+i*10} width="6" height="5" fill="#cbb16d"/><rect x="62" y={8+i*10} width="6" height="5" fill="#cbb16d"/></g>)}
    {shape === "nfc" ? [0,1,2].map(i=><rect key={i} x={7+i*5} y={7+i*5} width={50-i*10} height={50-i*10} rx="6" fill="none" stroke="#d4c47c" strokeWidth="2"/>) : shape === "screen" ? <g><rect x="6" y="5" width="52" height="49" rx="2" fill="#173549"/><circle cx="23" cy="26" r="3" fill="#c4f2e9"/><circle cx="41" cy="26" r="3" fill="#c4f2e9"/><path d="M24 38 Q32 44 40 38" fill="none" stroke="#c4f2e9" strokeWidth="2"/></g> : shape === "matrix" ? Array.from({length:64},(_,i)=><circle key={i} cx={8+(i%8)*7} cy={8+Math.floor(i/8)*7} r="2" fill={i%3 ? "#5d2330" : "#fb6a56"}/>) : shape === "esp32" ? <g><rect x="13" y="8" width="38" height="35" rx="2" fill="#bcc7cc"/><path d="M16 4 h6 v8 h7 V4 h7 v8 h9" stroke="#cebe83" fill="none" strokeWidth="2"/><rect x="22" y="52" width="20" height="14" rx="2" fill="#c6d0d6"/></g> : shape === "led" ? <g><path d="M17 35 V23 A14 14 0 0 1 45 23 V35 Z" fill="#e24d4e"/><path d="M22 35 V55 M40 35 V55" stroke="#b4c1c9" strokeWidth="3"/></g> : shape === "relay" ? <g><rect x="8" y="7" width="48" height="31" rx="3" fill="#279ac9"/><rect x="8" y="44" width="48" height="13" fill="#6ebd8b"/><circle cx="17" cy="50" r="3" fill="#3b4b50"/><circle cx="32" cy="50" r="3" fill="#3b4b50"/><circle cx="47" cy="50" r="3" fill="#3b4b50"/></g> : shape === "mic" ? <g><circle cx="32" cy="25" r="16" fill="#c6ced2"/><circle cx="32" cy="25" r="7" fill="#3f505d"/><rect x="20" y="45" width="25" height="9" fill="#273747"/></g> : shape === "sensor" ? <g><rect x="5" y="7" width="24" height="43" fill="#49a8dc"/><circle cx="46" cy="32" r="16" fill="#e3edf3"/></g> : <g><rect x="15" y="15" width="34" height="34" fill="#1c2c3b"/><path d="M21 7 v8 M32 7 v8 M43 7 v8 M21 49 v8 M32 49 v8 M43 49 v8" stroke="#d3c38c" strokeWidth="3"/></g>}
  </g>;
}
export function MissionDiagram({ mission, selected = null, onSelect }: { mission: Mission; selected?: number | null; onSelect?: (index: number) => void }) {
  const height = 300 + mission.links.length * 64;
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 1000 ${height}`} className="block w-full min-w-[680px]" role="img" aria-label={`Esquema ${mission.code}: ${mission.title}`} data-mission-diagram={mission.id}>
    <title>{`${mission.code} · ${mission.title} · esquema de referencia, sin ensayo físico`}</title>
    <rect width="1000" height={height} rx="12" fill="#edf3f6"/>
    <g fontFamily="Arial, sans-serif" fill="#25384c">
      <text x="32" y="38" fontSize="23" fontWeight="700">{mission.code} · {mission.title}</text>
      <text x="32" y="64" fontSize="13">Mapa eléctrico por nombres · posiciones ordenadas por función, no por ubicación física</text>
      {mission.modules.map((m,i)=>{const x=38+i*(924/mission.modules.length);return <g key={m.name}><Symbol shape={m.shape} x={x} y={92}/><text x={x+80} y="118" fontSize={mission.modules.length>2?14:17} fontWeight="700">{m.name}</text><text x={x+80} y="142" fontSize="12" fill="#546d82">{m.inventory}</text></g>;})}
      <text x="40" y="194" fontSize="12" fill="#526c81">Conexiones por terminal · cada fila representa una red o tramo; no un cable H–H obligatorio</text>
      {mission.links.map((w,i)=>{const y=220+i*64,c=w.kind==="power"&&(w.from.includes("5 V")||w.from==="ESP32 · VIN")?"#ca7519":colors[w.kind],active=selected===null||selected===i;return <g key={i} data-mission-wire={i} opacity={active?1:.32} role={onSelect?"button":undefined} tabIndex={onSelect?0:undefined} aria-label={`Conexión ${i+1}: ${w.from} a ${w.to}`} onClick={()=>onSelect?.(i)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect?.(i);}}} style={onSelect?{cursor:"pointer"}:undefined}>
        <rect x="20" y={y-8} width="960" height="56" rx="7" fill={selected===i?"#d8e9f3":"#fff"} stroke={selected===i?"#659bc0":"#d4dfe7"}/>
        <text x="34" y={y+19} fontSize="12" fill="#637f94">{i+1}</text>
        <text x="62" y={y+19} fontSize="14" fontWeight="600">{w.from}</text>
        <rect x="365" y={y+6} width="9" height="12" rx="2" fill="#c5aa65" stroke="#816f42"/>
        <path d={`M374 ${y+12} H636`} stroke={c} strokeWidth={selected===i?6:4} strokeLinecap="round" strokeDasharray={w.pending?"8 6":undefined} fill="none"/>
        <rect x="636" y={y+6} width="9" height="12" rx="2" fill="#c5aa65" stroke="#816f42"/>
        <text x="658" y={y+19} fontSize="14" fontWeight="600">{w.to}</text>
        {w.via&&<g><rect x="380" y={y-7} width="248" height="17" rx="4" fill="#edf3f6"/><text x="504" y={y+5} textAnchor="middle" fontSize="11" fill="#344f63">{w.via}</text></g>}
        <text x="62" y={y+39} fontSize="11" fill={w.pending?"#9b6418":"#61788b"}>{w.pending?"Condicionado: resolver antes de energizar":w.kind==="power"?"Alimentación":w.kind==="ground"?"Masa / retorno":w.kind==="speaker"?"Salida de altavoz: no GND":w.kind==="flow"?"Flujo; no unión GPIO entre placas":"Señal"}</text>
      </g>;})}
      <text x="32" y={height-24} fontSize="12" fill="#526c81">Continuo: conexión propuesta · discontinuo: pendiente · comprobar kit, pinout y alimentación antes del ensayo</text>
    </g>
  </svg>;
}
