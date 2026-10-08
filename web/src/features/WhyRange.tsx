import { AudioLines, CloudSun, MessageSquareText, Send, Sun, Thermometer } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { sourceText } from "../lib/comfort";
import { formatDelta, formatNumber, formatRelative, withUnit } from "../lib/format";
import type { ComfortConfig, ParamsHistoryItem } from "../lib/types";
import { Badge } from "../ui/Badge";
import { Card, CardHeader } from "../ui/Card";
import { SPRING } from "../ui/motion";
import { Skeleton } from "../ui/Skeleton";

const FEEDBACK_TEXT: Record<string, string> = {
  hot: "calor", cold: "frío", noisy: "ruido", dark: "poca luz", ok: "todo bien",
  fan_override_on: "encendió el ventilador", fan_override_off: "apagó el ventilador",
};

export function reasonText(reason: string): string {
  const [kind, detail] = reason.split(":");
  if (kind === "session_started") return "Inicio de clase";
  if (kind === "feedback") return detail ? `Reporte: ${FEEDBACK_TEXT[detail] ?? detail}` : "Reporte del docente";
  if (kind === "manual") return "Ajuste manual";
  return reason;
}

function Step({ icon, title, children, last }: { icon: ReactNode; title: string; children: ReactNode; last?: boolean }) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!last && <span className="absolute top-8 bottom-1 left-[15px] w-px bg-line" aria-hidden />}
      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted">{icon}</span>
      <div className="min-w-0 pt-1">
        <p className="text-label font-medium text-fg">{title}</p>
        <div className="mt-0.5 text-small text-muted">{children}</div>
      </div>
    </li>
  );
}

const C = "°C";

export function WhyRange({ config, history, nodeVersion, loading }: {
  config: ComfortConfig | null;
  history: ParamsHistoryItem[];
  nodeVersion?: number | null;
  loading?: boolean;
}) {
  if (loading || !config) {
    return (
      <Card>
        <CardHeader title="¿Por qué este rango?" description="Cómo se calcularon los objetivos de esta clase" />
        <div className="space-y-4 p-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      </Card>
    );
  }
  const src = config.source;
  const shift = src.shift ?? { temp: 0, noise: 0, lux: 0 };
  const course = src.course ? <strong className="font-medium text-fg-2">{src.course}</strong> : "esta clase";
  const latest = history[0];
  const synced = nodeVersion == null || nodeVersion === config.params_version;

  const ranges: [string, string, string | undefined][] = [
    ["Temperatura", `${formatNumber(config.temp_c[0], 1)}–${withUnit(formatNumber(config.temp_c[1], 1), C)}`, src.temp],
    ["Humedad", `${config.rh_pct[0]}–${withUnit(String(config.rh_pct[1]), "%")}`, src.rh],
    ["Iluminación", `${formatNumber(config.lux[0])}–${withUnit(formatNumber(config.lux[1]), "lx")}`, src.lux],
    ["Ruido", `hasta ${formatNumber(config.noise_rel_max, 2)}`, src.noise],
  ];

  return (
    <Card>
      <CardHeader title="¿Por qué este rango?" description="Los objetivos se recalculan al iniciar cada clase y tras cada reporte" />
      <div className="grid gap-6 px-4 pt-2 pb-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <ol aria-label="Cálculo del rango">
          <Step icon={<CloudSun size={16} />} title="Clima de la semana">
            {src.t_rm != null ? (
              <>Media exterior móvil de 7 días en Lima: <span className="num text-fg-2">{withUnit(formatNumber(src.t_rm, 1), C)}</span> (Open-Meteo).</>
            ) : (
              <>Sin datos del clima: se usan los valores de fábrica, 21–24 {C}.</>
            )}
          </Step>
          <Step icon={<Thermometer size={16} />} title="Modelo adaptativo ASHRAE 55">
            {src.t_comf != null ? (
              <>Temperatura de confort <span className="num text-fg-2">{withUnit(formatNumber(src.t_comf, 1), C)}</span>; banda del 90 % de aceptabilidad, ±2.5 {C}.</>
            ) : (
              <>{sourceText(src.temp)}.</>
            )}
          </Step>
          <Step icon={<MessageSquareText size={16} />} title="Preferencia de la clase">
            {shift.temp !== 0 ? (
              <>Desplazado <span className="num text-fg-2">{withUnit(formatDelta(shift.temp, 1), C)}</span>: {course} reportó {shift.temp < 0 ? "calor" : "frío"} con más frecuencia.</>
            ) : (
              <>Sin ajuste: {course} no ha reportado calor ni frío.</>
            )}
          </Step>
          <Step icon={<AudioLines size={16} />} title="Ruido">
            {src.noise === "baseline_p90" ? (
              <>Límite <span className="num text-fg-2">{formatNumber(config.noise_rel_max, 2)}</span>: el P90 del ruido por minuto en clases anteriores de {course}. Es relativo al sensor, no son decibelios.</>
            ) : (
              <>Límite <span className="num text-fg-2">{formatNumber(config.noise_rel_max, 2)}</span> por defecto: aún faltan datos de {course} (mínimo 2 clases y 30 minutos).</>
            )}
          </Step>
          <Step icon={<Sun size={16} />} title="Iluminación">
            {src.lux === "en12464_evening" ? "Clase nocturna: 500–750 lx (EN 12464-1)." : "Aula de día: 300–500 lx (EN 12464-1)."}
            {shift.lux > 0 && <> Se sumaron <span className="num text-fg-2">{shift.lux} lx</span> por reportes de poca luz.</>}
          </Step>
          <Step icon={<Send size={16} />} title={`Versión ${config.params_version} enviada al nodo`} last>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={config.params_version} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING.gentle} className="inline-flex flex-wrap items-center gap-2">
                {latest && <span>{reasonText(latest.reason)} · {formatRelative(latest.created_at)}</span>}
                <Badge size="sm" tone={synced ? "ok" : "regular"}>{synced ? "Aplicada en el nodo" : `El nodo aún usa la v${nodeVersion}`}</Badge>
              </motion.span>
            </AnimatePresence>
          </Step>
        </ol>

        <div className="flex flex-col gap-4">
          <dl className="overflow-hidden rounded-md border border-line-subtle">
            {ranges.map(([label, value, source]) => (
              <div key={label} className="flex items-center justify-between gap-3 border-b border-line-subtle px-3 py-2.5 last:border-b-0">
                <div className="min-w-0">
                  <dt className="text-small text-fg-2">{label}</dt>
                  <dd className="truncate text-caption text-muted">{sourceText(source)}</dd>
                </div>
                <dd className="num shrink-0 text-label font-medium whitespace-nowrap text-fg">{value}</dd>
              </div>
            ))}
          </dl>
          {history.length > 0 && (
            <div>
              <p className="mb-1.5 text-caption font-medium text-muted">Historial de versiones</p>
              <ul className="space-y-0.5">
                <AnimatePresence initial={false}>
                  {history.slice(0, 5).map((h) => (
                    <motion.li
                      key={h.params_version}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={SPRING.snappy}
                      className="flex items-center gap-2 py-1 text-small"
                    >
                      <span className="num w-9 shrink-0 font-mono text-caption text-muted">v{h.params_version}</span>
                      <span className="flex-1 truncate text-fg-2">{reasonText(h.reason)}</span>
                      <span className="num text-caption text-muted">
                        {formatNumber(h.config.temp_c[0], 1)}–{formatNumber(h.config.temp_c[1], 1)} {C}
                      </span>
                      <span className="w-20 text-right text-caption text-muted">{formatRelative(h.created_at)}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
