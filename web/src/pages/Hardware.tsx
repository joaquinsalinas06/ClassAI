import { useState, type FormEvent } from "react";
import { Download, Plus, Undo2, Upload } from "lucide-react";
import { PageHeader } from "../ui/PageHeader";
import { Button } from "../ui/Button";
import example from "../hardware/example.json";
import { analyze, definition, parseAssembly, recordRevision, terminals, type Assembly, type Wire } from "../hardware/model";

const storageKey = "classai.hardware.v1";
const initial = () => {
  try { const raw = localStorage.getItem(storageKey); return { assembly: parseAssembly(raw ?? JSON.stringify(example)), message: "" }; }
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
  const [draft, setDraft] = useState({ from: "esp1:GPIO4", to: "dht1:DATA", note: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [partType, setPartType] = useState("resistor");
  const result = analyze(assembly);
  const holes = Array.from({ length: assembly.board.rows }, (_, i) => [..."ABCDEFGHIJ"].map(c => `${c}${i + 1}`)).flat();
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
    const wire: Wire = { ...draft, id: editing ?? `w-${crypto.randomUUID().slice(0, 8)}` };
    update({ ...assembly, wires: editing ? assembly.wires.map(w => w.id === editing ? wire : w) : [...assembly.wires, wire] });
  };
  const visibleWires = step === null ? assembly.wires : assembly.wires.slice(0, step);
  const errors = result.findings.filter(f => f.level === "error");
  return <>
    <PageHeader title="Montajes" description="Conserva las conexiones y recorre el armado por pasos. Cada propuesta sigue pendiente de comprobación física."
      actions={<><Button icon={<Download size={14} />} onClick={exportFile}>Exportar JSON</Button><label className="relative"><span className="sr-only">Importar montaje JSON</span><input aria-label="Importar montaje JSON" type="file" accept="application/json,.json" className="absolute inset-0 z-10 w-full cursor-pointer opacity-0" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ""; }} /><Button tabIndex={-1} icon={<Upload size={14} />}>Importar JSON</Button></label></>} />
    <div className="mb-5 grid gap-3 md:grid-cols-[1fr_2fr]">
      <label className="text-small">Nombre del montaje<input className={field} value={assembly.name} maxLength={120} onChange={e => update({ ...assembly, name: e.target.value })} /></label>
      <label className="text-small">Observaciones y pendientes<input className={field} value={assembly.note} maxLength={2000} onChange={e => update({ ...assembly, note: e.target.value })} /></label>
    </div>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="rounded bg-regular-subtle px-2 py-1 text-caption text-regular-text">Propuesta · sin ensayo físico</span>
      <span className="text-small text-muted">{errors.length ? `${errors.length} conflictos detectados` : "Sin conflictos detectados por estas reglas"}</span>
      <Button size="sm" icon={<Undo2 size={13} />} disabled={!past.length} onClick={() => { const previous = past.at(-1); if (previous) { setAssembly({ ...previous, revisions: assembly.revisions }); setPast(p => p.slice(0, -1)); setStep(null); setMessage("Cambio deshecho en memoria; la revisión guardada se conserva."); } }}>Deshacer</Button>
    </div>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0" aria-label="Distribución y conexiones">
        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-line py-3">
          <div><h2 className="text-heading">Mapa de conexiones</h2><p className="text-caption text-muted">Módulos externos; sus terminales son referencias lógicas, sin escala ni orden físico.</p></div>
          <label className="text-small">Filas <select aria-label="Filas de protoboard" className={field} value={assembly.board.rows} onChange={e => update({ ...assembly, board: { rows: Number(e.target.value) } })}>{[30, 63].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        </div>
        <div className="overflow-x-auto rounded-lg bg-sunken py-2">
          <Board assembly={assembly} wires={visibleWires} selected={selected} onSelect={setSelected} connected={analyze({ ...assembly, wires: visibleWires }).connected} />
        </div>
        <div className="flex flex-wrap items-center gap-2 py-3" aria-label="Pasos de armado">
          <Button size="sm" onClick={() => setStep(0)}>Recorrer armado</Button>
          <Button size="sm" disabled={step === null || step === 0} onClick={() => setStep(s => Math.max(0, (s ?? 0) - 1))}>Anterior</Button>
          <Button size="sm" disabled={step === null || step >= assembly.wires.length} onClick={() => setStep(s => Math.min(assembly.wires.length, (s ?? 0) + 1))}>Siguiente</Button>
          <Button size="sm" variant="ghost" onClick={() => setStep(null)}>Ver todo</Button>
          <span className="text-small" aria-live="polite">{step === null ? `${assembly.wires.length} cables` : `Cable ${step} de ${assembly.wires.length}`}</span>
        </div>
        <p className="mb-5 min-h-6 text-small text-fg-2" aria-live="polite">{step === null ? `Contacto seleccionado: ${selected}. Se resalta su red completa.` : step === 0 ? "Colocar componentes. Sin cables todavía." : assembly.wires[step - 1]?.note || `${assembly.wires[step - 1]?.from} → ${assembly.wires[step - 1]?.to}`}</p>
        <h2 className="mb-2 text-heading">Cableado editable</h2>
        <div className="overflow-x-auto"><table className="w-full text-left text-small"><thead className="text-muted"><tr><th className="p-2">Desde</th><th>Hasta</th><th>Acciones</th></tr></thead><tbody>{assembly.wires.map(w => <tr key={w.id} className="border-t border-line"><td className="p-2"><button className="text-link underline" onClick={() => setSelected(w.from)}>{w.from}</button></td><td>{w.to}</td><td className="flex gap-1 py-1"><Button size="sm" variant="ghost" onClick={() => { setEditing(w.id); setDraft({ from: w.from, to: w.to, note: w.note }); }}>Editar</Button><Button size="sm" variant="ghost" aria-label={`Quitar cable ${w.id}`} onClick={() => update({ ...assembly, wires: assembly.wires.filter(x => x.id !== w.id) })}>Quitar</Button></td></tr>)}</tbody></table></div>
        <form onSubmit={connect} className="mt-3 grid gap-2 sm:grid-cols-2">
          <datalist id="hardware-endpoints">{[...terminals(assembly), ...holes.map(h => `bb:${h}`)].map(t => <option key={t} value={t} />)}</datalist>
          <label className="text-small">Desde<input required aria-label="Terminal de origen" className={field} list="hardware-endpoints" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
          <label className="text-small">Hasta<input required aria-label="Terminal de destino" className={field} list="hardware-endpoints" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
          <label className="text-small sm:col-span-2">Paso de armado<input className={field} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="Conectar este cable después de…" /></label>
          <div className="flex gap-2 sm:col-span-2"><Button type="submit" variant="primary">{editing ? "Aplicar cable" : "Añadir cable"}</Button>{editing && <Button onClick={() => { setEditing(null); setDraft({ from: "", to: "", note: "" }); }}>Nuevo cable</Button>}</div>
        </form>
      </section>
      <aside className="min-w-0 space-y-5">
        <section><h2 className="mb-2 text-heading">Componentes</h2><div className="mb-3 flex items-center gap-2"><select aria-label="Componente a añadir" className={field} value={assembly.catalog.some(d => d.id === partType) ? partType : assembly.catalog[0]!.id} onChange={e => setPartType(e.target.value)}>{assembly.catalog.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select><Button aria-label="Añadir componente" icon={<Plus size={15} />} onClick={() => { const type = assembly.catalog.some(d => d.id === partType) ? partType : assembly.catalog[0]!.id; const id = `${type.slice(0, 30)}-${crypto.randomUUID().slice(0, 6)}`; update({ ...assembly, parts: [...assembly.parts, { id, definition: type, inventory: "Por identificar", holes: type === "resistor" ? { "1": "C20", "2": "G20" } : {} }] }); }} /></div>
        {assembly.parts.map(p => <div key={p.id} className="mb-3 border-b border-line pb-3"><h3 className="text-label">{definition(assembly, p).name} <code className="text-caption text-muted">{p.id}</code></h3><label className="text-caption">ID de inventario<input className={field} value={p.inventory} onChange={e => update({ ...assembly, parts: assembly.parts.map(x => x.id === p.id ? { ...x, inventory: e.target.value } : x) })} /></label>
          {p.definition === "resistor" && definition(assembly, p).pins.map(pin => <label key={pin.id} className="mt-1 block text-caption">Agujero de pata {pin.id}<select className={field} value={p.holes[pin.id] ?? ""} onChange={e => update({ ...assembly, parts: assembly.parts.map(x => x.id === p.id ? { ...x, holes: { ...x.holes, [pin.id]: e.target.value } } : x) })}>{holes.map(h => <option key={h}>{h}</option>)}</select></label>)}
          <Button size="sm" variant="ghost" className="mt-1" onClick={() => update({ ...assembly, parts: assembly.parts.filter(x => x.id !== p.id), wires: assembly.wires.filter(w => !w.from.startsWith(`${p.id}:`) && !w.to.startsWith(`${p.id}:`)) })}>Retirar componente y sus cables</Button>
        </div>)}</section>
        <section><h2 className="mb-2 text-heading">Comprobaciones</h2><p className="mb-2 text-caption text-muted">Comprueba tiras A–E/F–J, ocupación, fuentes y funciones. No valida dimensiones, corriente ni niveles de señales.</p><ul className="space-y-2 text-small" aria-live="polite">{result.findings.map((f, i) => <li key={i} className={f.level === "error" ? "text-alert-text" : "text-muted"}>{f.level === "error" ? "Conflicto: " : "Pendiente: "}{f.text}</li>)}</ul></section>
      </aside>
    </div>
    <section className="mt-8 border-t border-line pt-5"><h2 className="mb-2 text-heading">Registro de cambios</h2><p className="mb-3 text-small text-muted">Cada revisión conserva el montaje completo. Una nota no convierte el montaje en una prueba física aprobada.</p><div className="flex flex-wrap gap-2"><input aria-label="Descripción de la revisión" className={`${field} max-w-xl`} value={revisionNote} maxLength={2000} onChange={e => setRevisionNote(e.target.value)} placeholder="Qué cambió y qué se observó realmente" /><Button onClick={save}>Guardar revisión local</Button></div><p role="status" className="my-3 text-small text-fg-2">{message}</p><ol className="space-y-2">{assembly.revisions.map((r, i) => <li key={`${r.at}-${i}`} className="flex flex-wrap items-center gap-3 text-small"><time>{new Date(r.at).toLocaleString("es-PE", { timeZone: "America/Lima" })}</time><span className="min-w-0 break-words">{r.note}</span><Button size="sm" onClick={() => { try { const snapshot = parseAssembly(r.snapshot); update({ ...snapshot, revisions: assembly.revisions }); } catch { setMessage("No se pudo recuperar esta revisión; el montaje actual se conserva."); } }}>Recuperar en borrador</Button></li>)}</ol></section>
  </>;
}

function Board({ assembly, wires, selected, onSelect, connected }: { assembly: Assembly; wires: Wire[]; selected: string; onSelect: (s: string) => void; connected: (x: string, y: string) => boolean }) {
  const holes: [string, number, number][] = [];
  const point = (hole: string) => { const index = "ABCDEFGHIJ".indexOf(hole[0]!); return [280 + index * 20 + (index > 4 ? 28 : 0), 66 + (Number(hole.slice(1)) - 1) * 16] as const; };
  for (let r = 1; r <= assembly.board.rows; r++) for (const c of "ABCDEFGHIJ") { const [x, y] = point(`${c}${r}`); holes.push([`${c}${r}`, x, y]); }
  const ends = new Map<string, readonly [number, number]>();
  const external = assembly.parts.filter(p => !Object.keys(p.holes).length);
  const origins = new Map<string, { x: number; y: number }>();
  const bottom = [52, 52];
  external.forEach((p, i) => {
    const side = i % 2, y = bottom[side]!;
    origins.set(p.id, { x: side ? 570 : 20, y });
    definition(assembly, p).pins.forEach((pin, j) => ends.set(`${p.id}:${pin.id}`, [side ? 570 : 214, y + 30 + j * 24]));
    bottom[side] = y + 64 + definition(assembly, p).pins.length * 24;
  });
  assembly.parts.forEach(p => Object.entries(p.holes).forEach(([pin, h]) => ends.set(`${p.id}:${pin}`, point(h))));
  holes.forEach(([h, x, y]) => ends.set(`bb:${h}`, [x, y]));
  const height = Math.max(...bottom.map(y => y + 30), 115 + assembly.board.rows * 16);
  const active = (end: string) => connected(selected, end);
  const selectKey = (e: React.KeyboardEvent, end: string) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(end); } };
  return <svg width="800" height={height} viewBox={`0 0 800 ${height}`} className="mx-auto block" aria-label="Protoboard y terminales lógicos; seleccionar un contacto resalta su red">
    <title>Montaje propuesto, sin simulación ni comprobación física</title>
    <rect x="250" y="30" width="270" height={assembly.board.rows * 16 + 55} rx="10" fill="var(--ds-bg-surface)" stroke="var(--ds-border-default)" />
    <rect x="370" y="58" width="25" height={assembly.board.rows * 16} fill="var(--ds-bg-sunken)" />
    {[..."ABCDEFGHIJ"].map(c => <text key={c} x={point(`${c}1`)[0]} y="49" textAnchor="middle" fill="var(--ds-text-secondary)" fontSize="11">{c}</text>)}
    {Array.from({ length: assembly.board.rows }, (_, i) => <text key={i} x="260" y={70 + i * 16} fontSize="10" fill="var(--ds-text-muted)">{i + 1}</text>)}
    {wires.map(w => { const a = ends.get(w.from), b = ends.get(w.to); if (!a || !b) return null; return <path key={w.id} d={`M${a[0]},${a[1]} C${(a[0] + b[0]) / 2},${a[1]} ${(a[0] + b[0]) / 2},${b[1]} ${b[0]},${b[1]}`} stroke={active(w.from) ? "var(--ds-intent-info)" : "var(--ds-text-muted)"} strokeWidth={active(w.from) ? 3 : 1.5} opacity={active(w.from) ? 1 : 0.4} fill="none"><title>{w.from} → {w.to}</title></path>; })}
    {assembly.parts.filter(p => Object.keys(p.holes).length).map(p => { const pts = Object.values(p.holes).map(point); const a = pts[0], b = pts[1]; if (!a || !b) return null; return <g key={p.id}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--ds-text-primary)" strokeWidth="4" /><text x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2 - 10} textAnchor="middle" fontSize="11" fill="var(--ds-text-primary)">{p.id}</text></g>; })}
    {holes.map(([h, x, y]) => <circle key={h} cx={x} cy={y} r="5" role="button" tabIndex={0} aria-label={`Contacto ${h}`} onKeyDown={e => selectKey(e, `bb:${h}`)} onClick={() => onSelect(`bb:${h}`)} fill={active(`bb:${h}`) ? "var(--ds-intent-info)" : "var(--ds-border-strong)"} className="cursor-pointer focus:stroke-focus focus:stroke-2"><title>{h} · tira {"ABCDE".includes(h[0]!) ? "A–E" : "F–J"}</title></circle>)}
    {external.map(p => { const d = definition(assembly, p), { x, y } = origins.get(p.id)!; return <g key={p.id}>
      <rect x={x} y={y} width="194" height={46 + d.pins.length * 24} rx="6" fill="var(--ds-bg-surface)" stroke="var(--ds-border-default)" />
      <text x={x + 10} y={y + 18} fontSize="12" fill="var(--ds-text-primary)">{p.id.slice(0, 18)} · {d.id.slice(0, 8)}<title>{p.id} · {d.name}</title></text>
      {d.pins.map(pin => { const pt = ends.get(`${p.id}:${pin.id}`)!; return <g key={pin.id} role="button" tabIndex={0} aria-label={`Terminal ${p.id}:${pin.id}`} className="cursor-pointer" onKeyDown={e => selectKey(e, `${p.id}:${pin.id}`)} onClick={() => onSelect(`${p.id}:${pin.id}`)}><circle cx={pt[0]} cy={pt[1]} r="6" fill={active(`${p.id}:${pin.id}`) ? "var(--ds-intent-info)" : "var(--ds-border-strong)"} /><text x={x + 12} y={pt[1] + 4} fontSize="12" fill="var(--ds-text-secondary)">{pin.id.slice(0, 22)}<title>{pin.id}</title></text></g>; })}
    </g>; })}
    <text x="280" y={height - 15} fontSize="12" fill="var(--ds-text-muted)">Tiras por fila: A–E y F–J separadas. Sin rieles modelados.</text>
  </svg>;
}
