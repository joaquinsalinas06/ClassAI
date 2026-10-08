import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { CalendarClock, Moon, PanelLeft, Sun } from "lucide-react";
import { useNavigate } from "react-router";
import { useSessions } from "../lib/api";
import { formatDate, formatTime } from "../lib/format";
import { Dot } from "../ui/Badge";
import { Kbd } from "../ui/Kbd";
import { useApp } from "./context";
import { NAV, NAV_FOOTER, roomTone } from "./Shell";

const itemClass =
  "flex h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-label text-fg-2 data-[selected=true]:bg-hover data-[selected=true]:text-fg";
const groupClass =
  "px-1.5 pb-1.5 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:text-muted";

export function CommandPalette({ open, onOpenChange, onToggleSidebar }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleSidebar: () => void;
}) {
  const navigate = useNavigate();
  const { rooms, room, setRoom, theme } = useApp();
  const recent = useSessions({ limit: 8 });
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[14vh] left-1/2 z-60 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-raised shadow-lg outline-none data-[state=open]:animate-[ds-palette_180ms_var(--ds-motion-easing-enter)]"
        >
          <Dialog.Title className="sr-only">Paleta de comandos</Dialog.Title>
          <Command label="Paleta de comandos" loop>
      <Command.Input
        placeholder="Busca páginas, aulas, sesiones o acciones…"
        className="h-13 w-full border-b border-line bg-transparent px-4 text-body text-fg outline-none placeholder:text-faint"
      />
      <Command.List className="max-h-[min(420px,60vh)] overflow-y-auto py-1">
        <Command.Empty className="px-4 py-8 text-center text-small text-muted">Sin resultados. Prueba con el nombre de un aula o un curso.</Command.Empty>
        <Command.Group heading="Ir a" className={groupClass}>
          {[...NAV, ...NAV_FOOTER].map((item) => (
            <Command.Item
              key={item.to}
              value={`ir ${item.label}`}
              onSelect={() => run(() => navigate(item.to === "/aula" ? `/aula/${room}` : item.to))}
              className={itemClass}
            >
              <item.icon size={16} className="text-muted" aria-hidden />
              <span className="flex-1">{item.label}</span>
              <span className="flex gap-0.5">
                <Kbd>G</Kbd>
                <Kbd>{item.key.toUpperCase()}</Kbd>
              </span>
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Aulas" className={groupClass}>
          {(rooms ?? []).map((r) => (
            <Command.Item
              key={r.id}
              value={`aula ${r.name ?? ""} ${r.id}`}
              onSelect={() => run(() => {
                setRoom(r.id);
                navigate(`/aula/${r.id}`);
              })}
              className={itemClass}
            >
              <span className="flex size-4 items-center justify-center"><Dot tone={roomTone(r)} /></span>
              <span className="flex-1">{r.name ?? r.id}</span>
              <span className="text-caption text-muted">{r.status === "offline" ? "Sin conexión" : r.current_session_id ? "Clase en curso" : "Sin clase"}</span>
            </Command.Item>
          ))}
        </Command.Group>
        {recent.data && recent.data.data.length > 0 && (
          <Command.Group heading="Sesiones recientes" className={groupClass}>
            {recent.data.data.map((s) => (
              <Command.Item
                key={s.session_id}
                value={`sesion ${s.course ?? ""} ${s.room} ${s.session_id}`}
                onSelect={() => run(() => navigate(`/sesiones/${encodeURIComponent(s.session_id)}`))}
                className={itemClass}
              >
                <CalendarClock size={16} className="text-muted" aria-hidden />
                <span className="flex-1">
                  {s.course ?? "Sin curso"} <span className="text-muted">· {s.room.toUpperCase()}</span>
                </span>
                <span className="num text-caption text-muted">
                  {formatDate(s.started_at)} {formatTime(s.started_at)}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        <Command.Group heading="Acciones" className={groupClass}>
          <Command.Item value="tema cambiar claro oscuro" onSelect={() => run(theme.toggle)} className={itemClass}>
            {theme.resolved === "dark" ? <Sun size={16} className="text-muted" /> : <Moon size={16} className="text-muted" />}
            <span className="flex-1">{theme.resolved === "dark" ? "Usar tema claro" : "Usar tema oscuro"}</span>
          </Command.Item>
          <Command.Item value="barra lateral contraer expandir" onSelect={() => run(onToggleSidebar)} className={itemClass}>
            <PanelLeft size={16} className="text-muted" />
            <span className="flex-1">Contraer o expandir la barra lateral</span>
            <Kbd>[</Kbd>
          </Command.Item>
        </Command.Group>
      </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
