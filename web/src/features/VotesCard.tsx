import { Snowflake, Sun, ThumbsUp } from "lucide-react";
import { useVotes } from "../lib/api";
import { formatTime } from "../lib/format";
import { Card, CardHeader } from "../ui/Card";

const KINDS = [
  { kind: "hot", label: "Calor", icon: Sun, tone: "text-alert-text" },
  { kind: "cold", label: "Frío", icon: Snowflake, tone: "text-info" },
  { kind: "ok", label: "Bien", icon: ThumbsUp, tone: "text-ok" },
] as const;
const LABEL: Record<string, string> = { hot: "Calor", cold: "Frío", ok: "Bien", noisy: "Ruido", dark: "Oscuro" };

/** Student votes for one session; polls every 5 s while the class is open. */
export function VotesCard({ id, live }: { id: string; live: boolean }) {
  const votes = useVotes(id, live);
  const counts = votes.data?.counts ?? { ok: 0, hot: 0, cold: 0 };
  const rows = votes.data?.data ?? [];
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
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-small text-muted">{votes.isError ? votes.error.message : "Aún no hay votos."}</p>
      ) : (
        <ul className="max-h-48 overflow-y-auto px-4 py-2">
          {rows.map((v) => (
            <li key={v.student_code} className="flex items-center gap-2 py-1 text-small">
              <span className="min-w-0 flex-1 truncate text-fg">{v.full_name}</span>
              <span className="text-muted">{LABEL[v.kind] ?? v.kind}</span>
              <span className="num text-faint">{formatTime(v.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
