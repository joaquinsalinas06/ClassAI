import { Bot, Maximize2, Minimize2, SquarePen, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useMatch } from "react-router";
import { useApp } from "../app/context";
import { useCurrentClass, useSummary, type AskContext } from "../lib/api";
import { IconButton } from "../ui/Button";
import { cn } from "../ui/cn";
import { AskInput, MessageItem, Thinking, UnavailableNote, useAssistantChat, type Message } from "./AssistantChat";

/** Exits run a bit shorter than entrances: the UI answers quickly once the teacher decides. */
const EXIT_MS = 200;
type Phase = "closed" | "open" | "closing";

interface PageContext {
  key: string;
  context?: AskContext;
  /** "Curso · Aula" once the data is in. */
  label?: string;
  suggestions: string[];
  placeholder: string;
}

/** What "this class" means on the current page: the session detail, the live room, or nothing. */
function usePageContext(): PageContext {
  const sessionId = useMatch("/sesiones/:id")?.params.id;
  const roomId = useMatch("/aula/:room")?.params.room;
  const { rooms } = useApp();
  const summary = useSummary(sessionId);
  const current = useCurrentClass(roomId);
  const roomName = (id: string) => rooms?.find((r) => r.id === id)?.name ?? id.toUpperCase();

  if (sessionId) {
    const s = summary.data?.found ? summary.data : null;
    return {
      key: `s:${sessionId}`,
      context: { session_id: sessionId, ...(s ? { room: s.room } : {}) },
      label: s ? [s.course, roomName(s.room)].filter(Boolean).join(" · ") : undefined,
      suggestions: ["Resume la clase", "¿Cuánto movimiento hubo?", "¿Por qué bajó el confort?"],
      placeholder: "Pregunta sobre esta clase…",
    };
  }
  if (roomId) {
    return {
      key: `r:${roomId}`,
      context: { room: roomId },
      label: [current.data?.session?.course, roomName(roomId)].filter(Boolean).join(" · "),
      suggestions: ["¿Cómo está el confort ahora?", "¿Cuánto movimiento hay?", "Resume la clase"],
      placeholder: "Pregunta sobre esta aula…",
    };
  }
  return {
    key: "general",
    suggestions: ["¿Cómo estuvo la clase de ayer en L201?", "¿Qué aula está más calurosa ahora?", "Resume las clases de hoy"],
    placeholder: "Escribe una pregunta…",
  };
}

/** Floating assistant for every teacher page: a pill launcher and a chat panel that knows which class is on screen. */
export function AssistantWidget() {
  // closed → open → closing → closed: the panel stays mounted while its exit plays.
  const [phase, setPhase] = useState<Phase>("closed");
  const [wide, setWide] = useState(false);
  const page = usePageContext();
  const onAssistantPage = !!useMatch("/asistente");

  const close = useCallback(() => {
    setPhase((p) => (p === "open" ? "closing" : p));
    window.setTimeout(() => setPhase((p) => (p === "closing" ? "closed" : p)), EXIT_MS);
  }, []);

  // The Asistente page already is the full chat.
  if (onAssistantPage) return null;

  return (
    <>
      <div
        className={cn(
          "fixed right-4 bottom-4 z-40 origin-bottom-right transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] sm:right-6 sm:bottom-6 print:hidden",
          phase === "closed" ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0",
        )}
        aria-hidden={phase !== "closed"}
      >
        <button
          type="button"
          onClick={() => setPhase("open")}
          tabIndex={phase === "closed" ? 0 : -1}
          aria-label="Abrir el asistente IA"
          className="group flex h-11 items-center gap-2 rounded-full bg-ink pr-4 pl-3.5 text-label font-semibold text-on-ink shadow-lg transition-[opacity,box-shadow,transform] duration-200 hover:opacity-90 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page focus-visible:outline-none active:scale-[0.97]"
        >
          <Bot size={20} className="transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110" aria-hidden />
          Asistente IA
        </button>
      </div>
      {/* Keyed by context: another class starts another conversation. The chat state lives here, so closing keeps it. */}
      <WidgetChat key={page.key} page={page} phase={phase} wide={wide} onToggleWide={() => setWide((w) => !w)} onClose={close} />
    </>
  );
}

function WidgetChat({ page, phase, wide, onToggleWide, onClose }: { page: PageContext; phase: Phase; wide: boolean; onToggleWide: () => void; onClose: () => void }) {
  const chat = useAssistantChat(page.context);
  const [resetting, setResetting] = useState(false);
  const [viewHeight, setViewHeight] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const mounted = phase !== "closed";

  // Turns: each question with its answer. The last one fills the visible height, so the question can rise to the
  // top and the answer writes itself below without pushing anything.
  const turns = useMemo(() => {
    const grouped: Message[][] = [];
    for (const m of chat.messages) {
      if (m.role === "user" || grouped.length === 0) grouped.push([m]);
      else grouped[grouped.length - 1]!.push(m);
    }
    return grouped;
  }, [chat.messages]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!mounted || !el) return;
    const measure = () => setViewHeight(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted, wide]);

  const last = chat.messages.at(-1);
  useEffect(() => {
    const el = scrollerRef.current;
    const target = el?.querySelector<HTMLElement>("[data-turn='last']");
    if (!el || !target || last?.role !== "user") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: target.offsetTop - 16, behavior: reduce ? "auto" : "smooth" });
  }, [last]);

  if (!mounted) return null;

  // The conversation fades out before it is cleared; the welcome comes back with its cascade.
  const startNew = () => {
    if (!chat.messages.length || resetting) return;
    setResetting(true);
    window.setTimeout(() => {
      chat.reset();
      setResetting(false);
    }, EXIT_MS);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") onClose();
  };

  return (
    <div
      role="dialog"
      aria-label="Asistente IA"
      onKeyDown={onKeyDown}
      className={cn(
        "fixed right-4 bottom-4 z-40 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] origin-bottom-right flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg transition-[width,height] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] sm:right-6 sm:bottom-6 print:hidden",
        wide ? "h-[44rem] sm:w-[44rem]" : "h-[38rem] sm:w-[26rem]",
        phase === "closing" ? "assistant-pop-out" : "assistant-pop",
      )}
    >
      <header className="flex items-center gap-1 border-b border-line py-2.5 pr-2 pl-3.5">
        <span className="mr-1.5 grid size-8 shrink-0 place-items-center rounded-full bg-ink text-on-ink" aria-hidden><Bot size={17} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-label leading-tight font-semibold text-fg">Asistente IA</h2>
          <p className="truncate text-caption text-muted" title={page.label}>
            {page.context ? `Sobre: ${page.label || (page.context.session_id ? "esta sesión" : "esta aula")}` : "Tus aulas, clases y asistencia"}
          </p>
        </div>
        <IconButton label="Nueva conversación" size="sm" onClick={startNew} disabled={!chat.messages.length}><SquarePen size={15} /></IconButton>
        <IconButton label={wide ? "Reducir panel" : "Ampliar panel"} size="sm" onClick={onToggleWide} className="hidden sm:inline-flex">
          {wide ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </IconButton>
        <IconButton label="Cerrar asistente" size="sm" onClick={onClose}><X size={16} /></IconButton>
      </header>

      <div ref={scrollerRef} className={cn("relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4", resetting && "assistant-out")}>
        {chat.unavailable && <div className="mb-4"><UnavailableNote text={chat.unavailable} /></div>}

        {chat.messages.length === 0 && !chat.unavailable && (
          <div className="flex flex-col gap-4">
            <div className="assistant-rise">
              <p className="text-heading font-semibold text-fg">Hola, ¿qué quieres saber?</p>
              <p className="mt-1 text-small text-muted">
                {page.context ? "Respondo con los datos de lo que tienes en pantalla." : "Pregunta por aulas, clases, asistencia o el confort."} Solo consulto; nunca cambio nada.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {page.suggestions.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => chat.send(s)}
                  style={{ animationDelay: `${80 + i * 45}ms` } as CSSProperties}
                  className="assistant-rise inline-flex min-h-8 items-center rounded-full border border-line bg-surface px-3 py-1 text-left text-label text-fg-2 shadow-xs transition-[border-color,color,transform] duration-150 hover:border-line-strong hover:text-fg active:scale-[0.97]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) => {
          const isLast = i === turns.length - 1;
          return (
            <div
              key={turn[0]!.id}
              data-turn={isLast ? "last" : undefined}
              className="flex flex-col gap-4 pb-5"
              style={isLast && viewHeight ? { minHeight: viewHeight - 32 } : undefined}
            >
              {turn.map((m) => (
                <div key={m.id} className="assistant-rise">
                  <MessageItem m={m} compact onRetry={m === chat.messages.at(-1) ? chat.retry : undefined} />
                </div>
              ))}
              {isLast && chat.pending && <div className="assistant-rise"><Thinking size={22} /></div>}
            </div>
          );
        })}
      </div>

      <div className="border-t border-line p-2.5">
        <div className="rounded-lg border border-line bg-surface p-1 shadow-xs focus-within:border-line-strong">
          <AskInput autoFocus onSend={chat.send} disabled={!!chat.unavailable} pending={chat.pending} placeholder={page.placeholder} />
        </div>
      </div>
    </div>
  );
}
