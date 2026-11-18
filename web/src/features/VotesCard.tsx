import { Activity, Droplets, Lightbulb, Snowflake, Sun, ThumbsUp, Volume2 } from "lucide-react";
import type { VoteDimension, VoteLevel } from "../lib/api";
import { useVotes } from "../lib/api";
import { formatTime } from "../lib/format";
import { Card, CardHeader } from "../ui/Card";

const KINDS = [
  { kind: "hot", label: "Calor", icon: Sun, tone: "text-alert-text" },
  { kind: "cold", label: "Frío", icon: Snowflake, tone: "text-info" },
  { kind: "ok", label: "Bien", icon: ThumbsUp, tone: "text-ok" },
] as const;
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
  return (
    <Card>
      <CardHeader title="Cómo se sienten" description={live ? "Votos de los alumnos desde la app, en vivo" : "Votos de los alumnos desde la app"} />
      <div className="grid grid-cols-3 gap-px border-y border-line-subtle bg-line-subtle">
        {KINDS.map(({ kind, label, icon: Icon, tone }) => (
          <div key={kind} className="bg-surface px-4 py-3">
            <p className="flex items-center gap-1.5 text-caption text-muted"><Icon size={13} className={tone} aria-hidden />{label}</p>
            <p className="num mt-1 text-heading font-semibold text-fg">{counts[kind]}</p>
          </div>
        ))}
      </div>
      {dimensions && (
        <ul className="divide-y divide-line-subtle border-b border-line-subtle">
          {DIMENSIONS.map(({ dimension, label, icon: Icon, levels }) => (
            <li key={dimension} className="flex items-center gap-2 px-4 py-2 text-small">
              <Icon size={13} className="text-muted" aria-hidden />
              <span className="w-24 text-fg">{label}</span>
              {(["low", "ok", "high"] as const).map((level) => (
                <span key={level} className="flex-1 text-muted">
                  {levels[level]} <span className="num font-semibold text-fg">{dimensions[dimension]?.[level] ?? 0}</span>
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-small text-muted">{votes.isError ? votes.error.message : "Aún no hay votos."}</p>
      ) : (
        <ul className="max-h-48 overflow-y-auto px-4 py-2">
          {rows.map((v) => (
            <li key={v.key} className="flex items-center gap-2 py-1 text-small">
              <span className="min-w-0 flex-1 truncate text-fg">{v.full_name}</span>
              <span className="text-muted">{v.label}</span>
              <span className="num text-faint">{formatTime(v.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
