import { RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { AskInput, MessageList, UnavailableNote, useAssistantChat } from "../features/AssistantChat";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Kbd } from "../ui/Kbd";
import { SPRING } from "../ui/motion";

const SUGGESTIONS = [
  "¿Qué aula está más calurosa ahora?",
  "¿Cuántos estudiantes asistieron hoy a IOT4010?",
  "¿Por qué el rango de temperatura de A101 es ese?",
  "Resume las clases de hoy",
];

export function Assistant() {
  const { messages, reset, send, pending, unavailable } = useAssistantChat();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-140px)] w-full max-w-[760px] flex-col">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-title text-fg">Asistente</h1>
          <p className="mt-1 text-body text-muted">Pregunta por aulas, clases, asistencia o por qué el confort tiene esos rangos. Solo consulta datos; nunca cambia nada.</p>
        </div>
        {!empty && (
          <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={reset}>
            Nueva conversación
          </Button>
        )}
      </div>

      {unavailable && <div className="mb-4"><UnavailableNote text={unavailable} /></div>}

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
          <MessageList messages={messages} pending={pending} />
        )}
        <div ref={endRef} />
      </div>

      <Card className="sticky bottom-4 mt-4 p-2 shadow-md">
        <AskInput
          onSend={send}
          disabled={!!unavailable}
          pending={pending}
          placeholder="Escribe una pregunta…"
          hint={<span className="hidden items-center gap-1 pb-2 text-caption text-muted sm:flex"><Kbd>↵</Kbd> enviar</span>}
        />
      </Card>
    </div>
  );
}
