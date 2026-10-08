import { useMutation } from "@tanstack/react-query";
import { ArrowUp, CircleSlash, RotateCcw, Wrench } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { LogoMark } from "../app/Logo";
import { ApiError, api } from "../lib/api";
import type { ChatTurn } from "../lib/types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { cn } from "../ui/cn";
import { EmptyState } from "../ui/EmptyState";
import { Kbd } from "../ui/Kbd";
import { SPRING } from "../ui/motion";

const SUGGESTIONS = [
  "¿Qué aula está más calurosa ahora?",
  "¿Cuántos estudiantes asistieron hoy a IOT4010?",
  "¿Por qué el rango de temperatura de A101 es ese?",
  "Resume las clases de hoy",
];

const TOOL_LABEL: Record<string, string> = {
  get_current_class: "Clase actual",
  get_session_summary: "Resumen de sesión",
  list_sessions: "Lista de sesiones",
  compare_sessions: "Comparar sesiones",
  get_metric_series: "Serie de una métrica",
  get_attendance: "Asistencia",
  explain_comfort_decision: "Explicar el rango",
};

interface Message extends ChatTurn {
  id: number;
  tools?: string[];
  fresh?: boolean;
  error?: boolean;
}

/** Minimal, safe markdown: paragraphs, "- " lists and **bold**. No HTML injection. */
function Markdown({ text }: { text: string }) {
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-semibold text-fg">{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
    );
  const blocks: ReactNode[] = [];
  text.split(/\n{2,}/).forEach((block, b) => {
    const lines = block.split("\n");
    if (lines.every((l) => /^\s*[-*] /.test(l))) {
      blocks.push(<ul key={b} className="list-disc space-y-1 pl-5">{lines.map((l, i) => <li key={i}>{inline(l.replace(/^\s*[-*] /, ""))}</li>)}</ul>);
    } else {
      blocks.push(<p key={b}>{lines.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l)}</Fragment>)}</p>);
    }
  });
  return <div className="space-y-3">{blocks}</div>;
}

/** Reveals the answer progressively (the API returns it whole). */
function Typed({ text, animate, onDone }: { text: string; animate: boolean; onDone?: () => void }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(animate && !reduce ? 0 : text.length);
  useEffect(() => {
    if (shown >= text.length) {
      onDone?.();
      return;
    }
    const step = Math.max(2, Math.ceil(text.length / 90));
    const id = requestAnimationFrame(() => setShown((n) => Math.min(text.length, n + step)));
    return () => cancelAnimationFrame(id);
  }, [shown, text, onDone]);
  return <Markdown text={text.slice(0, shown)} />;
}

export function Assistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const counter = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const ask = useMutation({
    mutationFn: ({ question, history }: { question: string; history: ChatTurn[] }) => api.ask(question, history),
    onSuccess: (answer) =>
      setMessages((m) => [...m, { id: ++counter.current, role: "assistant", content: answer.answer, tools: answer.tools_used, fresh: true }]),
    onError: (error) => {
      if (error instanceof ApiError && (error.status === 503 || error.status === 404)) {
        setUnavailable(error.status === 503 ? "El asistente no está configurado en este servidor: falta la clave del modelo de lenguaje." : "Este servidor todavía no ofrece el asistente.");
        return;
      }
      setMessages((m) => [...m, { id: ++counter.current, role: "assistant", content: error instanceof ApiError ? error.message : "No hubo respuesta del servidor.", error: true }]);
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, ask.isPending]);

  const send = (question: string) => {
    const q = question.trim();
    if (!q || ask.isPending || unavailable) return;
    const history = messages.filter((m) => !m.error).slice(-10).map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m.map((x) => ({ ...x, fresh: false })), { id: ++counter.current, role: "user", content: q }]);
    setInput("");
    ask.mutate({ question: q, history });
  };

  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-140px)] w-full max-w-[760px] flex-col">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-title text-fg">Asistente</h1>
          <p className="mt-1 text-body text-muted">Pregunta por aulas, clases, asistencia o por qué el confort tiene esos rangos. Solo consulta datos; nunca cambia nada.</p>
        </div>
        {!empty && (
          <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={() => setMessages([])}>
            Nueva conversación
          </Button>
        )}
      </div>

      {unavailable && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex items-start gap-3 rounded-lg border border-line bg-sunken p-3.5" role="status">
          <CircleSlash size={18} className="mt-0.5 text-muted" aria-hidden />
          <div>
            <p className="text-label font-medium text-fg">El asistente no está disponible</p>
            <p className="mt-0.5 text-small text-muted">{unavailable} El resto de ClassAI funciona con normalidad.</p>
          </div>
        </motion.div>
      )}

      <div className="flex-1">
        {empty ? (
          <EmptyState
            illustration="chat"
            title="¿Qué quieres saber de tus aulas?"
            description="Las respuestas salen de los mismos datos que ves en ClassAI."
            action={
              <div className="mt-2 grid w-full max-w-[560px] gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s, i) => (
                  <motion.button
                    key={s}
                    type="button"
                    disabled={!!unavailable}
                    onClick={() => send(s)}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING.gentle, delay: 0.05 * i }}
                    className="rounded-lg border border-line bg-surface px-3.5 py-3 text-left text-label text-fg-2 shadow-xs transition-colors hover:border-line-strong hover:text-fg disabled:opacity-50"
                  >
                    {s}
                  </motion.button>
                ))}
              </div>
            }
          />
        ) : (
          <ol className="flex flex-col gap-5 pb-4" aria-label="Conversación">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.li key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING.gentle} className={cn("flex gap-3", m.role === "user" && "justify-end")}>
                  {m.role === "assistant" && <span className="mt-0.5"><LogoMark size={26} /></span>}
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
              {ask.isPending && (
                <motion.li key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3" aria-live="polite">
                  <LogoMark size={26} />
                  <span className="flex items-center gap-1" aria-label="Pensando">
                    {[0, 1, 2].map((i) => (
                      <motion.span key={i} className="size-1.5 rounded-full bg-muted" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }} />
                    ))}
                  </span>
                </motion.li>
              )}
            </AnimatePresence>
          </ol>
        )}
        <div ref={endRef} />
      </div>

      <Card className="sticky bottom-4 mt-4 p-2 shadow-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2"
        >
          <label htmlFor="ask" className="sr-only">Pregunta</label>
          <textarea
            id="ask"
            ref={inputRef}
            rows={1}
            value={input}
            disabled={!!unavailable}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={unavailable ? "El asistente no está disponible" : "Escribe una pregunta…"}
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-body text-fg outline-none placeholder:text-faint disabled:cursor-not-allowed"
          />
          <span className="hidden items-center gap-1 pb-2 text-caption text-muted sm:flex"><Kbd>↵</Kbd> enviar</span>
          <Button type="submit" variant="primary" aria-label="Enviar pregunta" disabled={!input.trim() || ask.isPending || !!unavailable} className="size-9 px-0">
            <ArrowUp size={16} aria-hidden />
          </Button>
        </form>
      </Card>
    </div>
  );
}
