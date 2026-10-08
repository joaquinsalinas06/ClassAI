import { Bell, Fan, Plus, Search, Settings } from "lucide-react";
import { useMemo, useState } from "react";
import tokens from "../../../design/tokens.json";
import { useApp } from "../app/context";
import { Gauge } from "../charts/Gauge";
import { ComfortBar } from "../charts/ComfortBar";
import { ComfortRing } from "../charts/ComfortRing";
import { Sparkline } from "../charts/Sparkline";
import { TimeSeries } from "../charts/TimeSeries";
import { CHART_METRICS, METRICS } from "../lib/comfort";
import { formatNumber } from "../lib/format";
import type { Point } from "../lib/series";
import type { ComfortState } from "../lib/types";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { Avatar } from "../ui/Avatar";
import { Badge, Dot, StateBadge } from "../ui/Badge";
import { Button, IconButton } from "../ui/Button";
import { Card, CardHeader } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { METRIC_ICON } from "../ui/icons";
import { Kbd } from "../ui/Kbd";
import { PageHeader } from "../ui/PageHeader";
import { Skeleton } from "../ui/Skeleton";
import { Tabs } from "../ui/Tabs";
import { useToast } from "../ui/Toast";

const TYPE = ["hero", "display", "title", "heading", "metric", "body", "label", "small", "caption", "micro"] as const;
const TYPE_CLASS: Record<(typeof TYPE)[number], string> = {
  hero: "text-hero", display: "text-display", title: "text-title", heading: "text-heading", metric: "text-metric",
  body: "text-body", label: "text-label", small: "text-small", caption: "text-caption", micro: "text-micro",
};
const SAMPLE: Record<(typeof TYPE)[number], string> = {
  hero: "82", display: "Aula A101", title: "Aula en vivo", heading: "Laboratorio B204", metric: "23.4 °C",
  body: "Las condiciones están dentro del rango objetivo.", label: "Temperatura", small: "Última lectura hace 3 s",
  caption: "Promedio por minuto", micro: "14:05",
};

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-8 pb-10 first:border-t-0 first:pt-0">
      <h2 className="text-heading text-fg">{title}</h2>
      {description && <p className="mt-1 max-w-[68ch] text-small text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Follows "{a.b.c}" references inside tokens.json to a hex value. */
function resolveToken(value: string): string {
  const ref = /^\{(.+)\}$/.exec(value);
  if (!ref) return value;
  const node = ref[1]!.split(".").reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], tokens) as { $value?: string } | undefined;
  return node?.$value ? resolveToken(node.$value) : value;
}

function Swatch({ name, value, cssVar }: { name: string; value: string; cssVar?: string }) {
  return (
    <div className="min-w-0">
      <div className="h-12 rounded-md border border-line" style={{ background: cssVar ? `var(${cssVar})` : value }} />
      <p className="mt-1.5 truncate text-caption font-medium text-fg">{name}</p>
      <p className="truncate font-mono text-[11px] text-muted">{resolveToken(value)}</p>
    </div>
  );
}

const demoPoints = (seed: number, base: number, amp: number, n = 90): Point[] =>
  Array.from({ length: n }, (_, i) => ({
    t: Date.UTC(2026, 9, 14, 19, 0) + i * 60_000,
    v: base + amp * (Math.sin(i / 9 + seed) * 0.7 + Math.sin(i / 2.7 + seed * 2) * 0.2 + (i > 52 && i < 66 ? 1.4 : 0)),
  }));

export function DesignSystem() {
  const { theme } = useApp();
  const toast = useToast();
  const mode = theme.resolved;
  const t = tokens.theme[mode];
  const [tab, setTab] = useState("a");
  const [demo, setDemo] = useState<{ value: number; state: ComfortState }>({ value: 82, state: "OK" });
  const tempPoints = useMemo(() => demoPoints(1, 24.6, 1.6), []);
  const sparks = useMemo(() => CHART_METRICS.map((m, i) => demoPoints(i + 2, 50, 18, 40).map((p) => ({ ...p, v: p.v * (METRICS[m].minSpan / 30) }))), []);

  const neutrals = Object.entries(tokens.color.neutral).filter(([k]) => !k.startsWith("$")) as [string, { $value: string }][];
  const states = ["ok", "regular", "alert", "offline"] as const;

  return (
    <>
      <PageHeader
        title="Sistema de diseño"
        description="Una sola fuente para la web y Android: design/tokens.json. Esta página se dibuja con los mismos componentes que el producto."
        meta={<Badge tone="neutral">Tema {mode === "dark" ? "oscuro" : "claro"}</Badge>}
      />

      <Section title="Principios">
        <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line-subtle md:grid-cols-3">
          {[
            ["El color es dato", "La interfaz es gris garúa. El color aparece solo cuando significa algo: una métrica o un estado de confort."],
            ["Estado = color + ícono + palabra", "Nunca solo color. Confortable, Regular y Alerta siempre llevan su ícono y su nombre."],
            ["Movimiento con propósito", "Se anima lo que cambió: una lectura nueva, alguien que llega, un rango que se ajusta. Nada se mueve por adorno."],
          ].map(([title, body]) => (
            <div key={title} className="bg-surface p-4">
              <p className="text-label font-semibold text-fg">{title}</p>
              <p className="mt-1 text-small text-muted">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Color" description="Neutrales para la estructura, estados de confort reservados y un tono por métrica validado para daltonismo (ΔE adyacente ≥ 24 en ambos temas).">
        <p className="mb-2 text-caption font-medium text-muted">Neutral · garúa</p>
        <div className="grid grid-cols-5 gap-3 sm:grid-cols-8 lg:grid-cols-15">
          {neutrals.map(([k, v]) => <Swatch key={k} name={k} value={v.$value} />)}
        </div>
        <p className="mt-6 mb-2 text-caption font-medium text-muted">Estados de confort</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {states.map((s) => (
            <div key={s} className="rounded-lg border border-line p-3">
              <StateBadge state={s === "ok" ? "OK" : s === "regular" ? "REGULAR" : s === "alert" ? "ALERT" : null} offline={s === "offline"} />
              <div className="mt-3 grid grid-cols-4 gap-2">
                {(["solid", "text", "subtle", "border"] as const).map((k) => (
                  <Swatch key={k} name={k} value={t.state[s][k].$value} cssVar={`--ds-state-${s}-${k}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 mb-2 text-caption font-medium text-muted">Métricas</p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {(["temp", "rh", "lux", "noise", "presence", "comfort"] as const).map((m) => (
            <Swatch key={m} name={m} value={t.metric[m].$value} cssVar={`--ds-metric-${m}`} />
          ))}
        </div>
      </Section>

      <Section title="Tipografía" description="Geist Variable para todo, con cifras tabulares en datos. Geist Mono solo para identificadores: códigos, sesiones, tokens y teclas.">
        <div className="divide-y divide-line-subtle rounded-lg border border-line">
          {TYPE.map((k) => (
            <div key={k} className="flex items-baseline gap-4 px-4 py-3">
              <span className="w-20 shrink-0 font-mono text-[11px] text-muted">{k}</span>
              <span className="w-24 shrink-0 font-mono text-[11px] text-muted">{tokens.type[k].size.$value}/{tokens.type[k].line.$value}</span>
              <span className={`${TYPE_CLASS[k]} num truncate text-fg`}>{SAMPLE[k]}</span>
            </div>
          ))}
          <div className="flex items-baseline gap-4 px-4 py-3">
            <span className="w-20 shrink-0 font-mono text-[11px] text-muted">mono</span>
            <span className="w-24 shrink-0 font-mono text-[11px] text-muted">12/16</span>
            <span className="truncate font-mono text-small text-fg">a101-20261014T140000Z · 20231234</span>
          </div>
        </div>
      </Section>

      <Section title="Iconografía" description="Lucide, trazo 1.75, tamaños 14 / 16 / 20 / 24. Un ícono por concepto, siempre el mismo.">
        <div className="flex flex-wrap gap-3">
          {(Object.entries(METRIC_ICON) as [string, typeof Fan][]).concat([["ventilador", Fan], ["buscar", Search], ["avisos", Bell], ["ajustes", Settings]]).map(([k, Icon]) => (
            <div key={k} className="flex w-24 flex-col items-center gap-2 rounded-lg border border-line py-3">
              <Icon size={20} className="text-fg-2" aria-hidden />
              <span className="text-caption text-muted">{k}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Controles">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={<Plus size={15} />}>Enrolar credencial</Button>
          <Button>Secundario</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button variant="danger">Revocar</Button>
          <Button size="sm">Pequeño</Button>
          <Button disabled>Deshabilitado</Button>
          <IconButton label="Ajustes" shortcut="G D" variant="secondary"><Settings size={16} /></IconButton>
          <Tabs label="Demostración" value={tab} onChange={setTab} items={[{ value: "a", label: "Confort" }, { value: "b", label: "Temperatura" }, { value: "c", label: "Ruido" }]} />
          <span className="flex items-center gap-1"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <StateBadge state="OK" /><StateBadge state="REGULAR" /><StateBadge state="ALERT" /><StateBadge state={null} offline />
          <Badge tone="info">IOT4010</Badge><Badge>3 clases</Badge><Badge size="sm" tone="regular">Tarde</Badge>
          <span className="flex items-center gap-2 text-small text-muted"><Dot tone="ok" pulse /> En vivo</span>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          {["Valeria Quispe Mamani", "Diego Huamán Torres", "Camila Rojas Salazar", "Mateo Flores Vargas", "Luciana Chávez Paredes"].map((n) => <Avatar key={n} name={n} size={36} />)}
          <Button size="sm" onClick={() => toast({ tone: "ok", title: "Reporte enviado", description: "El rango de temperatura bajará un poco para esta clase." })}>Mostrar aviso</Button>
        </div>
      </Section>

      <Section title="Datos" description="Gráficos de una sola escala, con el rango objetivo sombreado, periodos fuera de rango marcados y los picos rotulados.">
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="flex flex-col items-center p-4">
            <Gauge value={demo.value} state={demo.state} size={200} />
            <div className="mt-2 flex gap-2">
              {([[91, "OK"], [71, "REGULAR"], [43, "ALERT"]] as [number, ComfortState][]).map(([v, s]) => (
                <Button key={v} size="sm" onClick={() => setDemo({ value: v, state: s })}>{v}</Button>
              ))}
            </div>
            <p className="mt-3 text-caption text-muted">Resorte «gauge»: rigidez 70, amortiguación 18</p>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Temperatura" description="Ejemplo con datos sintéticos" />
            <div className="px-3 pb-3">
              <TimeSeries points={tempPoints} metric={METRICS.temp_c} band={[22.2, 26.8]} height={240} />
            </div>
          </Card>
        </div>
        <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-line bg-line-subtle sm:grid-cols-5">
          {CHART_METRICS.map((m, i) => (
            <div key={m} className="bg-surface p-4">
              <p className="text-caption text-muted">{METRICS[m].short}</p>
              <Sparkline points={sparks[i]!} color={METRICS[m].color} minSpan={METRICS[m].minSpan} live />
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-6">
          <ComfortRing value={86} state="OK" /><ComfortRing value={68} state="REGULAR" /><ComfortRing value={41} state="ALERT" /><ComfortRing value={null} state={null} offline />
          <div className="flex flex-col gap-2">
            <ComfortBar value={88} state="OK" /><ComfortBar value={72} state="REGULAR" /><ComfortBar value={52} state="ALERT" />
          </div>
          <div className="text-metric text-fg">
            <AnimatedNumber value={demo.value} format={(n) => formatNumber(n)} />
          </div>
        </div>
      </Section>

      <Section title="Carga y vacío">
        <div className="grid gap-5 md:grid-cols-2">
          <Card className="space-y-3 p-4">
            <Skeleton className="h-4 w-32" /><Skeleton className="h-8 w-48" /><Skeleton className="h-24" />
          </Card>
          <Card><EmptyState compact illustration="people" title="Nadie ha marcado todavía" description="Los estudiantes aparecerán aquí en cuanto acerquen su tarjeta o celular al lector." /></Card>
        </div>
      </Section>
    </>
  );
}
