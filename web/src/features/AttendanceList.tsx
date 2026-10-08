import { ChevronDown, CreditCard, ShieldAlert, SmartphoneNfc } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Arrival, Rejection } from "../lib/live";
import { formatTime, formatNumber } from "../lib/format";
import type { CredentialType, RejectReason } from "../lib/types";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { Card, CardHeader } from "../ui/Card";
import { cn } from "../ui/cn";
import { EmptyState } from "../ui/EmptyState";
import { SPRING } from "../ui/motion";
import { Skeleton } from "../ui/Skeleton";
import { Tooltip } from "../ui/Tooltip";

const LATE_AFTER_MS = 15 * 60_000;
export const REJECT_TEXT: Record<RejectReason, string> = {
  unknown_credential: "Credencial no registrada",
  revoked_credential: "Credencial revocada",
  unknown_session: "Sin sesión activa",
  closed_session: "Sesión ya cerrada",
  invalid_payload: "Lectura inválida",
};

export function CredentialIcon({ type }: { type?: CredentialType }) {
  if (!type) return null;
  const phone = type === "android_hce";
  const Icon = phone ? SmartphoneNfc : CreditCard;
  return (
    <Tooltip content={phone ? "Marcó con el celular (NFC)" : "Marcó con tarjeta"}>
      <span tabIndex={0} className="inline-flex text-faint" aria-label={phone ? "Celular" : "Tarjeta"}>
        <Icon size={14} aria-hidden />
      </span>
    </Tooltip>
  );
}

/** Arrivals per 3-minute bucket since the session started: the rhythm of the room filling up. */
function ArrivalRhythm({ arrivals, startedAt, endAt }: { arrivals: Arrival[]; startedAt: number; endAt: number }) {
  const bucket = 3 * 60_000;
  // At least 12 buckets (36 min) so the first minutes of a class don't stretch one bar across the panel.
  const count = Math.max(12, Math.min(40, Math.ceil((endAt - startedAt) / bucket)));
  const until = Math.max(endAt, startedAt + count * bucket);
  const bins = Array.from({ length: count }, () => 0);
  for (const a of arrivals) {
    const i = Math.floor((a.at - startedAt) / bucket);
    if (i >= 0 && i < count) bins[i]!++;
  }
  const max = Math.max(1, ...bins);
  return (
    <div className="px-4 pb-3">
      <div className="flex h-8 items-end gap-[2px]" role="img" aria-label="Ritmo de llegada por bloques de 3 minutos">
        {bins.map((n, i) => (
          <motion.span
            key={i}
            className={cn("flex-1 rounded-t-[2px]", n ? "bg-[var(--ds-metric-presence)]" : "bg-sunken")}
            initial={false}
            animate={{ height: n ? `${Math.max(14, (n / max) * 100)}%` : "8%" }}
            transition={SPRING.gentle}
          />
        ))}
      </div>
      <div className="num mt-1 flex justify-between text-micro text-muted">
        <span>{formatTime(startedAt)}</span>
        <span>Llegadas cada 3 min</span>
        <span>{formatTime(until)}</span>
      </div>
    </div>
  );
}

export function AttendanceList({ arrivals, rejections = [], startedAt, endAt, loading, className, maxHeight = 440, emptyText }: {
  arrivals: Arrival[];
  rejections?: Rejection[];
  startedAt?: number | null;
  endAt?: number;
  loading?: boolean;
  className?: string;
  maxHeight?: number;
  emptyText?: string;
}) {
  const [showRejected, setShowRejected] = useState(false);
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        title="Asistencia"
        description="Tarjeta o celular en el lector NFC"
        actions={
          <div className="text-right">
            <AnimatedNumber value={loading ? null : arrivals.length} format={(n) => formatNumber(n)} className="text-heading font-semibold text-fg" />
            <span className="ml-1 text-caption text-muted">presentes</span>
          </div>
        }
      />
      {startedAt && arrivals.length > 0 && <ArrivalRhythm arrivals={arrivals} startedAt={startedAt} endAt={endAt ?? Date.now()} />}
      <div className="relative min-h-0 flex-1 border-t border-line-subtle">
        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-20" /></div>
              </div>
            ))}
          </div>
        ) : arrivals.length === 0 ? (
          <EmptyState compact illustration="people" title="Nadie ha marcado todavía" description={emptyText ?? "Los estudiantes aparecerán aquí en cuanto acerquen su tarjeta o celular al lector."} />
        ) : (
          <ul className="overflow-y-auto py-1 [mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent)]" style={{ maxHeight }} aria-live="polite" aria-relevant="additions">
            <AnimatePresence initial={false}>
              {arrivals.map((a) => {
                const late = startedAt != null && a.at - startedAt > LATE_AFTER_MS;
                return (
                  <motion.li
                    key={a.code}
                    layout="position"
                    initial={a.live ? { opacity: 0, y: -10 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SPRING.snappy}
                    className="relative flex items-center gap-3 px-4 py-2"
                  >
                    {a.live && (
                      <motion.span
                        aria-hidden
                        className="absolute inset-0 bg-ok-subtle"
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 0 }}
                        transition={{ duration: 2.4, ease: "easeOut", delay: 0.4 }}
                      />
                    )}
                    <Avatar name={a.full_name} seed={a.code} size={32} className="relative" />
                    <div className="relative min-w-0 flex-1">
                      <p className="truncate text-label font-medium text-fg">{a.full_name}</p>
                      <p className="flex items-center gap-1.5 text-caption text-muted">
                        <span className="font-mono text-[11.5px]">{a.code}</span>
                        <CredentialIcon type={a.credential_type} />
                      </p>
                    </div>
                    {late && <Badge size="sm" tone="regular" className="relative">Tarde</Badge>}
                    <time className="num relative w-11 text-right text-caption text-muted" dateTime={new Date(a.at).toISOString()}>
                      {formatTime(a.at)}
                    </time>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
      {rejections.length > 0 && (
        <div className="border-t border-line-subtle">
          <button
            type="button"
            aria-expanded={showRejected}
            onClick={() => setShowRejected((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-caption text-muted hover:text-fg-2"
          >
            <ShieldAlert size={14} aria-hidden />
            <span className="flex-1 text-left">
              {rejections.length === 1 ? "1 lectura rechazada" : `${rejections.length} lecturas rechazadas`}
            </span>
            <ChevronDown size={14} className={cn("transition-transform", showRejected && "rotate-180")} aria-hidden />
          </button>
          <AnimatePresence initial={false}>
            {showRejected && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden px-4"
              >
                {rejections.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-1.5 text-caption text-muted">
                    <span>{REJECT_TEXT[r.reason] ?? r.reason}</span>
                    <time className="num">{formatTime(r.at, true)}</time>
                  </li>
                ))}
                <li className="pb-2.5 text-caption text-muted">Una credencial no registrada se puede enrolar en Estudiantes.</li>
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}
    </Card>
  );
}
