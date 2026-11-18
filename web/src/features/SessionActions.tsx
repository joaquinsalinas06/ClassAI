import * as Dialog from "@radix-ui/react-dialog";
import { Plus, Square, Trash2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useApp } from "../app/context";
import { useSessionMutations } from "../lib/api";
import { Button } from "../ui/Button";
import { inputClass } from "../ui/cn";
import { useToast } from "../ui/Toast";

function Modal({ open, onOpenChange, title, description, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-60 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-5 shadow-lg outline-none">
          <Dialog.Title className="text-heading font-semibold text-fg">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-body text-muted">{description}</Dialog.Description>
          <div className="mt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** datetime-local value for "now" in the browser's zone. */
const localNow = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function NewSessionButton({ onCreated }: { onCreated?: (id: string) => void }) {
  const { rooms, room: currentRoom } = useApp();
  const { create } = useSessionMutations();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState(currentRoom);
  const [course, setCourse] = useState("");
  const [start, setStart] = useState(localNow);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      { room, course: course.trim(), started_at: start ? new Date(start).toISOString() : undefined },
      {
        onSuccess: (session) => {
          setOpen(false);
          setCourse("");
          toast({ tone: "ok", title: `Clase abierta en ${session.room.toUpperCase()}`, description: session.published === false ? "El nodo de acceso la recibirá al reconectar." : session.course ?? undefined });
          onCreated?.(session.session_id);
        },
      },
    );
  };

  const roomIds = rooms?.length ? rooms.map((r) => ({ id: r.id, name: r.name ?? r.id.toUpperCase() })) : [{ id: currentRoom, name: currentRoom.toUpperCase() }];
  return (
    <>
      <Button variant="primary" icon={<Plus size={15} aria-hidden />} onClick={() => { setStart(localNow()); setRoom(currentRoom); create.reset(); setOpen(true); }}>
        Nueva sesión
      </Button>
      <Modal open={open} onOpenChange={setOpen} title="Nueva sesión de clase" description="Los alumnos la verán en la app y el nodo de acceso empezará a registrar asistencia.">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-label font-medium text-fg">Curso</span>
            <input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="CS5055 Internet de las cosas" required autoFocus maxLength={80} className={inputClass} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-medium text-fg">Aula</span>
              <select value={room} onChange={(e) => setRoom(e.target.value)} className={inputClass}>
                {roomIds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-medium text-fg">Hora de inicio</span>
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
            </label>
          </div>
          {create.isError && <p role="alert" className="rounded-md border border-alert-border bg-alert-subtle px-3 py-2 text-label text-alert-text">{create.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={!course.trim() || create.isPending}>{create.isPending ? "Abriendo…" : "Abrir clase"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Close (if open) and delete, each behind a confirmation. */
export function SessionRowActions({ id, open, label, onDeleted, size = "sm" }: {
  id: string; open: boolean; label: string; onDeleted?: () => void; size?: "sm" | "md";
}) {
  const { close, remove } = useSessionMutations();
  const toast = useToast();
  const [confirm, setConfirm] = useState<"close" | "delete" | null>(null);
  const pending = close.isPending || remove.isPending;
  const run = () => {
    const done = { onSuccess: () => { setConfirm(null); toast({ tone: "ok", title: confirm === "close" ? "Clase cerrada" : "Sesión eliminada" }); if (confirm === "delete") onDeleted?.(); },
                   onError: (e: Error) => toast({ tone: "alert", title: "No se pudo completar", description: e.message }) };
    if (confirm === "close") close.mutate(id, done);
    else remove.mutate(id, done);
  };
  return (
    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      {open && <Button size={size} icon={<Square size={12} aria-hidden />} onClick={() => setConfirm("close")}>Cerrar clase</Button>}
      <Button size={size} variant="ghost" icon={<Trash2 size={13} aria-hidden />} aria-label={`Eliminar ${label}`} onClick={() => setConfirm("delete")}>
        {size === "md" ? "Eliminar" : null}
      </Button>
      <Modal
        open={confirm != null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "close" ? "¿Cerrar la clase?" : "¿Eliminar la sesión?"}
        description={confirm === "close"
          ? `${label}. Se deja de registrar asistencia y votos, y se calcula el resumen.`
          : `${label}. Se borran también su asistencia, votos y resumen. No se puede deshacer.`}
      >
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirm(null)}>Cancelar</Button>
          <Button variant={confirm === "delete" ? "danger" : "primary"} disabled={pending} onClick={run}>
            {confirm === "close" ? "Cerrar clase" : "Eliminar"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
