import { useMutation } from "@tanstack/react-query";
import { ArrowUp, CircleSlash, Wrench } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Fragment, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { LogoMark } from "../app/Logo";
import { ApiError, api, type AskContext } from "../lib/api";
import { parseMarkdown } from "../lib/markdown";
import type { ChatTurn } from "../lib/types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { cn } from "../ui/cn";
import { SPRING } from "../ui/motion";

export const TOOL_LABEL: Record<string, string> = {
  get_session_overview: "Datos de la clase",
  get_room_now: "Aula ahora",
  list_rooms: "Aulas",
  get_current_class: "Clase actual",
  get_session_summary: "Resumen de sesión",
  list_sessions: "Lista de sesiones",
  compare_sessions: "Comparar sesiones",
  get_metric_series: "Serie de una métrica",
  get_attendance: "Asistencia",
  explain_comfort_decision: "Explicar el rango",
};

export interface Message extends ChatTurn {
  id: number;
  tools?: string[];
  fresh?: boolean;
  error?: boolean;
}

const inline = (line: string) =>
  line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i} className="font-semibold text-fg">{part.slice(2, -2)}</strong>
    : part.startsWith("`") && part.endsWith("`") && part.length > 2 ? <code key={i} className="rounded-sm bg-sunken px-1 font-mono text-[0.92em]">{part.slice(1, -1)}</code>
    : <Fragment key={i}>{part}</Fragment>,
  );

/** Safe markdown (no HTML injection): headings, lists, real tables, **bold** and `code`. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = parseMarkdown(text).map((b, i) => {
    if (b.kind === "heading") return <p key={i} className="font-semibold text-fg">{inline(b.text)}</p>;
    if (b.kind === "list") {
      const List = b.ordered ? "ol" : "ul";
      return <List key={i} className={cn("space-y-1 pl-5", b.ordered ? "list-decimal" : "list-disc")}>{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</List>;
    }
    if (b.kind === "table") {
      return (
        <div key={i} className="overflow-x-auto rounded-md border border-line">
          <table className="w-full border-collapse text-small">
            <thead className="bg-sunken">
              <tr>{b.header.map((h, j) => <th key={j} className="px-3 py-1.5 text-left text-caption font-medium whitespace-nowrap text-muted">{inline(h)}</th>)}</tr>
            </thead>
            <tbody>
              {b.rows.map((r, j) => (
                <tr key={j} className="border-t border-line-subtle">
                  {r.map((c, k) => <td key={k} className={cn("num px-3 py-1.5 text-fg-2", k === 0 && "text-fg")}>{inline(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return <p key={i}>{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
  });
  return <div className="space-y-3">{blocks}</div>;
}

/** Reveals the answer progressively (the API returns it whole). */
export function Typed({ text, animate }: { text: string; animate: boolean }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(animate && !reduce ? 0 : text.length);
  useEffect(() => {
    if (shown >= text.length) return;
    const step = Math.max(2, Math.ceil(text.length / 90));
    const id = requestAnimationFrame(() => setShown((n) => Math.min(text.length, n + step)));
    return () => cancelAnimationFrame(id);
  }, [shown, text]);
  return <Markdown text={text.slice(0, shown)} />;
}

export const UNAVAILABLE_503 = "El asistente no está configurado en este servidor: falta la clave del modelo de lenguaje.";

/** Conversation state shared by the Assistant page and the per-class mini chat. */
export function useAssistantChat(context?: AskContext) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const counter = useRef(0);
  const ask = useMutation({
    mutationFn: ({ question, history }: { question: string; history: ChatTurn[] }) => api.ask(question, history, context),
    onSuccess: (answer) =>
      setMessages((m) => [...m, { id: ++counter.current, role: "assistant", content: answer.answer, tools: answer.tools_used, fresh: true }]),
    onError: (error) => {
      if (error instanceof ApiError && (error.status === 503 || error.status === 404)) {
        setUnavailable(error.status === 503 ? UNAVAILABLE_503 : "Este servidor todavía no ofrece el asistente.");
        return;
      }
      setMessages((m) => [...m, { id: ++counter.current, role: "assistant", content: error instanceof ApiError ? error.message : "No hubo respuesta del servidor.", error: true }]);
    },
  });
  const send = (question: string) => {
    const q = question.trim();
    if (!q || ask.isPending || unavailable) return false;
    const history = messages.filter((m) => !m.error).slice(-10).map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m.map((x) => ({ ...x, fresh: false })), { id: ++counter.current, role: "user", content: q }]);
    ask.mutate({ question: q, history });
    return true;
  };
  return { messages, reset: () => setMessages([]), send, pending: ask.isPending, unavailable };
}

export function UnavailableNote({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3 rounded-lg border border-line bg-sunken p-3.5" role="status">
      <CircleSlash size={18} className="mt-0.5 text-muted" aria-hidden />
      <div>
        <p className="text-label font-medium text-fg">El asistente no está disponible</p>
        <p className="mt-0.5 text-small text-muted">{text} El resto de ClassAI funciona con normalidad.</p>
      </div>
    </motion.div>
  );
}

export function MessageList({ messages, pending, compact }: { messages: Message[]; pending: boolean; compact?: boolean }) {
  const size = compact ? 22 : 26;
  return (
    <ol className={cn("flex flex-col", compact ? "gap-4" : "gap-5 pb-4")} aria-label="Conversación">
      <AnimatePresence initial={false}>
        {messages.map((m) => (
          <motion.li key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING.gentle} className={cn("flex gap-3", m.role === "user" && "justify-end")}>
            {m.role === "assistant" && <span className="mt-0.5 shrink-0"><LogoMark size={size} /></span>}
            {m.role === "user" ? (
              <p className="max-w-[80%] rounded-lg rounded-br-sm bg-selected px-3.5 py-2.5 text-body text-fg">{m.content}</p>
            ) : (
              <div className="min-w-0 flex-1 pt-0.5">
                <div className={cn("text-body leading-[22px] text-fg-2", m.error && "text-alert-text")}>
                  <Typed text={m.content} animate={!!m.fresh} />
                </div>
                {m.tools && m.tools.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-caption text-muted"><Wrench size={12} aria-hidden /> Consultó</span>
                    {m.tools.map((t) => (
                      <span key={t} title={t} className="inline-flex h-6 items-center rounded-sm border border-line bg-sunken px-2 text-caption text-fg-2">
                        {TOOL_LABEL[t] ?? t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.li>
        ))}
        {pending && (
          <motion.li key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3" aria-live="polite">
            <LogoMark size={size} />
            <span className="flex items-center gap-1" aria-label="Pensando">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="size-1.5 rounded-full bg-muted" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }} />
              ))}
            </span>
          </motion.li>
        )}
      </AnimatePresence>
    </ol>
  );
}

export function AskInput({ onSend, disabled, pending, placeholder, hint }: { onSend: (q: string) => boolean; disabled: boolean; pending: boolean; placeholder: string; hint?: ReactNode }) {
  const [input, setInput] = useState("");
  const id = useId();
  const submit = () => {
    if (onSend(input)) setInput("");
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-end gap-2">
      <label htmlFor={id} className="sr-only">Pregunta</label>
      <textarea
        id={id}
        rows={1}
        value={input}
        disabled={disabled}
        onChange={(e) => {
          setInput(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={disabled ? "El asistente no está disponible" : placeholder}
        className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-body text-fg outline-none placeholder:text-faint disabled:cursor-not-allowed"
      />
      {hint}
      <Button type="submit" variant="primary" aria-label="Enviar pregunta" disabled={!input.trim() || pending || disabled} className="size-9 px-0">
        <ArrowUp size={16} aria-hidden />
      </Button>
    </form>
  );
}

const CLASS_SUGGESTIONS = ["¿Cuál fue la temperatura promedio?", "¿Por qué bajó el confort?", "¿Cuánto movimiento hubo?"];

/** "Ask ClassAI about this class": the assistant scoped to a session or a room, embedded at the bottom of a page. */
export function ClassChat({ context, live, className, style }: { context: AskContext; live?: boolean; className?: string; style?: CSSProperties }) {
  const chat = useAssistantChat(context);
  const endRef = useRef<HTMLDivElement>(null);
  const suggestions = live ? ["¿Cómo está el confort ahora?", "¿Por qué hace calor?", "¿Cuánto movimiento hay?"] : CLASS_SUGGESTIONS;
  useEffect(() => {
    if (chat.messages.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chat.messages.length, chat.pending]);

  return (
    <Card className={cn("p-4", className)} style={style} aria-label="Pregúntale a ClassAI sobre esta clase">
      <header className="flex items-center gap-3">
        <LogoMark size={26} />
        <div className="min-w-0 flex-1">
          <h2 className="text-label font-semibold text-fg">Pregúntale a ClassAI sobre esta clase</h2>
          <p className="text-caption text-muted">Responde con los datos de {live ? "esta aula" : "esta sesión"}; solo consulta, nunca cambia nada.</p>
        </div>
        {chat.messages.length > 0 && <Button variant="ghost" size="sm" onClick={chat.reset}>Limpiar</Button>}
      </header>

      {chat.unavailable && <div className="mt-3"><UnavailableNote text={chat.unavailable} /></div>}

      {chat.messages.length > 0 && <div className="mt-4 max-h-[520px] overflow-y-auto pr-1"><MessageList messages={chat.messages} pending={chat.pending} compact /><div ref={endRef} /></div>}

      {chat.messages.length === 0 && !chat.unavailable && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s, i) => (
            <motion.button
              key={s}
              type="button"
              onClick={() => chat.send(s)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING.gentle, delay: 0.05 * i }}
              className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-label text-fg-2 shadow-xs transition-colors hover:border-line-strong hover:text-fg"
            >
              {s}
            </motion.button>
          ))}
        </div>
      )}

      <div className="mt-3 rounded-lg border border-line bg-surface p-1.5 shadow-xs">
        <AskInput onSend={chat.send} disabled={!!chat.unavailable} pending={chat.pending} placeholder="Pregunta sobre esta clase…" />
      </div>
    </Card>
  );
}
