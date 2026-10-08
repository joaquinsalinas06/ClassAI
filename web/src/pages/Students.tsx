import { useMutation, useQueries } from "@tanstack/react-query";
import { CreditCard, KeyRound, Search, ShieldCheck, SmartphoneNfc, Trash2, UserPlus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, type FormEvent } from "react";
import { CredentialIcon } from "../features/AttendanceList";
import { ApiError, api, useSessions } from "../lib/api";
import { formatRelative, parseTime } from "../lib/format";
import type { CredentialOut, CredentialType } from "../lib/types";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardHeader } from "../ui/Card";
import { cn } from "../ui/cn";
import { EmptyState } from "../ui/EmptyState";
import { SPRING } from "../ui/motion";
import { PageHeader } from "../ui/PageHeader";
import { Skeleton } from "../ui/Skeleton";
import { Tabs } from "../ui/Tabs";
import { useToast } from "../ui/Toast";

const KEY = "classai.adminKey";
const LENGTHS: Record<CredentialType, number[]> = { nfc_card_uid: [8, 14, 20], android_hce: [32] };
const RECENT_SESSIONS = 12;

const inputClass =
  "h-9 w-full rounded-md border border-line bg-surface px-3 text-body text-fg shadow-xs outline-none transition-colors placeholder:text-faint hover:border-line-strong focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/25";

const readKey = () => {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};

function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) return "No hubo respuesta del servidor.";
  if (error.status === 401) return "La clave de administrador no es válida.";
  if (error.status === 503 && /ADMIN_API_KEY/.test(error.message)) return "El servidor no tiene una clave de administrador configurada (ADMIN_API_KEY).";
  if (error.status === 409) return "Esa credencial ya está activa para otro estudiante. Revócala primero.";
  return error.message;
}

function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string | null; children: React.ReactNode; htmlFor: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-label font-medium text-fg">{label}</label>
      {children}
      {(error || hint) && <p className={cn("text-caption", error ? "text-alert-text" : "text-muted")}>{error ?? hint}</p>}
    </div>
  );
}

interface Enrolled extends CredentialOut {
  full_name: string;
  revoked?: boolean;
}

export function Students() {
  const toast = useToast();
  const [adminKey, setAdminKey] = useState(readKey);
  const [keyDraft, setKeyDraft] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<CredentialType>("nfc_card_uid");
  const [token, setToken] = useState("");
  const [touched, setTouched] = useState(false);
  const [enrolled, setEnrolled] = useState<Enrolled[]>([]);
  const [revokeId, setRevokeId] = useState("");
  const [query, setQuery] = useState("");

  const normalized = token.replace(/[\s:-]/g, "").toUpperCase();
  const tokenError = !normalized
    ? "Requerido"
    : !/^[0-9A-F]+$/.test(normalized)
      ? "Solo dígitos hexadecimales (0–9, A–F)"
      : !LENGTHS[type].includes(normalized.length)
        ? `Debe tener ${LENGTHS[type].join(", ")} caracteres; tiene ${normalized.length}`
        : null;
  const formValid = code.trim() && name.trim() && !tokenError;

  const saveKey = (value: string) => {
    setAdminKey(value);
    try {
      if (value) sessionStorage.setItem(KEY, value);
      else sessionStorage.removeItem(KEY);
    } catch {
      // storage blocked: key lives in memory only
    }
  };

  const enroll = useMutation({
    mutationFn: () => api.enroll({ student_code: code.trim(), full_name: name.trim(), type, token: normalized }, adminKey),
    onSuccess: (result) => {
      setEnrolled((list) => [{ ...result, full_name: name.trim() }, ...list]);
      toast({ tone: "ok", title: "Credencial enrolada", description: `${name.trim()} ya puede marcar asistencia.` });
      setToken("");
      setTouched(false);
    },
    onError: (error) => toast({ tone: "alert", title: "No se enroló la credencial", description: errorText(error) }),
  });
  const revoke = useMutation({
    mutationFn: (id: number) => api.revoke(id, adminKey),
    onSuccess: (result) => {
      setEnrolled((list) => list.map((c) => (c.credential_id === result.credential_id ? { ...c, revoked: true } : c)));
      toast({ tone: "ok", title: "Credencial revocada", description: `La credencial ${result.credential_id} ya no registra asistencia.` });
      setRevokeId("");
    },
    onError: (error) => toast({ tone: "alert", title: "No se revocó la credencial", description: errorText(error) }),
  });

  // People: aggregated from attendance of the most recent sessions (the API has no student listing).
  const sessions = useSessions({ limit: RECENT_SESSIONS });
  const attendance = useQueries({
    queries: (sessions.data?.data ?? []).map((s) => ({ queryKey: ["attendance", s.session_id], queryFn: () => api.attendance(s.session_id) })),
  });
  const attendanceKey = attendance.map((a) => a.dataUpdatedAt).join();
  const people = useMemo(() => {
    const map = new Map<string, { code: string; full_name: string; count: number; last: number; room: string; course: string | null; types: Set<CredentialType> }>();
    (sessions.data?.data ?? []).forEach((s, i) => {
      for (const a of attendance[i]?.data?.data ?? []) {
        const at = parseTime(a.recorded_at) ?? 0;
        const p = map.get(a.code) ?? { code: a.code, full_name: a.full_name, count: 0, last: 0, room: s.room, course: s.course, types: new Set() };
        p.count++;
        p.types.add(a.credential_type);
        if (at > p.last) Object.assign(p, { last: at, room: s.room, course: s.course });
        map.set(a.code, p);
      }
    });
    return [...map.values()].sort((a, b) => a.full_name.localeCompare(b.full_name, "es"));
    // attendanceKey tracks the query results
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.data, attendanceKey]);
  const q = query.trim().toLowerCase();
  const visible = q ? people.filter((p) => p.full_name.toLowerCase().includes(q) || p.code.includes(q)) : people;
  const peopleLoading = sessions.isPending || attendance.some((a) => a.isPending);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (formValid && adminKey) enroll.mutate();
  };

  return (
    <>
      <PageHeader title="Estudiantes" description="Quiénes asisten a las clases y qué credenciales usan para marcar. Enrolar y revocar requiere la clave de administrador." />

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-7">
          <Card className="flex flex-col">
            <CardHeader
              title="Asistentes recientes"
              description={`Según la asistencia de las últimas ${RECENT_SESSIONS} clases`}
              actions={<Badge tone="neutral">{people.length} estudiantes</Badge>}
            />
            <div className="px-4 pb-3">
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o código" aria-label="Buscar estudiante" className={cn(inputClass, "pl-9")} />
              </div>
            </div>
            {peopleLoading ? (
              <div className="space-y-3 px-4 pb-4">{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : visible.length === 0 ? (
              <EmptyState compact illustration="people" title={q ? "Nadie coincide con la búsqueda" : "Aún no hay asistencias"} description={q ? "Prueba con otra parte del nombre o el código completo." : "Cuando los estudiantes marquen en el lector aparecerán aquí."} />
            ) : (
              <ul className="max-h-[560px] overflow-y-auto border-t border-line-subtle py-1">
                {visible.map((p) => (
                  <li key={p.code} className="flex items-center gap-3 px-4 py-2">
                    <Avatar name={p.full_name} seed={p.code} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-label font-medium text-fg">{p.full_name}</p>
                      <p className="flex items-center gap-1.5 text-caption text-muted">
                        <span className="font-mono text-[11.5px]">{p.code}</span>
                        {[...p.types].map((t) => <CredentialIcon key={t} type={t} />)}
                      </p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="text-small text-fg-2">{p.course ?? "Clase"} · {p.room.toUpperCase()}</p>
                      <p className="text-caption text-muted">{formatRelative(p.last)}</p>
                    </div>
                    <Badge size="sm" tone="neutral" className="num">{p.count} {p.count === 1 ? "clase" : "clases"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5 lg:col-span-5">
          <Card>
            <CardHeader icon={<KeyRound size={16} />} title="Clave de administrador" description="Se guarda solo en esta pestaña y se borra al cerrarla" />
            <div className="px-4 pb-4">
              {adminKey ? (
                <div className="flex items-center gap-3 rounded-md border border-ok-border bg-ok-subtle px-3 py-2">
                  <ShieldCheck size={16} className="text-ok-text" aria-hidden />
                  <span className="flex-1 text-small text-ok-text">Clave cargada ({"•".repeat(Math.min(8, adminKey.length))})</span>
                  <Button size="sm" variant="ghost" onClick={() => saveKey("")}>Olvidar</Button>
                </div>
              ) : (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveKey(keyDraft.trim());
                    setKeyDraft("");
                  }}
                >
                  <input type="password" autoComplete="off" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="X-API-Key" aria-label="Clave de administrador" className={inputClass} />
                  <Button type="submit" variant="secondary" disabled={!keyDraft.trim()}>Usar clave</Button>
                </form>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader icon={<UserPlus size={16} />} title="Enrolar credencial" description="Vincula una tarjeta o un celular a un estudiante" />
            <form onSubmit={submit} className="flex flex-col gap-4 px-4 pb-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                <Field label="Código" htmlFor="code" error={touched && !code.trim() ? "Requerido" : null}>
                  <input id="code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="20231234" className={cn(inputClass, "font-mono")} />
                </Field>
                <Field label="Nombre completo" htmlFor="name" error={touched && !name.trim() ? "Requerido" : null}>
                  <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Valeria Quispe Mamani" autoComplete="off" className={inputClass} />
                </Field>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-label font-medium text-fg">Tipo de credencial</span>
                <Tabs
                  label="Tipo de credencial"
                  value={type}
                  onChange={setType}
                  items={[
                    { value: "nfc_card_uid", label: "Tarjeta NFC", icon: <CreditCard size={14} /> },
                    { value: "android_hce", label: "Celular Android", icon: <SmartphoneNfc size={14} /> },
                  ]}
                />
              </div>
              <Field
                label={type === "nfc_card_uid" ? "UID de la tarjeta" : "Token del celular"}
                htmlFor="token"
                hint={type === "nfc_card_uid" ? "Hexadecimal de 8, 14 o 20 caracteres. Se aceptan espacios y dos puntos." : "Los 32 caracteres que muestra la app ClassAI del celular."}
                error={touched || token ? (token ? tokenError : touched ? "Requerido" : null) : null}
              >
                <input id="token" value={token} onChange={(e) => setToken(e.target.value)} placeholder={type === "nfc_card_uid" ? "04 A2 3B 1C" : "9F2C4A01B7E35D6688C1F0A2B4D6E8F0"} autoComplete="off" spellCheck={false} className={cn(inputClass, "font-mono uppercase")} />
              </Field>
              <div className="flex items-center justify-between gap-3">
                <p className="text-caption text-muted">{adminKey ? "El token nunca se muestra en otras pantallas." : "Primero carga la clave de administrador."}</p>
                <Button type="submit" variant="primary" disabled={!adminKey || enroll.isPending}>
                  {enroll.isPending ? "Enrolando…" : "Enrolar credencial"}
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader title="Credenciales de esta pestaña" description="Las que enrolaste ahora; puedes revocarlas aquí" />
            <AnimatePresence initial={false}>
              {enrolled.length === 0 ? (
                <p className="px-4 pb-3 text-small text-muted">Todavía no enrolaste ninguna.</p>
              ) : (
                <ul className="pb-2">
                  {enrolled.map((c) => (
                    <motion.li key={c.credential_id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING.snappy} className="flex items-center gap-3 px-4 py-2">
                      <Avatar name={c.full_name} seed={c.code} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-label font-medium", c.revoked ? "text-muted line-through" : "text-fg")}>{c.full_name}</p>
                        <p className="text-caption text-muted">
                          <span className="font-mono">{c.code}</span> · {c.type === "android_hce" ? "Celular" : "Tarjeta"} · ID {c.credential_id}
                        </p>
                      </div>
                      {c.revoked ? (
                        <Badge size="sm" tone="offline">Revocada</Badge>
                      ) : (
                        <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} disabled={revoke.isPending} onClick={() => revoke.mutate(c.credential_id)}>
                          Revocar
                        </Button>
                      )}
                    </motion.li>
                  ))}
                </ul>
              )}
            </AnimatePresence>
            <form
              className="border-t border-line-subtle p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (Number(revokeId) > 0) revoke.mutate(Number(revokeId));
              }}
            >
              <Field label="Revocar por ID" htmlFor="revoke" hint="El ID se muestra al enrolar una credencial.">
                <div className="flex gap-2">
                  <input id="revoke" value={revokeId} onChange={(e) => setRevokeId(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Ej. 42" className={cn(inputClass, "font-mono")} />
                  <Button type="submit" variant="danger" className="h-9" disabled={!adminKey || !revokeId || revoke.isPending}>Revocar</Button>
                </div>
              </Field>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
