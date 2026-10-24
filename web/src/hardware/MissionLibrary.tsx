import { useRef, useState } from "react";
import { Button } from "../ui/Button";
import { missions } from "./missions";
import { MissionDiagram } from "./MissionDiagram";
function download(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
export function MissionLibrary({ onOpenNfc, onOpenAmbient }: { onOpenNfc: () => void; onOpenAmbient: () => void }) {
  const [id, setId] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    return missions.some(m => m.id === q.get("banco")) ? q.get("banco")! : q.get("guia") === "ambiente" ? "ambiente" : "nfc";
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [exportMessage, setExportMessage] = useState("");
  const diagram = useRef<HTMLDivElement>(null);
  const mission = missions.find(m=>m.id===id)!;
  const exportSvg = () => {
    const source = diagram.current?.querySelector("svg"); if (!source) return;
    const svg = source.cloneNode(true) as SVGElement;
    svg.setAttribute("width", "1000"); svg.removeAttribute("class");
    svg.querySelectorAll("[data-mission-wire]").forEach(w=>{w.setAttribute("opacity","1");w.removeAttribute("role");w.removeAttribute("tabindex");});
    download(`classai-${mission.code.toLowerCase()}-${mission.id}.svg`, new XMLSerializer().serializeToString(svg), "image/svg+xml");
    setExportMessage(`Esquema ${mission.code} exportado; sus pendientes forman parte del dibujo.`);
  };
  return <section className="mb-8 min-w-0 border-b border-line pb-6" aria-label="Biblioteca de bancos">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-heading">Esquemas por banco</h2><p className="mt-1 max-w-3xl text-small text-fg-2">Tres bloques: NFC / sesión, ambiente / actuación e interfaz / audio. Hoy hay dos ESP32 disponibles: ensayos separados antes de integrar.</p></div><Button size="sm" onClick={()=>{download("classai-bancos-referencia.json",JSON.stringify({format:"classai-bank-reference-v1",status:"propuesto",missions},null,2),"application/json");setExportMessage("Colección exportada como referencia; no es un montaje físico aprobado ni el JSON del editor de ambiente.");}}>Exportar colección JSON</Button></div>
    <div className="mb-4 rounded-lg border border-line bg-surface p-4"><h3 className="text-label">Qué armar después</h3><p className="mt-1 text-small text-fg-2">Ahora: LED + botón. Cuando termine la cabecera: NFC solo, tarjeta y llavero antes de HCE. Después: una bocina con MAX98357A, tras revisar adaptador y fuente. Soldadura de NFC/bocinas declarada en curso; no terminada ni probada.</p><p className="mt-2 text-caption text-regular-text">Dos bancos candidatos: NFC (12 M–H) + LED/botón (3 M–H y 2 M–M): 15 M–H frente a ~16 declarados en C-08 (si la cabecera NFC es macho). Con hembra: 9 M–H + 8 M–M para ambos bancos. NFC + ambiente consumirían 23 M–H: no reservar ambos a la vez con ese lote. Revisar disponibilidad libre; E-01 y los kits E siguen pendientes.</p></div>
    <div className="grid min-w-0 gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
      <label className="text-small xl:hidden">Banco de prueba<select aria-label="Elegir banco de prueba" className="mt-1 w-full rounded-md border border-line bg-surface p-2 text-fg" value={id} onChange={e=>{setId(e.target.value);setSelected(null);setExportMessage("");}}>{missions.map(m=><option key={m.id} value={m.id}>{m.code} · {m.title}</option>)}</select></label>
      <nav aria-label="Elegir banco" className="hidden content-start gap-1 xl:grid">{missions.map(m=><button key={m.id} data-bank-id={m.id} aria-pressed={id===m.id} onClick={()=>{setId(m.id);setSelected(null);setExportMessage("");}} className={`min-w-0 rounded-md border px-3 py-2 text-left ${id===m.id?"border-line-strong bg-hover":"border-transparent hover:bg-hover"}`}><span className="block text-caption text-muted">{m.code} · {m.group}</span><span className="block text-label">{m.title}</span></button>)}</nav>
      <article className="min-w-0" data-mission={mission.id}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-heading">{mission.code} · {mission.title}</h3><Button size="sm" onClick={exportSvg}>Descargar esquema SVG</Button></div>
        <p className="mt-1 text-small text-fg-2">{mission.summary}</p><p className="mt-2 text-caption text-regular-text">Propuesta sin ensayo físico · {mission.state}</p>
        <div className="my-3 flex flex-wrap items-center gap-2"><Button size="sm" disabled={selected===0} onClick={()=>setSelected(s=>Math.max(0,(s??1)-1))}>Conexión anterior</Button><Button size="sm" disabled={selected===mission.links.length-1} onClick={()=>setSelected(s=>Math.min(mission.links.length-1,(s??-1)+1))}>Conexión siguiente</Button><Button size="sm" variant="ghost" onClick={()=>setSelected(null)}>Todas las conexiones</Button><span className="text-caption text-muted" aria-live="polite">{selected===null?`${mission.links.length} tramos`: `${selected+1} de ${mission.links.length}: ${mission.links[selected]!.from} → ${mission.links[selected]!.to}`}</span></div>
        <div ref={diagram} className="overflow-x-auto rounded-lg border border-line bg-sunken"><MissionDiagram mission={mission} selected={selected} onSelect={setSelected}/></div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2"><section><h4 className="text-label">Materiales de este banco</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-small text-fg-2">{mission.materials.map(m=><li key={m}>{m}</li>)}</ul><p className="mt-2 text-small"><strong>Cables:</strong> {mission.jumpers}</p></section><section><h4 className="text-label">Antes de conectar</h4><ol className="mt-2 list-decimal space-y-1 pl-5 text-small text-fg-2">{mission.checks.map(c=><li key={c}>{c}</li>)}</ol></section></div>
        <div className="mt-4 space-y-2 border-t border-line pt-3 text-small text-fg-2"><p><strong>Resultado esperado:</strong> {mission.test}</p><p><strong>Firmware:</strong> {mission.firmware}</p><p className="text-regular-text"><strong>Separar de otros bancos:</strong> {mission.conflicts}</p></div>
        {mission.id==="nfc"&&<div className="mt-3"><Button size="sm" onClick={onOpenNfc}>Abrir montaje físico NFC</Button><p className="mt-1 text-caption text-muted">ESP32, protoboard y PN532 con 12 cables numerados. Abre en memoria; conserva lo guardado hasta guardar otra revisión.</p></div>}
        {mission.id==="ambiente"&&<div className="mt-3"><Button size="sm" onClick={onOpenAmbient}>Ver distribución física de ambiente</Button></div>}
        <div className="mt-3 flex flex-wrap gap-3 text-caption">{mission.sources.map(s=><a key={s.url} className="text-link underline" href={s.url}>{s.title}</a>)}</div>
        <p role="status" className="mt-2 text-caption text-muted">{exportMessage}</p>
      </article>
    </div>
  </section>;
}
