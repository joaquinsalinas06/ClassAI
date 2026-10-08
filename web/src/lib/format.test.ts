import { describe, expect, it } from "vitest";
import { formatDelta, formatDuration, formatNumber, formatRelative, formatTime, initials, parseTime, withUnit } from "./format";
import { formatMetric } from "./comfort";

describe("format", () => {
  it("uses Peruvian decimal point and a true minus", () => {
    expect(formatNumber(23.456, 1)).toBe("23.5");
    expect(formatNumber(1234.4, 0)).toBe("1,234");
    expect(formatNumber(-0.04, 1)).toBe("0.0");
    expect(formatNumber(-2.25, 1)).toBe("−2.3");
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(Number.NaN)).toBe("—");
  });

  it("formats signed deltas", () => {
    expect(formatDelta(0.42, 1)).toBe("+0.4");
    expect(formatDelta(-1.26, 1)).toBe("−1.3");
    expect(formatDelta(0.01, 1)).toBe("±0.0");
  });

  it("formats metrics with units and per-metric decimals", () => {
    expect(formatMetric("temp_c", 23.44)).toBe(withUnit("23.4", "°C"));
    expect(formatMetric("rh_pct", 55.6)).toBe(withUnit("56", "%"));
    expect(formatMetric("lux", 412)).toBe(withUnit("412", "lx"));
    expect(formatMetric("noise_rel", 0.314)).toBe(withUnit("0.31", "rel."));
    expect(formatMetric("comfort", 82)).toBe("82");
    expect(formatMetric("temp_c", null)).toBe("—");
  });

  it("parses ISO and backend minute keys as UTC", () => {
    expect(parseTime("2026-10-14 14:05")).toBe(Date.UTC(2026, 9, 14, 14, 5));
    expect(parseTime("2026-10-14T14:05:00Z")).toBe(Date.UTC(2026, 9, 14, 14, 5));
    expect(parseTime("2026-10-14T14:05:00")).toBe(Date.UTC(2026, 9, 14, 14, 5));
    expect(parseTime("nope")).toBeNull();
  });

  it("shows Lima wall-clock time", () => {
    expect(formatTime("2026-10-14T19:05:00Z")).toBe("14:05");
  });

  it("formats durations and relative time", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(65)).toBe("1 h 05 min");
    expect(formatDuration(120)).toBe("2 h");
    const now = Date.UTC(2026, 9, 14, 12);
    expect(formatRelative(now - 2_000, now)).toBe("ahora");
    expect(formatRelative(now - 30_000, now)).toBe("hace 30 s");
    expect(formatRelative(now - 3 * 60_000, now)).toBe("hace 3 min");
  });

  it("builds initials from first name and first surname", () => {
    expect(initials("Valeria Quispe Mamani")).toBe("VQ");
    expect(initials("María Fernanda Quispe Huamán")).toBe("MQ");
    expect(initials("Diego Torres")).toBe("DT");
    expect(initials("Ana")).toBe("A");
  });
});
