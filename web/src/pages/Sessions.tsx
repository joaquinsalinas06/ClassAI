import { ChevronRight, ListFilter, X } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useApp } from "../app/context";
import { ComfortBar } from "../charts/ComfortBar";
import { useSessions } from "../lib/api";
import { FACTORY_CONFIG, comfortState } from "../lib/comfort";
import { formatDate, formatDuration, formatNumber, formatTime, withUnit } from "../lib/format";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { cn } from "../ui/cn";
import { EmptyState } from "../ui/EmptyState";
import { PageHeader } from "../ui/PageHeader";
import { Skeleton } from "../ui/Skeleton";
import { Table, Td, Th } from "../ui/Table";
import { Tabs } from "../ui/Tabs";

const RANGES = [
  { value: "1", label: "Hoy" },
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
  { value: "all", label: "Todo" },
] as const;
type RangeValue = (typeof RANGES)[number]["value"];

const selectClass =
  "h-8 rounded-md border border-line bg-surface pr-8 pl-2.5 text-label text-fg shadow-xs outline-none transition-colors hover:border-line-strong focus-visible:border-focus appearance-none bg-[length:14px] bg-[right_8px_center] bg-no-repeat";
const chevron = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

function startFor(range: RangeValue): string | undefined {
  if (range === "all") return undefined;
  const days = Number(range);
  const now = new Date();
  // Lima midnight (UTC-5) `days - 1` days ago
  const lima = new Date(now.getTime() - 5 * 3600_000);
  const midnight = Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate() - (days - 1)) + 5 * 3600_000;
  return new Date(midnight).toISOString();
}

export function Sessions() {
  const { rooms } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const room = params.get("room") ?? "";
  const course = params.get("course") ?? "";
  const range = (params.get("range") as RangeValue) ?? "30";
  const start = useMemo(() => startFor(range), [range]);
  const sessions = useSessions({ room: room || undefined, start, limit: 500 });

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const all = sessions.data?.data ?? [];
  const courses = [...new Set(all.map((s) => s.course).filter(Boolean))].sort() as string[];
  const rows = course ? all.filter((s) => s.course === course) : all;
  const filtered = !!room || !!course || range !== "30";
  const finished = rows.filter((s) => s.comfort_avg != null);
  const avgComfort = finished.length ? finished.reduce((a, s) => a + (s.comfort_avg ?? 0), 0) / finished.length : null;
  const alertCount = rows.filter((s) => (s.alert_minutes ?? 0) > 0).length;

  return (
    <>
      <PageHeader title="Sesiones" description="Cada clase registrada por los nodos, con su confort, asistencia y tiempo en alerta." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ListFilter size={15} className="text-muted" aria-hidden />
        <label className="sr-only" htmlFor="f-room">Aula</label>
        <select id="f-room" value={room} onChange={(e) => set("room", e.target.value)} className={selectClass} style={{ backgroundImage: chevron }}>
          <option value="">Todas las aulas</option>
          {(rooms ?? []).map((r) => <option key={r.id} value={r.id}>{r.name ?? r.id}</option>)}
        </select>
        <label className="sr-only" htmlFor="f-course">Curso</label>
        <select id="f-course" value={course} onChange={(e) => set("course", e.target.value)} className={selectClass} style={{ backgroundImage: chevron }}>
          <option value="">Todos los cursos</option>
          {courses.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Tabs label="Periodo" items={RANGES.map((r) => ({ value: r.value, label: r.label }))} value={range} onChange={(v) => set("range", v === "30" ? "" : v)} />
        {filtered && (
          <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={() => setParams({}, { replace: true })}>
            Limpiar filtros
          </Button>
        )}
        <div className="ml-auto flex items-center gap-4 text-small text-muted">
          <span><span className="num font-medium text-fg">{rows.length}</span> sesiones</span>
          <span>Confort medio <span className="num font-medium text-fg">{avgComfort != null ? formatNumber(avgComfort) : "—"}</span></span>
          <span><span className="num font-medium text-fg">{alertCount}</span> con alertas</span>
        </div>
      </div>

      <Card className={cn("overflow-hidden transition-opacity", sessions.isPlaceholderData && "opacity-60")}>
        {sessions.isPending ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : sessions.isError ? (
          <EmptyState illustration="plug" title="No se pudieron cargar las sesiones" description={sessions.error.message} />
        ) : rows.length === 0 ? (
          <EmptyState
            illustration="chart"
            title="No hay sesiones con estos filtros"
            description="Amplía el periodo o quita el filtro de aula o curso."
            action={filtered ? <Button size="sm" onClick={() => setParams({}, { replace: true })}>Limpiar filtros</Button> : undefined}
          />
        ) : (
          <div className="max-h-[calc(100dvh-260px)] overflow-y-auto">
            <Table aria-label="Sesiones">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Curso</Th>
                  <Th>Aula</Th>
                  <Th className="text-right">Duración</Th>
                  <Th className="text-right">Asistencia</Th>
                  <Th className="text-right">Temp. media</Th>
                  <Th>Confort medio</Th>
                  <Th>En alerta</Th>
                  <Th className="w-8"><span className="sr-only">Abrir</span></Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const href = `/sesiones/${encodeURIComponent(s.session_id)}`;
                  const live = !s.ended_at;
                  return (
                    <tr key={s.session_id} onClick={() => navigate(href)} className="group cursor-pointer transition-colors hover:bg-hover/60">
                      <Td>
                        <span className="text-fg">{formatDate(s.started_at)}</span>
                        <span className="num ml-2 text-muted">{formatTime(s.started_at)}{s.ended_at ? `–${formatTime(s.ended_at)}` : ""}</span>
                      </Td>
                      <Td>
                        <Link to={href} onClick={(e) => e.stopPropagation()} className="font-medium text-fg hover:underline">{s.course ?? "Sin curso"}</Link>
                      </Td>
                      <Td>{s.room.toUpperCase()}</Td>
                      <Td className="num text-right">{live ? <Badge size="sm" tone="info">En curso</Badge> : formatDuration(s.minutes)}</Td>
                      <Td className="num text-right">{s.attendance_count ?? "—"}</Td>
                      <Td className="num text-right">{s.temp_avg != null ? withUnit(formatNumber(s.temp_avg, 1), "°C") : "—"}</Td>
                      <Td><ComfortBar value={s.comfort_avg} state={s.comfort_avg != null ? comfortState(FACTORY_CONFIG, s.comfort_avg) : null} /></Td>
                      <Td>
                        {s.alert_minutes ? (
                          <Badge size="sm" tone={s.alert_minutes >= 10 ? "alert" : "regular"}>{formatDuration(s.alert_minutes)}</Badge>
                        ) : (
                          <span className="text-muted">{live ? "—" : "Ninguno"}</span>
                        )}
                      </Td>
                      <Td><ChevronRight size={15} className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-fg-2" aria-hidden /></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </>
  );
}
