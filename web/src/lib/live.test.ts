import { describe, expect, it } from "vitest";
import { initialLive, liveReducer, type LiveState } from "./live";
import type { ComfortConfig, LiveEvent, Telemetry } from "./types";
import { FACTORY_CONFIG } from "./comfort";

const telemetry = (over: Partial<Telemetry> = {}): Telemetry => ({
  v: 1, device: "esp32-a101", room: "a101", session_id: "a101-s1", ts: "2026-10-14T14:05:00Z", uptime_ms: 1,
  temp_c: 23.4, rh_pct: 55, lux: 412, noise_rel: 0.31, presence: true, comfort: 82, state: "OK", params_version: 3,
  received_at: "2026-10-14T14:05:00Z", ...over,
});
const attendance = (code: string, extra: Partial<LiveEvent> = {}): LiveEvent => ({
  event: "ATTENDANCE_RECORDED", event_id: `e-${code}`, room: "a101", session_id: "a101-s1", ts: "2026-10-14T14:06:00Z",
  student: { code, full_name: `Estudiante ${code}` }, ...extra,
});

describe("live reducer", () => {
  it("appends telemetry points per metric and marks the node online", () => {
    let s = liveReducer(initialLive("a101"), { type: "telemetry", data: telemetry() });
    s = liveReducer(s, { type: "telemetry", data: telemetry({ received_at: "2026-10-14T14:05:05Z", temp_c: 23.6, lux: null }) });
    expect(s.node).toBe("online");
    expect(s.points.temp_c.map((p) => p.v)).toEqual([23.4, 23.6]);
    expect(s.points.lux).toHaveLength(1); // null is a missing sensor, not a zero
    expect(s.latest?.temp_c).toBe(23.6);
    expect(s.sessionId).toBe("a101-s1");
  });

  it("ignores frames for other rooms and comfort -1", () => {
    const s0 = initialLive("a101");
    expect(liveReducer(s0, { type: "telemetry", data: telemetry({ room: "b204" }) })).toBe(s0);
    const s1 = liveReducer(s0, { type: "telemetry", data: telemetry({ comfort: -1 }) });
    expect(s1.points.comfort).toHaveLength(0);
  });

  it("adds arrivals once, newest first, and tracks rejections without tokens", () => {
    let s = liveReducer(initialLive("a101"), { type: "event", data: attendance("1") });
    s = liveReducer(s, { type: "event", data: attendance("2", { ts: "2026-10-14T14:07:00Z" }) });
    s = liveReducer(s, { type: "event", data: attendance("1", { event_id: "dup" }) });
    expect(s.arrivals.map((a) => a.code)).toEqual(["2", "1"]);
    expect(s.arrivals[0]!.live).toBe(true);
    s = liveReducer(s, { type: "event", data: { ...attendance("x"), student: undefined, rejected: { reason: "unknown_credential" } } });
    expect(s.rejections).toHaveLength(1);
    expect(s.arrivals).toHaveLength(2);
  });

  it("handles session start/end", () => {
    let s = liveReducer(initialLive("a101"), { type: "event", data: attendance("1") });
    s = liveReducer(s, { type: "event", data: { event: "SESSION_STARTED", event_id: "s", room: "a101", session_id: "a101-s2", ts: "2026-10-14T16:00:00Z", course: "CS5055" } });
    expect(s).toMatchObject({ sessionId: "a101-s2", course: "CS5055", arrivals: [] });
    s = liveReducer(s, { type: "event", data: { event: "SESSION_ENDED", event_id: "e", room: "a101", session_id: "a101-s2", ts: "2026-10-14T17:30:00Z" } });
    expect(s.sessionId).toBeNull();
  });

  it("merges REST backfill with live data without duplicates", () => {
    let s: LiveState = liveReducer(initialLive("a101"), { type: "telemetry", data: telemetry() });
    s = liveReducer(s, { type: "event", data: attendance("1") });
    s = liveReducer(s, {
      type: "seed",
      session: { id: "a101-s1", course: "IOT4010", started_at: "2026-10-14T14:00:00Z" },
      points: { temp_c: [{ t: Date.UTC(2026, 9, 14, 14, 0), v: 22.9 }, { t: Date.UTC(2026, 9, 14, 14, 5), v: 99 }] },
      attendance: [
        { code: "1", full_name: "Estudiante 1", credential_type: "nfc_card_uid", recorded_at: "2026-10-14T14:06:00Z" },
        { code: "0", full_name: "Estudiante 0", credential_type: "android_hce", recorded_at: "2026-10-14T14:01:00Z" },
      ],
    });
    expect(s.points.temp_c.map((p) => p.v)).toEqual([22.9, 23.4]); // live value wins at 14:05
    expect(s.arrivals.map((a) => a.code)).toEqual(["1", "0"]);
    expect(s.course).toBe("IOT4010");
  });

  it("applies config and status, and estimates the fan", () => {
    const cfg = { ...FACTORY_CONFIG, room: "a101", temp_c: [21.6, 26.6] } as ComfortConfig;
    let s = liveReducer(initialLive("a101"), { type: "config", data: cfg });
    s = liveReducer(s, { type: "telemetry", data: telemetry({ temp_c: 28.2, state: "ALERT", comfort: 52 }) });
    expect(s.fan.on).toBe(true);
    s = liveReducer(s, { type: "status", data: { room: "a101", status: "offline" } });
    expect(s.node).toBe("offline");
  });
});

describe("config versions", () => {
  it("never replaces a newer config with an older one", () => {
    const cfg = (v: number) => ({ ...FACTORY_CONFIG, room: "a101", params_version: v }) as ComfortConfig;
    let s = liveReducer(initialLive("a101"), { type: "config", data: cfg(5) });
    s = liveReducer(s, { type: "config", data: cfg(4) });
    expect(s.config?.params_version).toBe(5);
    s = liveReducer(s, { type: "config", data: cfg(6) });
    expect(s.config?.params_version).toBe(6);
  });
});
