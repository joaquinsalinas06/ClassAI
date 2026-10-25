import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { missions } from "./missions";
const bank = (id: string) => missions.find(m=>m.id===id)!;
describe("bank reference library", () => {
  it("covers every hardware mission without inventing a received third ESP32", () => {
    expect(missions).toHaveLength(16);
    expect(new Set(missions.map(m=>m.id)).size).toBe(missions.length);
    for (const m of missions) {
      expect(m.links.length).toBeGreaterThan(0);
      expect(m.checks.length).toBeGreaterThan(0);
      expect(m.materials.join(" ")).not.toMatch(/E-01|E-03|E-04/);
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
  it("keeps TFT signals aligned with the existing prototype while leaving power conditional", () => {
    const ino = readFileSync(new URL("../../../prototipo/mascota_claude_basica/main.ino", import.meta.url), "utf8");
    for (const [name,pin] of [["CS",5],["DC",27],["RST",26],["SCLK",14],["MOSI",23]] as const) expect(ino).toMatch(new RegExp(`#define TFT_${name}\\s+${pin}`));
    expect(bank("pantalla").links.filter(w=>w.kind==="power").every(w=>w.pending)).toBe(true);
  });
  it("does not ground either speaker output or power the amplifier from an ESP32 GPIO", () => {
    const audio = bank("audio-salida");
    const out = audio.links.filter(w=>w.kind==="speaker");
    expect(out).toHaveLength(2);
    expect(out.every(w=>!`${w.from} ${w.to}`.includes("GND"))).toBe(true);
    expect(audio.links.find(w=>w.to==="MAX98357A · VIN")).toMatchObject({ from:"Fuente 5 V DC · +", pending:true });
    expect(audio.materials.join(" ")).toContain("solo una");
  });
  it("keeps relay and unknown buzzer power/driver paths conditional", () => {
    for (const id of ["ventilador","buzzer"]) {
      for (const w of bank(id).links.filter(w=>w.kind==="power"||w.kind==="signal")) expect(w.pending).toBe(true);
    }
    expect(bank("ventilador").links.some(w=>w.from.includes("GPIO")&&w.to.includes("Ventilador"))).toBe(false);
  });
  it("keeps analog sound off DO and requires matrix signal adaptation", () => {
    expect(bank("ruido").links.some(w=>w.from.endsWith("· DO"))).toBe(false);
    expect(bank("ruido").links.find(w=>w.to.includes("GPIO34"))?.pending).toBe(true);
    expect(bank("matriz").links.filter(w=>w.from.includes("GPIO")).every(w=>w.to.startsWith("Adaptador")&&w.pending)).toBe(true);
  });
});
