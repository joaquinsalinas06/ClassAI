import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bandOf, comfortIndex, comfortState, FACTORY_CONFIG, nextFanState, placement, stateKey } from "./comfort";
import type { ComfortConfig } from "./types";

const factory = { ...FACTORY_CONFIG, room: "a101" } as ComfortConfig;
const contractExample: ComfortConfig = { ...factory, temp_c: [21.6, 26.6], noise_rel_max: 0.42 };

describe("comfort index parity with firmware/backend", () => {
  const file = fileURLToPath(new URL("../../../firmware/classai_node/test/comfort_cases.txt", import.meta.url));
  const cases = readFileSync(file, "utf8").split("\n").filter((line) => line.trim() && !line.startsWith("#"));
  const num = (text: string) => (text === "nan" ? null : Number(text));

  it.each(cases)("%s", (line) => {
    const [set, temp, rh, lux, noise, comfort, state] = line.trim().split(/\s+/);
    const cfg = set === "0" ? factory : contractExample;
    const value = comfortIndex(cfg, { temp_c: num(temp!), rh_pct: num(rh!), lux: num(lux!), noise_rel: num(noise!) });
    expect(value).toBe(Number(comfort));
    expect(comfortState(cfg, value)).toBe(state);
  });
});

describe("comfort state mapping", () => {
  it("maps thresholds and invalid values", () => {
    expect(comfortState(factory, 80)).toBe("OK");
    expect(comfortState(factory, 79)).toBe("REGULAR");
    expect(comfortState(factory, 60)).toBe("REGULAR");
    expect(comfortState(factory, 59)).toBe("ALERT");
    expect(comfortState(factory, -1)).toBe("REGULAR");
    expect(comfortState(factory, null)).toBe("REGULAR");
    expect(stateKey("ALERT")).toBe("alert");
    expect(stateKey(null)).toBe("offline");
  });

  it("derives target bands per metric", () => {
    expect(bandOf("temp_c", contractExample)).toEqual([21.6, 26.6]);
    expect(bandOf("noise_rel", contractExample)).toEqual([0, 0.42]);
    expect(bandOf("comfort", contractExample)).toEqual([80, 100]);
    expect(bandOf("lux", null)).toBeNull();
    expect(placement(27, [21.6, 26.6])).toBe("high");
    expect(placement(20, [21.6, 26.6])).toBe("low");
    expect(placement(22, [21.6, 26.6])).toBe("in");
    expect(placement(null, [21.6, 26.6])).toBe("unknown");
    expect(placement(60.4, [40, 60], 0)).toBe("in"); // judged as displayed
    expect(placement(60.6, [40, 60], 0)).toBe("high");
  });

  it("follows the node's fan relay rule with a 60 s hold", () => {
    let fan = { on: false, changedAt: -Infinity };
    fan = nextFanState(fan, "ALERT", 28, 26.6, 0);
    expect(fan.on).toBe(true);
    expect(nextFanState(fan, "OK", 24, 26.6, 30_000).on).toBe(true); // held
    expect(nextFanState(fan, "OK", 24, 26.6, 60_000).on).toBe(false);
    expect(nextFanState({ on: false, changedAt: -Infinity }, "ALERT", 20, 26.6, 0).on).toBe(false); // alert but not hot
    expect(nextFanState(fan, "REGULAR", 25, 26.6, 120_000).on).toBe(true); // REGULAR keeps state
  });
});
