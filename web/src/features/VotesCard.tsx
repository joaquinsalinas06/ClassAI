import { AnimatePresence, motion } from "motion/react";
import { Activity, Droplets, Lightbulb, Snowflake, Sun, ThumbsUp, Volume2 } from "lucide-react";
import type { VoteDimension, VoteLevel } from "../lib/api";
import { useVotes } from "../lib/api";
import { formatTime } from "../lib/format";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { Card, CardHeader } from "../ui/Card";
import { EASE } from "../ui/motion";

/** Share of the votes as a hairline bar scaled from the left (transform only), so a new vote visibly moves it. */
function Share({ value, total, color }: { value: number; total: number; color: string }) {
  return (
    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
      <motion.span
        className="block h-full origin-left rounded-full"
        style={{ background: color }}
        initial={{ transform: "scaleX(0)" }}
        animate={{ transform: `scaleX(${total ? value / total : 0})` }}
        transition={{ type: "spring", duration: 0.6, bounce: 0.15 }}
      />
    </span>
  );
}

const KINDS = [
  { kind: "hot", label: "Calor", icon: Sun, tone: "text-alert-text", color: "var(--ds-state-alert-solid)" },
  { kind: "cold", label: "Frío", icon: Snowflake, tone: "text-info", color: "var(--ds-intent-info)" },
  { kind: "ok", label: "Bien", icon: ThumbsUp, tone: "text-ok", color: "var(--ds-state-ok-solid)" },
] as const;
const LEVEL_COLOR = { low: "var(--ds-intent-info)", ok: "var(--ds-state-ok-solid)", high: "var(--ds-state-regular-solid)" } as const;
const LABEL: Record<string, string> = { hot: "Calor", cold: "Frío", ok: "Bien", noisy: "Ruido", dark: "Oscuro" };

/** Las demás dimensiones que vota el alumno desde la app: etiqueta de low / ok / high. */
const DIMENSIONS: { dimension: VoteDimension; label: string; icon: typeof Sun; levels: Record<VoteLevel, string> }[] = [
  { dimension: "light", label: "Luz", icon: Lightbulb, levels: { low: "Poca luz", ok: "Bien", high: "Mucha luz" } },
  { dimension: "noise", label: "Ruido", icon: Volume2, levels: { low: "Silencio", ok: "Bien", high: "Mucho ruido" } },
  { dimension: "motion", label: "Movimiento", icon: Activity, levels: { low: "Tranquilo", ok: "Bien", high: "Mucho movimiento" } },
  { dimension: "humidity", label: "Humedad", icon: Droplets, levels: { low: "Seco", ok: "Bien", high: "Húmedo" } },
];
const DIMENSION_BY_ID = Object.fromEntries(DIMENSIONS.map((d) => [d.dimension, d]));

/** Student votes for one session; polls every 5 s while the class is open. */
export function VotesCard({ id, live }: { id: string; live: boolean }) {
  const votes = useVotes(id, live);
  const counts = votes.data?.counts ?? { ok: 0, hot: 0, cold: 0 };
  const dimensions = votes.data?.dimensions;
  const rows = [
    ...(votes.data?.data ?? []).map((v) => ({ ...v, key: `${v.student_code}-temp`, label: LABEL[v.kind] ?? v.kind })),
    ...(votes.data?.dimension_data ?? []).map((v) => ({
      ...v, key: `${v.student_code}-${v.dimension}`,
      label: `${DIMENSION_BY_ID[v.dimension]?.label ?? v.dimension}: ${DIMENSION_BY_ID[v.dimension]?.levels[v.value] ?? v.value}`,
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const tempTotal = counts.ok + counts.hot + counts.cold;
  return (
    <Card>
      <CardHeader title="Cómo se sienten" description={live ? "Votos de los alumnos desde la app, en vivo" : "Votos de los alumnos desde la app"} />
      <div className="grid grid-cols-3 gap-px border-y border-line-subtle bg-line-subtle">
        {KINDS.map(({ kind, label, icon: Icon, tone, color }) => (
          <div key={kind} className="bg-surface px-4 py-3">
            <p className="flex items-center gap-1.5 text-caption text-muted"><Icon size={13} className={tone} aria-hidden />{label}</p>
            <AnimatedNumber value={counts[kind]} bump format={(n) => String(Math.round(n))} className="mt-1 text-heading font-semibold text-fg" />
            <Share value={counts[kind]} total={tempTotal} color={color} />
          </div>
        ))}
      </div>
      {dimensions && (
        <ul className="divide-y divide-line-subtle border-b border-line-subtle">
          {DIMENSIONS.map(({ dimension, label, icon: Icon, levels }) => {
            const row = dimensions[dimension];
            const total = (row?.low ?? 0) + (row?.ok ?? 0) + (row?.high ?? 0);
            return (
              <li key={dimension} className="flex items-stretch gap-3 px-4 py-2.5 text-small">
                <Icon size={13} className="mt-0.5 text-muted" aria-hidden />
                <span className="w-20 shrink-0 text-fg">{label}</span>
                {(["low", "ok", "high"] as const).map((level) => (
                  <span key={level} className="flex min-w-0 flex-1 flex-col">
                    <span className="text-caption leading-tight text-muted">{levels[level]}</span>
                    <span className="mt-auto flex items-center gap-2 pt-1">
                      <AnimatedNumber value={row?.[level] ?? 0} bump format={(n) => String(Math.round(n))} className="w-4 font-semibold text-fg" />
                      <span className="min-w-0 flex-1 [&>span]:mt-0"><Share value={row?.[level] ?? 0} total={total} color={LEVEL_COLOR[level]} /></span>
                    </span>
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
      )}
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-small text-muted">{votes.isError ? votes.error.message : "Aún no hay votos."}</p>
      ) : (
        <ul className="max-h-48 overflow-y-auto px-4 py-2" aria-live="polite" aria-relevant="additions">
          <AnimatePresence initial={false}>
            {rows.map((v) => (
              <motion.li
                key={`${v.key}-${v.created_at}`}
                layout="position"
                initial={{ opacity: 0, transform: "translateX(-12px)" }}
                animate={{ opacity: 1, transform: "translateX(0px)" }}
                transition={{ duration: 0.36, ease: EASE.emphasized }}
                className="flex items-center gap-2 py-1 text-small"
              >
                <span className="min-w-0 flex-1 truncate text-fg">{v.full_name}</span>
                <span className="text-muted">{v.label}</span>
                <span className="num text-faint">{formatTime(v.created_at)}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}
