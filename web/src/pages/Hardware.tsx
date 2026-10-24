import { useState, type FormEvent } from "react";
import { Download, Plus, Undo2, Upload } from "lucide-react";
import { PageHeader } from "../ui/PageHeader";
import { Button } from "../ui/Button";
import example from "../hardware/example.json";
import { AssemblyBoard, terminalLabel, wireColors } from "../hardware/AssemblyBoard";
import { analyze, contacts, definition, parseAssembly, recordRevision, terminals, type Assembly, type Wire } from "../hardware/model";

const storageKey = "classai.hardware.v1";
const initial = () => {
  try {
    const raw = localStorage.getItem(storageKey);
    const stored = parseAssembly(raw ?? JSON.stringify(example));
    if (new URLSearchParams(window.location.search).get("guia") === "ambiente") return { assembly: { ...parseAssembly(JSON.stringify(example)), revisions: stored.revisions }, message: "Guía completa abierta en memoria; el montaje guardado se conserva hasta guardar otra revisión." };
    return { assembly: stored, message: "" };
  }
  catch { return { assembly: parseAssembly(JSON.stringify(example)), message: "El borrador local no se pudo leer; se muestra el ejemplo sin sobrescribirlo. Importa una copia válida o guarda una revisión para reemplazarlo." }; }
};
const field = "w-full min-w-0 rounded-md border border-line bg-surface px-2 py-1.5 text-small text-fg";

export function Hardware() {
  const [loaded] = useState(initial);
  const [assembly, setAssembly] = useState(loaded.assembly);
  const [past, setPast] = useState<Assembly[]>([]);
  const [message, setMessage] = useState(loaded.message);
  const [selected, setSelected] = useState("esp1:GND");
  const [step, setStep] = useState<number | null>(null);
  const [draft, setDraft] = useState({ from: "esp1:GPIO4", to: "dht1:DATA", note: "", color: "green" as Wire["color"] });
  const [editing, setEditing] = useState<string | null>(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pirBack, setPirBack] = useState(false);
  const [partType, setPartType] = useState("resistor");
  const result = analyze(assembly);
  const holes = Array.from({ length: assembly.board.rows }, (_, i) => [..."ABCDEFGHIJ"].map(c => `${c}${i + 1}`)).flat();
  const allContacts = contacts(assembly.board);
  const update = (next: Assembly) => {
    try {
      const checked = parseAssembly(JSON.stringify(next));
      setPast(p => [...p.slice(-19), assembly]); setAssembly(checked); setStep(null); setMessage("Cambios en memoria. Guarda una revisión o exporta antes de cerrar.");
    } catch (e) { setMessage((e as Error).message); }
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
    try { update(parseAssembly(await file.text())); } catch (e) { setMessage(`Importación rechazada: ${(e as Error).message}`); }
  };
  const connect = (e: FormEvent) => {
    e.preventDefault();
    const previous = assembly.wires.find(w => w.id === editing);
    const wire: Wire = { ...draft, bends: previous?.from === draft.from && previous?.to === draft.to ? previous.bends : undefined, id: editing ?? `w-${crypto.randomUUID().slice(0, 8)}` };
    update({ ...assembly, wires: editing ? assembly.wires.map(w => w.id === editing ? wire : w) : [...assembly.wires, wire] });
  };
  const visibleWires = step === null ? assembly.wires : assembly.wires.slice(0, step);
  const errors = result.findings.filter(f => f.level === "error");
  return <>
    <PageHeader title="Montajes" description="Arma el banco de ambiente: identifica cada pieza, sigue los cables y comprueba las conexiones antes de energizar."
      actions={<><Button icon={<Download size={14} />} onClick={exportFile}>Exportar JSON</Button><label className="relative"><span className="sr-only">Importar montaje JSON</span><input aria-label="Importar montaje JSON" type="file" accept="application/json,.json" className="absolute inset-0 z-10 w-full cursor-pointer opacity-0" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ""; }} /><Button tabIndex={-1} icon={<Upload size={14} />}>Importar JSON</Button></label></>} />
    <section className="mb-5 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-heading">Primer montaje · DHT11 + PIR</h2><span className="text-caption text-muted">ESP32 de 30 pines · USB abajo</span></div>
      <p className="mt-2 text-small text-fg-2">Tu DHT11: <strong>− → GND · OUT → GPIO4 · + → 3,3 V</strong>. PIR de referencia: <strong>GND → GND · OUT → GPIO27 · VCC → 5 V</strong>. R1: pull-up de 10 kΩ entre DATA y 3,3 V.</p>
      <p className="mt-2 text-caption text-regular-text">30 pines y etiquetas DHT11 reportados por Joaquín. Compara la serigrafía del ESP32 y confirma VCC/OUT/GND del PIR en reverso. El jumper amarillo selecciona disparo; no es una entrada de alimentación.</p>
      <div className="mt-3 flex flex-wrap gap-4 text-caption">{(["red", "orange", "black", "green", "yellow"] as const).map(c => <span key={c} className="inline-flex items-center gap-2"><span style={{background:wireColors[c].hex}} className="inline-block h-1.5 w-6 rounded-full" />{wireColors[c].label}</span>)}</div>
    </section>
    <div className="mb-5 grid gap-3 md:grid-cols-[1fr_2fr]">
      <label className="text-small">Nombre del montaje<input className={field} value={assembly.name} maxLength={120} onChange={e => update({ ...assembly, name: e.target.value })} /></label>
      <label className="text-small">Observaciones y pendientes<input className={field} value={assembly.note} maxLength={2000} onChange={e => update({ ...assembly, note: e.target.value })} /></label>
    </div>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="rounded bg-regular-subtle px-2 py-1 text-caption text-regular-text">Propuesta · sin ensayo físico</span>
      <span className="text-small text-muted">{errors.length ? `${errors.length} conflictos detectados` : `Sin conflictos de conexión · ${result.findings.filter(f=>f.level==="pending").length} verificaciones pendientes`}</span>
      <Button size="sm" onClick={() => update({ ...parseAssembly(JSON.stringify(example)), revisions: assembly.revisions })}>Cargar guía completa</Button>
      <Button size="sm" icon={<Undo2 size={13} />} disabled={!past.length} onClick={() => { const previous = past.at(-1); if (previous) { setAssembly({ ...previous, revisions: assembly.revisions }); setPast(p => p.slice(0, -1)); setStep(null); setMessage("Cambio deshecho en memoria; la revisión guardada se conserva."); } }}>Deshacer</Button>
    </div>
    <div className="space-y-6">
      <section className="min-w-0" aria-label="Distribución y conexiones">
        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-line py-3">
          <div><h2 className="text-heading">Guía de armado</h2><p className="text-caption text-muted">USB, antena y conectores orientan la lectura. Referencia ilustrada; confirmar variante y dimensiones.</p></div>
          <label className="text-small">Filas <select aria-label="Filas de protoboard" className={field} value={assembly.board.rows} onChange={e => update({ ...assembly, board: { ...assembly.board, rows: Number(e.target.value) } })}>{[30, 63].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        </div>
        <div className="my-3 flex flex-wrap items-center gap-3"><label className="text-small">Escala <select aria-label="Escala del montaje" className={field} value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[0.6,0.8,1,1.2].map(z => <option key={z} value={z}>{Math.round(z*100)} %</option>)}</select></label><label className="text-small"><input type="checkbox" checked={!!assembly.board.rails} onChange={e=>update({...assembly,board:{...assembly.board,rails:e.target.checked}})} /> Mostrar rieles</label><label className="text-small"><input type="checkbox" checked={!!assembly.board.splitRails} onChange={e=>update({...assembly,board:{...assembly.board,splitRails:e.target.checked}})} /> Rieles cortados a mitad</label><Button size="sm" aria-pressed={pirBack} onClick={()=>setPirBack(b=>!b)}>{pirBack?"Ver lente del PIR":"Ver reverso del PIR"}</Button></div>
        <div className="flex flex-wrap items-center gap-2 py-3" aria-label="Pasos de armado">
          <Button size="sm" onClick={() => setStep(0)}>Recorrer armado</Button>
          <Button size="sm" disabled={step === null || step === 0} onClick={() => setStep(s => Math.max(0, (s ?? 0) - 1))}>Anterior</Button>
          <Button size="sm" disabled={step === null || step >= assembly.wires.length} onClick={() => setStep(s => Math.min(assembly.wires.length, (s ?? 0) + 1))}>Siguiente</Button>
          <Button size="sm" variant="ghost" onClick={() => setStep(null)}>Ver todo</Button>
          <span className="text-small" aria-live="polite">{step === null ? `${assembly.wires.length} cables` : `Cable ${step} de ${assembly.wires.length}`}</span>
        </div>
        <p className="mb-5 min-h-6 text-small text-fg-2" aria-live="polite">{step === null ? `Contacto seleccionado: ${terminalLabel(selected)}. Se resalta su red completa.` : step === 0 ? "Colocar componentes. Sin cables todavía." : assembly.wires[step - 1]?.note || `${assembly.wires[step - 1]?.from} → ${assembly.wires[step - 1]?.to}`}</p>
        <div className="overflow-x-auto rounded-lg border border-line bg-sunken">
          <AssemblyBoard pirBack={pirBack} zoom={zoom} assembly={assembly} wires={visibleWires} selected={selected} onSelect={setSelected} connected={analyze({ ...assembly, wires: visibleWires }).connected} />
        </div>
        <details className="mt-4"><summary className="cursor-pointer py-2 text-heading">Editar conexiones y colores</summary>
        <div className="overflow-x-auto"><table className="w-full text-left text-small"><thead className="text-muted"><tr><th className="p-2">Desde</th><th>Hasta</th><th>Acciones</th></tr></thead><tbody>{assembly.wires.map(w => <tr key={w.id} className="border-t border-line"><td className="p-2"><button className="text-link underline" onClick={() => setSelected(w.from)}>{terminalLabel(w.from)}</button></td><td>{terminalLabel(w.to)}</td><td className="flex gap-1 py-1"><Button size="sm" variant="ghost" onClick={() => { setEditing(w.id); setDraft({ from: w.from, to: w.to, note: w.note, color: w.color }); }}>Editar</Button><Button size="sm" variant="ghost" aria-label={`Quitar cable ${w.id}`} onClick={() => update({ ...assembly, wires: assembly.wires.filter(x => x.id !== w.id) })}>Quitar</Button></td></tr>)}</tbody></table></div>
        <form onSubmit={connect} className="mt-3 grid gap-2 sm:grid-cols-2">
          <datalist id="hardware-endpoints">{[...terminals(assembly), ...allContacts.map(h => `bb:${h}`)].map(t => <option key={t} value={t} />)}</datalist>
          <label className="text-small">Desde<input required aria-label="Terminal de origen" className={field} list="hardware-endpoints" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
          <label className="text-small">Hasta<input required aria-label="Terminal de destino" className={field} list="hardware-endpoints" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
          <label className="text-small">Color del cable<select aria-label="Color del cable" className={field} value={draft.color ?? "blue"} onChange={e => setDraft({...draft,color:e.target.value as Wire["color"]})}>{Object.entries(wireColors).map(([c,v])=><option key={c} value={c}>{v.label}</option>)}</select></label>
          <label className="text-small sm:col-span-2">Paso de armado<input className={field} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="Conectar este cable después de…" /></label>
          <div className="flex gap-2 sm:col-span-2"><Button type="submit" variant="primary">{editing ? "Aplicar cable" : "Añadir cable"}</Button>{editing && <Button onClick={() => { setEditing(null); setDraft({ from: "", to: "", note: "", color: "blue" }); }}>Nuevo cable</Button>}</div>
        </form></details>
      </section>
      <details className="min-w-0 space-y-5"><summary className="cursor-pointer py-2 text-heading">Catálogo y comprobaciones del montaje</summary><div className="grid gap-6 lg:grid-cols-2">
        <section><h2 className="mb-2 text-heading">Componentes</h2><div className="mb-3 flex items-center gap-2"><select aria-label="Componente a añadir" className={field} value={assembly.catalog.some(d => d.id === partType) ? partType : assembly.catalog[0]!.id} onChange={e => setPartType(e.target.value)}>{assembly.catalog.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select><Button aria-label="Añadir componente" icon={<Plus size={15} />} onClick={() => { const type = assembly.catalog.some(d => d.id === partType) ? partType : assembly.catalog[0]!.id; const id = `${type.slice(0, 30)}-${crypto.randomUUID().slice(0, 6)}`; update({ ...assembly, parts: [...assembly.parts, { id, definition: type, inventory: "Por identificar", resistance: type === "resistor" ? 1000 : undefined, holes: type === "resistor" ? { "1": "C20", "2": "G20" } : {} }] }); }} /></div>
        {assembly.parts.map(p => <div key={p.id} className="mb-3 border-b border-line pb-3"><h3 className="text-label">{definition(assembly, p).name} <code className="text-caption text-muted">{p.id}</code></h3><label className="text-caption">ID de inventario<input className={field} value={p.inventory} onChange={e => update({ ...assembly, parts: assembly.parts.map(x => x.id === p.id ? { ...x, inventory: e.target.value } : x) })} /></label>
          {p.definition === "resistor" && <label className="text-caption">Valor de resistencia<select className={field} value={p.resistance ?? 1000} onChange={e=>update({...assembly,parts:assembly.parts.map(x=>x.id===p.id?{...x,resistance:Number(e.target.value)}:x)})}><option value={1000}>1 kΩ · café / negro / rojo / dorado</option><option value={10000}>10 kΩ · café / negro / naranja / dorado</option></select></label>}
          {p.definition === "resistor" && definition(assembly, p).pins.map(pin => <label key={pin.id} className="mt-1 block text-caption">Agujero de pata {pin.id}<select className={field} value={p.holes[pin.id] ?? ""} onChange={e => update({ ...assembly, parts: assembly.parts.map(x => x.id === p.id ? { ...x, holes: { ...x.holes, [pin.id]: e.target.value } } : x) })}>{holes.map(h => <option key={h}>{h}</option>)}</select></label>)}
          <Button size="sm" variant="ghost" className="mt-1" onClick={() => update({ ...assembly, parts: assembly.parts.filter(x => x.id !== p.id), wires: assembly.wires.filter(w => !w.from.startsWith(`${p.id}:`) && !w.to.startsWith(`${p.id}:`)) })}>Retirar componente y sus cables</Button>
        </div>)}</section>
        <section><h2 className="mb-2 text-heading">Comprobaciones</h2><p className="mb-2 text-caption text-muted">Comprueba tiras A–E/F–J, rieles continuos o partidos, ocupación, fuentes y funciones. No valida dimensiones, corriente ni niveles de señales.</p><ul className="space-y-2 text-small" aria-live="polite">{result.findings.map((f, i) => <li key={i} className={f.level === "error" ? "text-alert-text" : "text-muted"}>{f.level === "error" ? "Conflicto: " : "Pendiente: "}{f.text}</li>)}</ul></section>
      </div></details>
    </div>
    <section className="mt-8 border-t border-line pt-5"><h2 className="mb-2 text-heading">Registro de cambios</h2><p className="mb-3 text-small text-muted">Cada revisión conserva el montaje completo. Una nota no convierte el montaje en una prueba física aprobada.</p><div className="flex flex-wrap gap-2"><input aria-label="Descripción de la revisión" className={`${field} max-w-xl`} value={revisionNote} maxLength={2000} onChange={e => setRevisionNote(e.target.value)} placeholder="Qué cambió y qué se observó realmente" /><Button onClick={save}>Guardar revisión local</Button></div><p role="status" className="my-3 text-small text-fg-2">{message}</p><ol className="space-y-2">{assembly.revisions.map((r, i) => <li key={`${r.at}-${i}`} className="flex flex-wrap items-center gap-3 text-small"><time>{new Date(r.at).toLocaleString("es-PE", { timeZone: "America/Lima" })}</time><span className="min-w-0 break-words">{r.note}</span><Button size="sm" onClick={() => { try { const snapshot = parseAssembly(r.snapshot); update({ ...snapshot, revisions: assembly.revisions }); } catch { setMessage("No se pudo recuperar esta revisión; el montaje actual se conserva."); } }}>Recuperar en borrador</Button></li>)}</ol></section>
  </>;
}
