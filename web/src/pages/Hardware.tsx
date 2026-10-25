import { useRef, useState, type FormEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { nfcAssembly } from "../hardware/nfc";
import { NfcGuide } from "../hardware/NfcGuide";
import * as Dialog from "@radix-ui/react-dialog";
import { useSearchParams } from "react-router";
import { Download, Plus, Undo2, Upload, X, ChevronLeft, ChevronRight, Info, Settings2, Cable, History, Package, Maximize2 } from "lucide-react";
import { missions } from "../hardware/missions";
import { MissionDiagram } from "../hardware/MissionDiagram";
import { Button } from "../ui/Button";
import { MissionLibrary } from "../hardware/MissionLibrary";
import { WiringReference } from "../hardware/WiringReference";
import { routingMetrics } from "../hardware/routing";
import example from "../hardware/example.json";
import { AssemblyBoard, terminalLabel, wireColors } from "../hardware/AssemblyBoard";
import { analyze, contacts, definition, parseAssembly, recordRevision, terminals, type Assembly, type Wire } from "../hardware/model";

const storageKey = "classai.hardware.v1";
const initial = () => {
  try {
    const raw = localStorage.getItem(storageKey);
    const stored = parseAssembly(raw ?? JSON.stringify(nfcAssembly));
    const query = new URLSearchParams(window.location.search);
    const guide = query.get("banco") ?? query.get("guia");
    if (raw && (guide === "nfc" || guide === "ambiente") && stored.parts.some(p=>p.definition === "pn532") === (guide === "nfc")) return {assembly:stored,message:"Revisión local recuperada; no se sobrescribe al abrir el banco."};
    if (guide === "ambiente" || guide === "nfc") return { assembly: { ...parseAssembly(JSON.stringify(guide === "nfc" ? nfcAssembly : example)), revisions: stored.revisions }, message: "Guía completa abierta en memoria; el montaje guardado se conserva hasta guardar otra revisión." };
    return { assembly: stored, message: "" };
  }
  catch { return { assembly: parseAssembly(JSON.stringify(new URLSearchParams(window.location.search).get("guia") === "nfc" ? nfcAssembly : example)), message: "El borrador local no se pudo leer; se muestra el ejemplo sin sobrescribirlo. Importa una copia válida o guarda una revisión para reemplazarlo." }; }
};
const field = "w-full min-w-0 rounded-md border border-line bg-surface px-2 py-1.5 text-small text-fg";

export function Hardware() {
  const [loaded] = useState(initial);
  const [query, setQuery] = useSearchParams();
  const bankId = query.get("banco") ?? query.get("guia") ?? (loaded.assembly.parts.some(p => p.definition === "pn532") ? "nfc" : "ambiente");
  const mission = missions.find(m => m.id === bankId) ?? missions.find(m => m.id === "nfc")!;
  const physicalBank = mission.id === "nfc" || mission.id === "ambiente";
  const [inspector, setInspector] = useState<string | null>(null);
  const [logicalStep, setLogicalStep] = useState<number | null>(null);
  const diagram = useRef<HTMLDivElement>(null);
  // Keep unsaved layouts independently while browsing banks. localStorage is only written by Save.
  const drafts = useRef(new Map<string, Assembly>());
  const [assembly, setAssembly] = useState(loaded.assembly);
  const [past, setPast] = useState<Assembly[]>([]);
  const [message, setMessage] = useState(loaded.message);
  const [selected, setSelected] = useState("");
  const [step, setStep] = useState<number | null>(null);
  const [draft, setDraft] = useState({ from: loaded.assembly.parts.some(p => p.definition === "pn532") ? "esp1:GPIO18" : "esp1:GPIO4", to: loaded.assembly.parts.some(p => p.definition === "pn532") ? "nfc1:SCK" : "dht1:DATA", note: "", color: "green" as Wire["color"] });
  const [editing, setEditing] = useState<string | null>(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pirBack, setPirBack] = useState(false);
  const [partType, setPartType] = useState("resistor");
  const isNfc = assembly.parts.some(p => p.definition === "pn532");
  // Browser Back/Forward can change the bank without clicking the sidebar.
  // Adjust before committing a render so an NFC route never shows the ambient model.
  if (physicalBank && isNfc !== (mission.id === "nfc")) {
    const next = drafts.current.get(mission.id) ?? parseAssembly(JSON.stringify(mission.id === "nfc" ? nfcAssembly : example));
    setAssembly({ ...next, revisions: assembly.revisions });
    setStep(null); setSelected(""); setPast([]);
  }
  const result = analyze(assembly);
  const routing = routingMetrics(assembly);
  const holes = Array.from({ length: assembly.board.rows }, (_, i) => [..."ABCDEFGHIJ"].map(c => `${c}${i + 1}`)).flat();
  const allContacts = contacts(assembly.board);
  const focusNet = (end: string) => { setSelected(end); setStep(null); setInspector(null); };
  const update = (next: Assembly) => {
    try {
      const checked = parseAssembly(JSON.stringify(next));
      drafts.current.set(checked.parts.some(p=>p.definition === "pn532") ? "nfc" : "ambiente", checked);
      setPast(p => [...p.slice(-19), assembly]); setAssembly(checked); setStep(null); setMessage("Cambios en memoria. Guarda una revisión o exporta antes de cerrar.");
    } catch (e) { setMessage((e as Error).message); }
  };
  const loadNfc = () => {
    update({ ...parseAssembly(JSON.stringify(nfcAssembly)), revisions: assembly.revisions });
    setSelected("nfc1:VCC"); setEditing(null); setZoom(1);
    setDraft({ from: "esp1:GPIO18", to: "nfc1:SCK", note: "", color: "blue" });
  };
  const loadAmbient = () => {
    update({ ...parseAssembly(JSON.stringify(example)), revisions: assembly.revisions });
    setSelected(""); setEditing(null); setZoom(1);
    setDraft({ from: "esp1:GPIO4", to: "dht1:DATA", note: "", color: "green" });
  };
  const selectBank = (id: string) => {
    if (physicalBank) drafts.current.set(mission.id, assembly);
    if (id === "nfc" || id === "ambiente") {
      const cached = drafts.current.get(id);
      const next = cached ?? parseAssembly(JSON.stringify(id === "nfc" ? nfcAssembly : example));
      setAssembly({ ...next, revisions: assembly.revisions });
      setPast([]); setStep(null); setSelected(""); setEditing(null); setZoom(1);
      setDraft(id === "nfc" ? { from: "esp1:GPIO18", to: "nfc1:SCK", note: "", color: "blue" } : { from: "esp1:GPIO4", to: "dht1:DATA", note: "", color: "green" });
    }
    setLogicalStep(null); setInspector(null);
    setQuery({ banco: id, ...(id === "nfc" || id === "ambiente" ? { guia: id } : {}) });
  };
  const exportSvg = () => {
    const svg = renderToStaticMarkup(<AssemblyBoard assembly={assembly} wires={assembly.wires} selected="" onSelect={() => {}} connected={() => false} />);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const a = document.createElement("a"); a.href = url; a.download = isNfc ? "classai-nfc-fisico.svg" : "classai-montaje-fisico.svg"; a.click(); URL.revokeObjectURL(url);
    setMessage("Dibujo completo exportado; incluye todos los cables aunque estés recorriendo un paso.");
  };
  const save = () => {
    try {
      const next = recordRevision(assembly, revisionNote);
      localStorage.setItem(storageKey, JSON.stringify(next));
      setAssembly(next); setRevisionNote(""); setMessage("Revisión guardada en este navegador. Exporta JSON para conservar una copia fuera del equipo.");
    } catch (e) { setMessage(`No se guardó: ${(e as Error).message}`); }
  };
  const exportFile = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(assembly, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "classai-montaje.json"; a.click(); URL.revokeObjectURL(url);
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 500_000) { setMessage("El archivo supera 500 kB."); return; }
    try { const imported = parseAssembly(await file.text()); update(imported); const id = imported.parts.some(p=>p.definition === "pn532") ? "nfc" : "ambiente"; setQuery({banco:id,guia:id}); } catch (e) { setMessage(`Importación rechazada: ${(e as Error).message}`); }
  };
  const connect = (e: FormEvent) => {
    e.preventDefault();
    const previous = assembly.wires.find(w => w.id === editing);
    const wire: Wire = { ...draft, bends: previous?.from === draft.from && previous?.to === draft.to ? previous.bends : undefined, id: editing ?? `w-${crypto.randomUUID().slice(0, 8)}` };
    update({ ...assembly, wires: editing ? assembly.wires.map(w => w.id === editing ? wire : w) : [...assembly.wires, wire] });
  };
  const visibleWires = step === null ? assembly.wires : assembly.wires.slice(0, step);
  const errors = result.findings.filter(f => f.level === "error");
  const exportDiagram = () => {
    if (physicalBank) return exportSvg();
    const source = diagram.current?.querySelector("svg");
    if (!source) return;
    const svg = source.cloneNode(true) as SVGElement;
    svg.querySelectorAll("[data-mission-wire]").forEach(w=>w.setAttribute("opacity","1"));
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
    const a = document.createElement("a"); a.href = url; a.download = `classai-${mission.id}.svg`; a.click(); URL.revokeObjectURL(url);
  };
  const inspectorTabs = [ ["guia", "Guía", Info], ["materiales", "Materiales", Package], ["pines", "Pines y cables", Cable], ["editar", "Editar", Settings2], ["historial", "Historial", History] ] as const;
  return <section className="hardware-workbench" aria-label="Espacio de trabajo de montajes">
    <MissionLibrary selected={mission.id} onSelect={selectBank} />
    <article className="hardware-stage" data-mission={mission.id}>
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0"><h1 className="text-heading">{mission.title}</h1><p className="mt-0.5 text-caption text-muted">{mission.code} · {physicalBank ? "Montaje físico" : "Esquema lógico · montaje físico pendiente"}</p></div>
        <div className="flex items-center gap-1"><Button size="sm" icon={<Download size={14}/>} onClick={exportDiagram}>SVG</Button><Button size="sm" icon={<Info size={14}/>} aria-expanded={inspector !== null} onClick={()=>setInspector("guia")}>Detalles</Button></div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 text-caption">
        <span className={mission.id === "nfc" ? "text-ok-text" : "text-muted"}>{mission.id === "nfc" ? "Referencia NFC probada · RF intermitente" : mission.state}</span>
        <span className="text-muted">{physicalBank ? `${assembly.wires.length} cables · ${routing.turns} giros dibujados` : `${mission.links.length} conexiones propuestas`}</span>
      </div>
      <div ref={diagram} className={`hardware-canvas ${zoom === 1 ? "hardware-canvas-fit" : ""}`} aria-label={physicalBank ? "Distribución y conexiones" : "Conexiones lógicas"}>
        {physicalBank ? <AssemblyBoard pirBack={pirBack} zoom={zoom} assembly={assembly} wires={visibleWires} selected={step !== null && step > 0 ? assembly.wires[step-1]!.from : selected} onSelect={end => {setSelected(end);setInspector("pines");}} connected={analyze({ ...assembly, wires: visibleWires }).connected}/> : <MissionDiagram mission={mission} selected={logicalStep} onSelect={setLogicalStep}/>}
      </div>
      <footer className="shrink-0 border-t border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" aria-label="Pasos de armado">
          <div className="flex items-center gap-1">
            <Button size="sm" variant={step !== null || logicalStep !== null ? "secondary" : "primary"} onClick={()=>physicalBank?setStep(0):setLogicalStep(0)}>Recorrer armado</Button>
            <Button size="sm" aria-label="Anterior" icon={<ChevronLeft size={15}/>} disabled={physicalBank ? step === null || step === 0 : logicalStep === null || logicalStep === 0} onClick={()=>physicalBank?setStep(s=>Math.max(0,(s??0)-1)):setLogicalStep(s=>Math.max(0,(s??0)-1))}/>
            <Button size="sm" aria-label="Siguiente" icon={<ChevronRight size={15}/>} disabled={physicalBank ? step === null || step >= assembly.wires.length : logicalStep === null || logicalStep >= mission.links.length-1} onClick={()=>physicalBank?setStep(s=>Math.min(assembly.wires.length,(s??0)+1)):setLogicalStep(s=>Math.min(mission.links.length-1,(s??0)+1))}/>
            <Button size="sm" variant="ghost" onClick={()=>{setStep(null);setLogicalStep(null);setSelected("");}}>Ver todo</Button>
          </div>
          {physicalBank && <div className="flex items-center gap-2"><select aria-label="Escala del montaje" className="rounded border border-line bg-surface px-1 py-1 text-caption" value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value={1}>Ajustar</option>{[0.6,0.8,1.2].map(z=><option key={z} value={z}>{Math.round(z*100)} %</option>)}</select><Button size="sm" aria-label="Ajustar dibujo" icon={<Maximize2 size={14}/>} onClick={()=>setZoom(1)}/></div>}
        </div>
        <p className="truncate border-t border-line-subtle px-4 py-2 text-caption text-fg-2" aria-live="polite">{physicalBank ? step === null ? "Selecciona un pin para ver su red o recorre el armado cable por cable." : step === 0 ? "Coloca los componentes con el USB desconectado." : `${step}/${assembly.wires.length} · ${assembly.wires[step-1]?.note || `${assembly.wires[step-1]?.from} → ${assembly.wires[step-1]?.to}`}` : logicalStep === null ? mission.summary : `${logicalStep+1}/${mission.links.length} · ${mission.links[logicalStep]?.from} → ${mission.links[logicalStep]?.to}`}</p>
      </footer>
      <div className="flex shrink-0 flex-wrap gap-1 border-t border-line px-3 py-2" aria-label="Herramientas del banco">{inspectorTabs.filter(([id])=>physicalBank || !["editar","historial"].includes(id)).map(([id,label,Icon])=><Button key={id} size="sm" variant="ghost" icon={<Icon size={14}/>} onClick={()=>setInspector(id)}>{label}</Button>)}</div>
    </article>
    <Dialog.Root open={inspector !== null} onOpenChange={open=>{if(!open)setInspector(null);}}>
      <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/20"/><Dialog.Content className="hardware-inspector fixed inset-y-0 right-0 z-60 flex w-[min(560px,100vw)] flex-col border-l border-line bg-page shadow-lg outline-none">
        <div className="flex items-center justify-between border-b border-line p-4"><div><Dialog.Title className="text-heading">{inspectorTabs.find(([id])=>id===inspector)?.[1]} · {mission.title}</Dialog.Title><Dialog.Description className="mt-1 text-caption text-muted">Solo el banco {mission.code}. No se carga firmware desde esta página.</Dialog.Description></div><Dialog.Close asChild><Button aria-label="Cerrar detalles" variant="ghost" icon={<X size={18}/>} /></Dialog.Close></div>
        <nav aria-label="Detalles del banco" className="flex shrink-0 flex-wrap gap-1 border-b border-line px-3 py-2">{inspectorTabs.filter(([id])=>physicalBank || !["editar","historial"].includes(id)).map(([id,label])=><Button key={id} size="sm" variant={inspector===id?"secondary":"ghost"} aria-pressed={inspector===id} onClick={()=>setInspector(id)}>{label}</Button>)}</nav>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {inspector === "guia" && <div className="space-y-4 text-small"><p className="text-fg-2">{mission.summary}</p><section><h2 className="mb-2 text-label">Antes de conectar</h2><ol className="list-decimal space-y-2 pl-5 text-fg-2">{mission.checks.map(c=><li key={c}>{c}</li>)}</ol></section><p><strong>Resultado esperado:</strong> {mission.test}</p><p className="break-words"><strong>Firmware:</strong> {mission.firmware}</p><p className="text-regular-text">{mission.conflicts}</p>{physicalBank && (isNfc ? <NfcGuide onLoad={loadNfc} onSignal={focusNet}/> : <WiringReference onSignal={()=>focusNet("esp1:GPIO4")}/>)}<div className="space-y-2">{mission.sources.map(s=><a key={s.url} className="block text-link underline" href={s.url}>{s.title}</a>)}</div></div>}
          {inspector === "materiales" && <div className="space-y-5"><section><h2 className="mb-3 text-heading">Módulos</h2>{mission.modules.map(m=><div key={m.name} className="flex justify-between gap-3 border-b border-line py-3 text-small"><span>{m.name}</span><span className="text-muted">{m.inventory}</span></div>)}</section><section><h2 className="mb-3 text-heading">Materiales de este banco</h2><ul className="list-disc space-y-2 pl-5 text-small text-fg-2">{mission.materials.map(m=><li key={m}>{m}</li>)}</ul><p className="mt-4 text-small"><strong>Cables:</strong> {mission.jumpers}</p></section></div>}
          {inspector === "pines" && <div className="space-y-4"><p className="text-small text-fg-2">{physicalBank ? `Contacto seleccionado: ${selected ? terminalLabel(selected) : "ninguno"}. Selecciona una conexión para resaltar su red.` : "Mapa por función. La posición física de los conectores sigue pendiente."}</p><div className="overflow-x-auto"><table aria-label="Mapeo de pines del banco" className="w-full text-left text-small"><thead className="text-muted"><tr><th className="py-2">Desde</th><th>Hasta</th><th>Por</th></tr></thead><tbody>{mission.links.map((link,i)=><tr key={i} className="border-t border-line"><td className="py-3 pr-2">{link.from}</td><td className="pr-2">{link.to}</td><td className="text-muted">{link.via??"Directo"}{link.pending?" · pendiente":""}</td></tr>)}</tbody></table></div>{physicalBank && <div className="space-y-1">{assembly.wires.map((w,i)=><button key={w.id} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-small hover:bg-hover" onClick={()=>{setSelected(w.from);setStep(i+1);setInspector(null);}}><span className="h-1.5 w-5 shrink-0 rounded" style={{background:wireColors[w.color??"blue"].hex}}/><span>{i+1}. {terminalLabel(w.from)} → {terminalLabel(w.to)}</span></button>)}</div>}</div>}
          {physicalBank && inspector === "editar" && <>
            <div className="mb-4 flex flex-wrap gap-2"><Button size="sm" icon={<Undo2 size={13}/>} disabled={!past.length} onClick={()=>{const previous=past.at(-1);if(previous){setAssembly({...previous,revisions:assembly.revisions});setPast(p=>p.slice(0,-1));setStep(null);}}}>Deshacer</Button><Button size="sm" onClick={isNfc?loadNfc:loadAmbient}>Cargar guía completa</Button><Button size="sm" onClick={exportSvg}>Exportar dibujo SVG</Button></div>
            <div className="space-y-3"><label className="block text-small">Nombre del montaje<input className={field} value={assembly.name} maxLength={120} onChange={e=>update({...assembly,name:e.target.value})}/></label><label className="block text-small">Observaciones y pendientes<input className={field} value={assembly.note} maxLength={2000} onChange={e=>update({...assembly,note:e.target.value})}/></label><label className="block text-small">Filas<select aria-label="Filas de protoboard" className={field} value={assembly.board.rows} onChange={e=>update({...assembly,board:{...assembly.board,rows:Number(e.target.value)}})}>{[30,63].map(n=><option key={n}>{n}</option>)}</select></label><label className="block text-small"><input type="checkbox" checked={!!assembly.board.rails} onChange={e=>update({...assembly,board:{...assembly.board,rails:e.target.checked}})}/> Mostrar rieles</label><label className="block text-small"><input type="checkbox" checked={!!assembly.board.splitRails} onChange={e=>update({...assembly,board:{...assembly.board,splitRails:e.target.checked}})}/> Rieles cortados a mitad</label>{!isNfc&&<Button size="sm" onClick={()=>{setPirBack(b=>!b);setInspector(null);}}>{pirBack?"Ver lente del PIR":"Ver reverso del PIR"}</Button>}</div>
        <details open className="mt-4"><summary className="cursor-pointer py-2 text-heading">Editar conexiones y colores</summary>
        <div className="overflow-x-auto"><table className="w-full text-left text-small"><thead className="text-muted"><tr><th className="p-2">Cable</th><th>Desde</th><th>Hasta</th><th>Acciones</th></tr></thead><tbody>{assembly.wires.map((w,i) => <tr key={w.id} className="border-t border-line"><td className="p-2">{i+1}</td><td><button className="text-link underline" onClick={() => setSelected(w.from)}>{terminalLabel(w.from)}</button></td><td>{terminalLabel(w.to)}</td><td className="flex gap-1 py-1"><Button size="sm" variant="ghost" onClick={() => { setEditing(w.id); setDraft({ from: w.from, to: w.to, note: w.note, color: w.color }); }}>Editar</Button><Button size="sm" variant="ghost" aria-label={`Quitar cable ${w.id}`} onClick={() => update({ ...assembly, wires: assembly.wires.filter(x => x.id !== w.id) })}>Quitar</Button></td></tr>)}</tbody></table></div>
        <form onSubmit={connect} className="mt-3 grid gap-2 sm:grid-cols-2">
          <datalist id="hardware-endpoints">{[...terminals(assembly), ...allContacts.map(h => `bb:${h}`)].map(t => <option key={t} value={t} />)}</datalist>
          <label className="text-small">Desde<input required aria-label="Terminal de origen" className={field} list="hardware-endpoints" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
          <label className="text-small">Hasta<input required aria-label="Terminal de destino" className={field} list="hardware-endpoints" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
          <label className="text-small">Color del cable<select aria-label="Color del cable" className={field} value={draft.color ?? "blue"} onChange={e => setDraft({...draft,color:e.target.value as Wire["color"]})}>{Object.entries(wireColors).map(([c,v])=><option key={c} value={c}>{v.label}</option>)}</select></label>
          <label className="text-small sm:col-span-2">Paso de armado<input className={field} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="Conectar este cable después de…" /></label>
          <div className="flex gap-2 sm:col-span-2"><Button type="submit" variant="primary">{editing ? "Aplicar cable" : "Añadir cable"}</Button>{editing && <Button onClick={() => { setEditing(null); setDraft({ from: "", to: "", note: "", color: "blue" }); }}>Nuevo cable</Button>}</div>
        </form></details>
      <details open className="min-w-0 space-y-5"><summary className="cursor-pointer py-2 text-heading">Catálogo y comprobaciones del montaje</summary><div className="grid gap-6 grid-cols-1">
        <section><h2 className="mb-2 text-heading">Componentes</h2><div className="mb-3 flex items-center gap-2"><select aria-label="Componente a añadir" className={field} value={assembly.catalog.some(d => d.id === partType) ? partType : assembly.catalog[0]!.id} onChange={e => setPartType(e.target.value)}>{assembly.catalog.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select><Button aria-label="Añadir componente" icon={<Plus size={15} />} onClick={() => { const type = assembly.catalog.some(d => d.id === partType) ? partType : assembly.catalog[0]!.id; const id = `${type.slice(0, 30)}-${crypto.randomUUID().slice(0, 6)}`; update({ ...assembly, parts: [...assembly.parts, { id, definition: type, inventory: "Por identificar", resistance: type === "resistor" ? 1000 : undefined, holes: type === "resistor" ? { "1": "C20", "2": "G20" } : {} }] }); }} /></div>
        {assembly.parts.map(p => <div key={p.id} className="mb-3 border-b border-line pb-3"><h3 className="text-label">{definition(assembly, p).name} <code className="text-caption text-muted">{p.id}</code></h3><label className="text-caption">ID de inventario<input className={field} value={p.inventory} onChange={e => update({ ...assembly, parts: assembly.parts.map(x => x.id === p.id ? { ...x, inventory: e.target.value } : x) })} /></label>
          {p.definition === "resistor" && <label className="text-caption">Valor de resistencia<select className={field} value={p.resistance ?? 1000} onChange={e=>update({...assembly,parts:assembly.parts.map(x=>x.id===p.id?{...x,resistance:Number(e.target.value)}:x)})}><option value={1000}>1 kΩ · café / negro / rojo / dorado</option><option value={10000}>10 kΩ · café / negro / naranja / dorado</option></select></label>}
          {p.definition === "resistor" && definition(assembly, p).pins.map(pin => <label key={pin.id} className="mt-1 block text-caption">Agujero de pata {pin.id}<select className={field} value={p.holes[pin.id] ?? ""} onChange={e => update({ ...assembly, parts: assembly.parts.map(x => x.id === p.id ? { ...x, holes: { ...x.holes, [pin.id]: e.target.value } } : x) })}>{holes.map(h => <option key={h}>{h}</option>)}</select></label>)}
          <Button size="sm" variant="ghost" className="mt-1" onClick={() => update({ ...assembly, parts: assembly.parts.filter(x => x.id !== p.id), wires: assembly.wires.filter(w => !w.from.startsWith(`${p.id}:`) && !w.to.startsWith(`${p.id}:`)) })}>Retirar componente y sus cables</Button>
        </div>)}</section>
        <section><h2 className="mb-2 text-heading">Comprobaciones</h2><p className="mb-2 text-caption text-muted">Comprueba tiras A–E/F–J, rieles continuos o partidos, ocupación, fuentes y funciones. No valida dimensiones, corriente ni niveles de señales.</p><ul className="space-y-2 text-small" aria-live="polite">{result.findings.map((f, i) => <li key={i} className={f.level === "error" ? "text-alert-text" : "text-muted"}>{f.level === "error" ? "Conflicto: " : "Pendiente: "}{f.text}</li>)}</ul></section>
      </div></details>

          </>}
          {physicalBank && inspector === "historial" && <>
            <div className="flex flex-wrap gap-2"><Button icon={<Download size={14}/>} onClick={exportFile}>Exportar JSON</Button><label className="relative"><input aria-label="Importar montaje JSON" type="file" accept="application/json,.json" className="absolute inset-0 z-10 w-full cursor-pointer opacity-0" onChange={e=>{void importFile(e.target.files?.[0]);e.target.value="";}}/><Button tabIndex={-1} icon={<Upload size={14}/>}>Importar JSON</Button></label></div>
    <section className="mt-8 border-t border-line pt-5"><h2 className="mb-2 text-heading">Registro de cambios</h2><p className="mb-3 text-small text-muted">Cada revisión conserva el montaje completo. Una nota no convierte el montaje en una prueba física aprobada.</p><div className="flex flex-wrap gap-2"><input aria-label="Descripción de la revisión" className={`${field} max-w-xl`} value={revisionNote} maxLength={2000} onChange={e => setRevisionNote(e.target.value)} placeholder="Qué cambió y qué se observó realmente" /><Button onClick={save}>Guardar revisión local</Button></div><ol className="space-y-2">{assembly.revisions.map((r, i) => <li key={`${r.at}-${i}`} className="flex flex-wrap items-center gap-3 text-small"><time>{new Date(r.at).toLocaleString("es-PE", { timeZone: "America/Lima" })}</time><span className="min-w-0 break-words">{r.note}</span><Button size="sm" onClick={() => { try { const snapshot = parseAssembly(r.snapshot); update({ ...snapshot, revisions: assembly.revisions }); } catch { setMessage("No se pudo recuperar esta revisión; el montaje actual se conserva."); } }}>Recuperar en borrador</Button></li>)}</ol></section>

          </>}
          {physicalBank && inspector === "editar" && <p className="mt-4 text-caption text-muted">{errors.length} conflictos modelados · {result.findings.filter(f=>f.level==="pending").length} verificaciones pendientes. Comprobar el modelo no certifica el circuito físico.</p>}
          {physicalBank && <p role="status" className="mt-3 text-caption text-fg-2">{message}</p>}
        </div>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </section>;
}
