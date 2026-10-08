// Number, unit and time formatting. Locale es-PE (decimal point, as used in Peru), zone America/Lima.
export const LOCALE = "es-PE";
export const TIME_ZONE = "America/Lima";
const NNBSP = " "; // narrow no-break space between value and unit
const MINUS = "−";

const numberFormats = new Map<number, Intl.NumberFormat>();
const nf = (decimals: number) => {
  let format = numberFormats.get(decimals);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    numberFormats.set(decimals, format);
  }
  return format;
};

/** Plain number with fixed decimals and a true minus sign. null/NaN -> "—". */
export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const text = nf(decimals).format(Math.abs(value) < 0.5 * 10 ** -decimals ? 0 : value);
  return text.replace("-", MINUS);
}

/** Signed delta: "+0.4", "−1.2", "±0". */
export function formatDelta(value: number | null | undefined, decimals = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Number(value.toFixed(decimals));
  if (rounded === 0) return `±${formatNumber(0, decimals)}`;
  return `${rounded > 0 ? "+" : MINUS}${formatNumber(Math.abs(rounded), decimals)}`;
}

export function withUnit(text: string, unit: string): string {
  return unit ? `${text}${NNBSP}${unit}` : text;
}

export function formatPercent(ratio: number | null | undefined, decimals = 0): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return withUnit(formatNumber(ratio * 100, decimals), "%");
}

/** Accepts ISO 8601 ("...Z") and the backend minute key "YYYY-MM-DD HH:MM" (UTC). */
export function parseTime(value: string | number | Date | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  const minuteKey = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(value);
  const iso = minuteKey ? `${minuteKey[1]}T${minuteKey[2]}:00Z` : value;
  const ms = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(ms) ? null : ms;
}

const timeFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });
const timeSecFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const dateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short" });
const dateLongFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

const clean = (text: string) => text.replaceAll(".", "").replace(/\s+/g, " ");

export const formatTime = (value: Parameters<typeof parseTime>[0], seconds = false) => {
  const ms = parseTime(value);
  return ms == null ? "—" : (seconds ? timeSecFmt : timeFmt).format(ms);
};
export const formatDate = (value: Parameters<typeof parseTime>[0]) => {
  const ms = parseTime(value);
  return ms == null ? "—" : clean(dateFmt.format(ms));
};
export const formatDateLong = (value: Parameters<typeof parseTime>[0]) => {
  const ms = parseTime(value);
  if (ms == null) return "—";
  const text = dateLongFmt.format(ms);
  return text.charAt(0).toUpperCase() + text.slice(1);
};
/** "YYYY-MM-DD" of the Lima calendar day. */
export const limaDayKey = (value: Parameters<typeof parseTime>[0]) => {
  const ms = parseTime(value);
  return ms == null ? "" : dayKeyFmt.format(ms);
};

/** "45 min", "1 h 05 min", "2 h". */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}${NNBSP}min`;
  if (m === 0) return `${h}${NNBSP}h`;
  return `${h}${NNBSP}h ${String(m).padStart(2, "0")}${NNBSP}min`;
}

/** "ahora", "hace 12 s", "hace 3 min", "hace 2 h", else the date. */
export function formatRelative(value: Parameters<typeof parseTime>[0], now = Date.now()): string {
  const ms = parseTime(value);
  if (ms == null) return "—";
  const seconds = Math.round((now - ms) / 1000);
  if (seconds < 5) return "ahora";
  if (seconds < 60) return `hace ${seconds}${NNBSP}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes}${NNBSP}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}${NNBSP}h`;
  return formatDate(ms);
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]!.charAt(0);
  const last = parts.length > 1 ? parts[parts.length > 2 ? parts.length - 2 : 1]!.charAt(0) : "";
  return (first + last).toUpperCase();
}
