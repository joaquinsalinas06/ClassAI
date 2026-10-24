export interface Pin { id: string; kind: "source" | "ground" | "power" | "signal" | "passive"; voltage?: number; function?: string; required?: boolean; bus?: string }
export interface Definition { id: string; name: string; pending: string; pins: Pin[] }
export interface Part { id: string; definition: string; inventory: string; holes: Record<string, string>; resistance?: number }
export interface Wire { id: string; from: string; to: string; note: string; color?: WireColor; bends?: [number, number][] }
export type WireColor = "red" | "black" | "orange" | "green" | "yellow" | "blue" | "purple";
export interface Revision { at: string; note: string; snapshot: string }
export interface Assembly { version: 1; layout?: "compact" | "breadboard"; name: string; note: string; board: { rows: number; rails?: boolean; splitRails?: boolean }; catalog: Definition[]; parts: Part[]; wires: Wire[]; revisions: Revision[] }
export interface Finding { level: "error" | "pending"; text: string }
const idPattern = /^[a-zA-Z0-9_-]{1,60}$/;
export function holeValid(hole: string, rows: number) {
  const m = /^([A-J])([1-9]\d*)$/.exec(hole);
  return !!m && Number(m[2]) <= rows;
}
export function contactValid(hole: string, board: Assembly["board"]) {
  const rail = /^(LP|LN|RP|RN)([1-9]\d*)$/.exec(hole);
  return holeValid(hole, board.rows) || (!!board.rails && !!rail && Number(rail[2]) <= board.rows);
}
export function contactStrip(hole: string, board: Assembly["board"]) {
  const rail = /^(LP|LN|RP|RN)([1-9]\d*)$/.exec(hole);
  return rail ? `${rail[1]}:${board.splitRails && Number(rail[2]) > Math.ceil(board.rows / 2) ? "bottom" : "top"}` : strip(hole);
}
export function contacts(board: Assembly["board"]) {
  return Array.from({ length: board.rows }, (_, i) => [..."ABCDEFGHIJ", ...(board.rails ? ["LP", "LN", "RP", "RN"] : [])].map(c => `${c}${i + 1}`)).flat();
}
export function strip(hole: string) { return `${hole.slice(1)}:${"ABCDE".includes(hole[0]!) ? "L" : "R"}`; }
export function definition(a: Assembly, p: Part) { return a.catalog.find(d => d.id === p.definition)!; }
export function terminals(a: Assembly) { return a.parts.flatMap(p => definition(a, p).pins.map(pin => `${p.id}:${pin.id}`)); }
// Reject malformed imports before they can replace a draft or enter graph traversal.
export function parseAssembly(raw: string): Assembly {
  if (raw.length > 500_000) throw new Error("El archivo supera 500 kB.");
  const a = JSON.parse(raw) as Assembly;
  const fail = () => { throw new Error("Formato de montaje inválido o referencias desconocidas."); };
  const str = (s: unknown, max = 2000): s is string => typeof s === "string" && s.length <= max;
  const ids = (xs: { id: string }[]) => xs.every(x => x && str(x.id, 60) && idPattern.test(x.id)) && new Set(xs.map(x => x.id)).size === xs.length;
  if (!a || a.version !== 1 || !str(a.name, 120) || !str(a.note) || !Number.isInteger(a.board?.rows) || a.board.rows < 1 || a.board.rows > 63 || !Array.isArray(a.catalog) || !a.catalog.length || a.catalog.length > 40 || !Array.isArray(a.parts) || a.parts.length > 20 || !Array.isArray(a.wires) || a.wires.length > 150 || !Array.isArray(a.revisions) || a.revisions.length > 50) fail();
  if ((a.board.rails !== undefined && typeof a.board.rails !== "boolean") || (a.board.splitRails !== undefined && typeof a.board.splitRails !== "boolean")) fail();
  if (a.layout !== undefined && a.layout !== "compact" && a.layout !== "breadboard") fail();
  if (!ids(a.catalog) || !ids(a.parts) || !ids(a.wires)) fail();
  for (const d of a.catalog) {
    if (!str(d.name, 120) || !str(d.pending) || !Array.isArray(d.pins) || d.pins.length > 50 || !ids(d.pins)) fail();
    if (d.id === "resistor" && (d.pins.length !== 2 || !d.pins.some(p => p.id === "1" && p.kind === "passive") || !d.pins.some(p => p.id === "2" && p.kind === "passive"))) fail();
    for (const p of d.pins) if (!["source", "ground", "power", "signal", "passive"].includes(p.kind) || (p.voltage !== undefined && (!Number.isFinite(p.voltage) || p.voltage < 0 || p.voltage > 24)) || (p.function !== undefined && !str(p.function, 60)) || (p.bus !== undefined && !str(p.bus, 60)) || (p.required !== undefined && typeof p.required !== "boolean")) fail();
  }
  for (const p of a.parts) {
    const d = a.catalog.find(d => d.id === p.definition);
    if (!d || !str(p.inventory, 120) || !p.holes || typeof p.holes !== "object" || Array.isArray(p.holes)) fail();
    if (p.resistance !== undefined && (!Number.isFinite(p.resistance) || p.resistance <= 0 || p.resistance > 1e9)) fail();
    if (p.definition !== "resistor" && Object.keys(p.holes).length) fail();
    for (const [pin, hole] of Object.entries(p.holes)) if (!d!.pins.some(x => x.id === pin) || typeof hole !== "string" || !holeValid(hole, a.board.rows)) fail();
  }
  const ends = new Set(terminals(a));
  const validEnd = (s: unknown) => typeof s === "string" && (ends.has(s) || (s.startsWith("bb:") && contactValid(s.slice(3), a.board)));
  for (const w of a.wires) {
    if (!validEnd(w.from) || !validEnd(w.to) || !str(w.note)) fail();
    if (w.color !== undefined && !["red", "black", "orange", "green", "yellow", "blue", "purple"].includes(w.color)) fail();
    if (w.bends !== undefined && (!Array.isArray(w.bends) || w.bends.length > 12 || w.bends.some(p => !Array.isArray(p) || p.length !== 2 || p.some(n => !Number.isFinite(n) || n < 0 || n > 5000)))) fail();
  }
  for (const r of a.revisions) if (!r || !str(r.at, 40) || !Number.isFinite(Date.parse(r.at)) || !str(r.note) || !str(r.snapshot, 150_000)) fail();
  return a;
}
export function analyze(a: Assembly) {
  const parent = new Map<string, string>();
  const find = (x: string): string => { if (!parent.has(x)) parent.set(x, x); const p = parent.get(x)!; if (p !== x) parent.set(x, find(p)); return parent.get(x)!; };
  const join = (x: string, y: string) => parent.set(find(x), find(y));
  const findings: Finding[] = [];
  const occupied = new Map<string, string[]>();
  for (const h of contacts(a.board)) join(`bb:${h}`, `strip:${contactStrip(h, a.board)}`);
  for (const p of a.parts) {
    const buses = new Map<string, string>();
    for (const pin of definition(a, p).pins) if (pin.bus) {
      const end = `${p.id}:${pin.id}`, first = buses.get(pin.bus);
      if (first) join(first, end); else buses.set(pin.bus, end);
    }
  }
  for (const p of a.parts) for (const [pin, hole] of Object.entries(p.holes)) {
    const end = `${p.id}:${pin}`;
    join(end, `bb:${hole}`);
    occupied.set(hole, [...(occupied.get(hole) ?? []), end]);
  }
  for (const w of a.wires) {
    join(w.from, w.to);
    for (const end of [w.from, w.to]) if (end.startsWith("bb:")) occupied.set(end.slice(3), [...(occupied.get(end.slice(3)) ?? []), w.id]);
  }
  for (const [hole, entries] of occupied) if (entries.length > 1) findings.push({ level: "error", text: `${hole}: ${entries.join(", ")} ocupan el mismo agujero. Usa otro contacto de la misma tira.` });
  const groups = new Map<string, { end: string; pin: Pin }[]>();
  for (const p of a.parts) for (const pin of definition(a, p).pins) {
    const end = `${p.id}:${pin.id}`, net = find(end);
    groups.set(net, [...(groups.get(net) ?? []), { end, pin }]);
    if (pin.required !== false && !a.wires.some(w => find(w.from) === find(end) || find(w.to) === find(end)) && !p.holes[pin.id]) findings.push({ level: "pending", text: `${end}: sin conexión propuesta.` });
  }
  for (const group of groups.values()) {
    const supplies = group.filter(x => x.pin.kind === "source");
    const ground = group.some(x => x.pin.kind === "ground");
    if (supplies.length > 1 || (supplies.length && ground)) findings.push({ level: "error", text: `Alimentación en conflicto: ${group.map(x => x.end).join(", ")}. No unir salidas de fuentes ni una fuente con GND.` });
    for (const load of group.filter(x=>x.pin.kind === "power")) {
      if (!supplies.length) findings.push({ level: "pending", text: `${load.end}: alimentación sin fuente conectada; revisar rieles y sus cortes.` });
      if (load.pin.voltage !== undefined && supplies.some(s=>s.pin.voltage !== undefined && s.pin.voltage !== load.pin.voltage)) findings.push({ level: "error", text: `${load.end}: tensión de referencia ${load.pin.voltage} V incompatible con la fuente conectada.` });
    }
    const signals = group.filter(x => x.pin.kind === "signal");
    if (signals.length && (supplies.length || ground)) findings.push({ level: "error", text: `Señal conectada a alimentación: ${signals.map(x => x.end).join(", ")}.` });
    if (new Set(signals.map(x => x.pin.function).filter(Boolean)).size > 1) findings.push({ level: "error", text: `Funciones de señal incompatibles en una misma red: ${signals.map(x => x.end).join(", ")}.` });
  }
  for (const p of a.parts) {
    const d = definition(a, p);
    if (d.pending) findings.push({ level: "pending", text: `${p.id} (${p.inventory}): ${d.pending}` });
    if (p.definition === "resistor" && find(`${p.id}:1`) === find(`${p.id}:2`)) findings.push({ level: "error", text: `${p.id}: ambas patas pertenecen a la misma red; la resistencia queda puenteada.` });
  }
  return { findings, connected: (x: string, y: string) => find(x) === find(y) };
}
export function recordRevision(a: Assembly, note: string): Assembly {
  if (!note.trim()) throw new Error("Describe el cambio antes de guardarlo.");
  if (a.revisions.length >= 50) throw new Error("Exporta el historial: se alcanzaron 50 revisiones.");
  const snapshot = JSON.stringify({ ...a, revisions: [] });
  return parseAssembly(JSON.stringify({ ...a, revisions: [...a.revisions, { at: new Date().toISOString(), note: note.trim(), snapshot }] }));
}
