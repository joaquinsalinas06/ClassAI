import { contacts, definition, type Assembly } from "./model";
import { devkit30, pn532SpiFrontCCW } from "./pinouts";
const { left: leftPins, right: rightPins } = devkit30;
export function assemblyGeometry(assembly: Assembly) {
  const compact = assembly.layout === "compact", offset = compact ? 250 : 0;
  const ys = (r: number) => 150 + (r - 1) * 18;
  const point = (h: string): readonly [number, number] => {
    const rail = /^(LP|LN|RP|RN)(\d+)$/.exec(h);
    if (rail) return [offset + ({ LP: 435, LN: 457, RP: 763, RN: 785 }[rail[1]!]!), ys(Number(rail[2]))];
    const i = "ABCDEFGHIJ".indexOf(h[0]!);
    return [offset + 500 + i * 20 + (i >= 5 ? 28 : 0), ys(Number(h.slice(1)))];
  };
  const ends = new Map<string, readonly [number, number]>();
  const origin = new Map<string, { x: number; y: number; type: string }>();
  let espCount = 0, sensorY = 125;
  for (const p of assembly.parts) {
    const d = definition(assembly, p);
    if (d.id === "esp32") {
      const x = compact ? 310 : 70, y = 140 + espCount++ * 620;
      origin.set(p.id, { x, y, type: d.id });
      d.pins.forEach((pin, i) => {
        const l = leftPins.indexOf(pin.id), r = rightPins.indexOf(pin.id);
        ends.set(`${p.id}:${pin.id}`, l >= 0 ? [x - 8, y + 28 + l * 27] : r >= 0 ? [x + 238, y + 28 + r * 27] : [x + 238, y + 28 + i * 22]);
      });
    } else if (d.id === "pn532") {
      const x = 940, y = 150;
      origin.set(p.id, { x, y, type: d.id });
      d.pins.forEach(pin => {
        const index = pn532SpiFrontCCW.indexOf(pin.id);
        ends.set(`${p.id}:${pin.id}`, [x + 42, y + 60 + Math.max(0, index) * 28]);
      });
      sensorY = Math.max(sensorY, 650);
    } else if (Object.keys(p.holes).length) {
      Object.entries(p.holes).forEach(([pin, h]) => ends.set(`${p.id}:${pin}`, point(h)));
    } else {
      const x = p.placement?.x ?? (compact ? (d.id === "pir" ? 50 : 1170) : 920), y = p.placement?.y ?? sensorY;
      const known = d.id === "dht11" || d.id === "pir";
      sensorY = Math.max(sensorY, y + (known ? 320 : 150 + d.pins.length * 24));
      origin.set(p.id, { x, y, type: d.id });
      d.pins.forEach((pin, i) => ends.set(`${p.id}:${pin.id}`, known ? [x + 20 + i * 50, y + 206] : [x, y + 42 + i * 24]));
    }
  }
  contacts(assembly.board).forEach(h => ends.set(`bb:${h}`, point(h)));
  const height = Math.max(840, ...assembly.wires.flatMap(w=>w.bends?.map(p=>p[1]+45)??[]), 225 + assembly.board.rows * 18, espCount * 620 + 120, sensorY + 30);
  return { point, ends, origin, height, ys, width: assembly.parts.some(p => p.definition === "pn532") ? 1370 : compact ? 1370 : assembly.bankId ? Math.max(1000,...[...origin.values()].filter(p=>p.type!=="esp32").map(p=>p.x+270)) : 1120, offset };
}
