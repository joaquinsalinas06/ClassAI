import example from "./example.json";
import { parseAssembly, type WireColor } from "./model";
import { assemblyGeometry } from "./geometry";
import { pn532SpiFrontCCW } from "./pinouts";

export const nfcConnections: { esp: string; pin: string; espHole: string; moduleHole: string; color: WireColor }[] = [
  { esp: "3V3", pin: "VCC", espHole: "LP15", moduleHole: "LP2", color: "red" },
  { esp: "GND", pin: "GND", espHole: "LN14", moduleHole: "LN4", color: "black" },
  { esp: "GPIO18", pin: "SCK", espHole: "A6", moduleHole: "B6", color: "blue" },
  { esp: "GPIO19", pin: "MISO", espHole: "A8", moduleHole: "B8", color: "purple" },
  { esp: "GPIO23", pin: "MOSI", espHole: "A10", moduleHole: "B10", color: "green" },
  { esp: "GPIO5", pin: "SS", espHole: "A12", moduleHole: "B12", color: "yellow" },
];
const base = parseAssembly(JSON.stringify(example));
const esp = base.catalog.find(d => d.id === "esp32")!;
export const nfcAssembly = parseAssembly(JSON.stringify({
  version: 1, layout: "breadboard", name: "M-10 · NFC físico · PN532 SPI",
  note: "12 M–H, cabecera macho confirmada por Joaquín; soldadura terminada por revisar. DIP 1 OFF / 2 ON sin alimentación. 3V3, no VIN. IRQ/RSTO libres; riel izquierdo + a 3V3 y − a GND, solo mitad superior. Rieles derechos libres. Placa/puerto/respaldo por asociar antes de cargar. Sin ensayo físico.",
  board: { rows: 30, rails: true, splitRails: false },
  catalog: [{ ...esp, pins: esp.pins.map(pin => ({ ...pin, required: false, function: nfcConnections.find(c => c.esp === pin.id && pin.kind === "signal")?.pin })) },
    { id: "pn532", name: "PN532 V3 · cara componentes · SPI", pending: "D-01 compatible visualmente con Elechouse V3. Cabecera macho declarada; revisar soldadura, etiquetas y DIP apagado. Función física pendiente.",
      pins: pn532SpiFrontCCW.map(id => ({ id, kind: id === "GND" ? "ground" : id === "VCC" ? "power" : "signal", voltage: id === "VCC" ? 3.3 : undefined, function: ["SCK", "MISO", "MOSI", "SS"].includes(id) ? id : undefined, required: !["RSTO", "IRQ"].includes(id) })) }],
  parts: [{ id: "esp1", definition: "esp32", inventory: "A-01 o B-02 · asociar placa física", holes: {} }, { id: "nfc1", definition: "pn532", inventory: "D-01", holes: {} }],
  wires: [], revisions: [],
}));
const { ends } = assemblyGeometry(nfcAssembly);
for (const [i, c] of nfcConnections.entries()) {
  const from = `esp1:${c.esp}`, to = `nfc1:${c.pin}`, a = `bb:${c.espHole}`, b = `bb:${c.moduleHole}`;
  const s = ends.get(from)!, h = ends.get(a)!, t = ends.get(to)!;
  const leftLane = 350 + [5, 4, 2, 1, 0, 3][i]! * 14, rightLane = 830 + i * 18;
  nfcAssembly.wires.push(
    { id: `nfc-${i * 2 + 1}`, from, to: a, color: c.color, note: `Cable ${i * 2 + 1} · M–H: hembra a ESP32 ${c.esp}, macho a ${c.espHole}. Montar sin USB.`, bends: [[leftLane, s[1]], [leftLane, h[1]]] },
    { id: `nfc-${i * 2 + 2}`, from: b, to, color: c.color, note: `Cable ${i * 2 + 2} · M–H: macho a ${c.moduleHole}, hembra a PN532 ${c.pin}. ${c.espHole}/${c.moduleHole} comparten ${c.pin === "VCC" ? "riel + izquierdo, mitad superior" : c.pin === "GND" ? "riel − izquierdo, mitad superior" : "tira A–E"}; no puente adicional.`, bends: [[rightLane, h[1]], [rightLane, t[1]]] },
  );
}
