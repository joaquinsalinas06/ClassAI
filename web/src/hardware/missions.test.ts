import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { missions } from "./missions";
const bank = (id: string) => missions.find(m=>m.id===id)!;
describe("bank reference library", () => {
  it("records the physical trials without approving untested banks or hiding their limits",()=>{
    expect(missions.filter(m=>m.trial).map(m=>m.id).sort()).toEqual(["audio-salida","matriz","ruido"]);
    for(const id of ["audio-salida","ruido"]){
      const m=bank(id);expect(m.state).toContain("Ensayado");expect(m.trial?.date).toBe("25/10/2026");
      expect(m.trial?.pending.length).toBeGreaterThan(60);
      expect(m.physical?.assembly.parts.find(p=>p.id==="esp1")?.inventory).toContain("B-02");
      expect(m.physical?.blockers.join(" ")).not.toContain("B-02/NFC se conserva");
    }
    expect(bank("ruido").trial?.observed).toContain("BENCH_CAPTURE_500MS");
    expect(bank("ruido").trial?.pending).toContain("No mide dB");
    expect(bank("audio-salida").trial?.pending).toContain("inestable");
    expect(bank("audio-salida").trial?.pending).toContain("no un máximo");
    expect(bank("nfc").state).toContain("comprobados");
    const alternate=readFileSync(new URL("../../../docs/hardware/esquemas/audio-salida-adaptado.md",import.meta.url),"utf8");
    expect(alternate).toContain("Alternativa de compatibilidad · sin ensayo físico");
    expect(alternate).not.toContain("Ensayo físico del 25/10/2026");
  });
  it("records upright matrix orientation separately from untested integration and adaptation",()=>{
    const m=bank("matriz");
    expect(m.state).toContain("Ensayado");expect(m.trial?.date).toBe("26/10/2026");
    expect(m.trial?.observed).toContain("izquierda = giro 0°");
    expect(m.trial?.pending).toContain("no garantiza");
    expect(m.checks.join(" ")).toContain("abajo rotate90");
    expect(m.physical?.assembly.parts.find(p=>p.id==="esp1")?.inventory).toContain("A-01");
    expect(m.physical?.action).toContain("happy, sad, angry");
    const alternate=readFileSync(new URL("../../../docs/hardware/esquemas/matriz-adaptado.md",import.meta.url),"utf8");
    expect(alternate).toContain("Alternativa de compatibilidad · sin ensayo físico");
    expect(alternate).not.toContain("Ensayo físico del 26/10/2026");
  });
  it("preserves isolated banks and adds the three integrated proposals", () => {
    expect(missions).toHaveLength(19);
    expect(new Set(missions.map(m=>m.id)).size).toBe(missions.length);
    for (const m of missions) {
      expect(m.links.length).toBeGreaterThan(0);
      expect(m.checks.length).toBeGreaterThan(0);
      if(!m.id.startsWith("nodo-"))expect(m.materials.join(" ")).not.toMatch(/E-01|E-03|E-04/);
    }
  });
  it("keeps NFC aligned with implemented SPI wiring and supplies", () => {
    const cpp = readFileSync(new URL("../../../firmware/classai_node/nfc_reader.cpp", import.meta.url), "utf8");
    for (const [name, pin, port] of [["SCK",18,"SCK"],["MISO",19,"MISO"],["MOSI",23,"MOSI"],["SS",5,"SS"]] as const) {
      expect(cpp).toContain(`PIN_${name} = ${pin}`);
      expect(bank("nfc").links.some(w=>[w.from,w.to].some(s=>s===`ESP32 · GPIO${pin}`)&&[w.from,w.to].some(s=>s===`PN532 · ${port}`))).toBe(true);
    }
    expect(bank("nfc").links.some(w=>w.from==="ESP32 · 3V3"&&w.to==="PN532 · VCC")).toBe(true);
    expect(bank("nfc").links).toHaveLength(6);
  });
  it("keeps TFT signals and 3.3 V power aligned with the existing prototype", () => {
    const ino = readFileSync(new URL("../../../prototipo/mascota_claude_basica/main.ino", import.meta.url), "utf8");
    for (const [name,pin] of [["CS",5],["DC",27],["RST",26],["SCLK",14],["MOSI",23]] as const) expect(ino).toMatch(new RegExp(`#define TFT_${name}\\s+${pin}`));
    expect(bank("pantalla").links.find(w=>w.to==="TFT · VCC")?.pending).not.toBe(true);
    expect(bank("pantalla").links.find(w=>w.to==="TFT · BL")?.pending).not.toBe(true);
  });
  it("does not ground either speaker output or power the amplifier from an ESP32 GPIO", () => {
    const audio = bank("audio-salida");
    const out = audio.links.filter(w=>w.kind==="speaker");
    expect(out).toHaveLength(2);
    expect(out.every(w=>!`${w.from} ${w.to}`.includes("GND"))).toBe(true);
    expect(audio.links.find(w=>w.from==="ESP32 · VIN")).toMatchObject({ to:"Protoboard · J6", pending:false });
    expect(audio.links.find(w=>w.to==="MAX98357A · VIN")).toMatchObject({ from:"Protoboard · H6", pending:false });
    expect(audio.materials.join(" ")).toContain("solo una");
  });
  it("requires hardware references and transistor isolation for relay and buzzer", () => {
    for(const id of ["ventilador","buzzer"]) {
      const a=bank(id).physical!.adaptation!.assembly;
      expect(a.parts.some(p=>p.definition==="npn")).toBe(true);
      expect(a.wires.some(w=>w.pending)).toBe(true);
      expect(a.wires.some(w=>w.from.startsWith("esp1:GPIO")&&/^(bz1|fan1|relay1):/.test(w.to))).toBe(false);
    }
  });
  it("keeps analog sound off DO and requires matrix signal adaptation", () => {
    expect(bank("ruido").links.some(w=>w.from.endsWith("· DO"))).toBe(false);
    expect(bank("ruido").links.find(w=>w.to.includes("GPIO34"))?.pending).not.toBe(true);
    expect(bank("matriz").physical!.adaptation!.assembly.parts.some(p=>p.definition==="ahct125")).toBe(true);
    expect(bank("matriz").physical!.assembly.wires.some(w=>w.from.startsWith("esp1:GPIO")&&w.to.startsWith("matrix1:"))).toBe(false);
  });
});
