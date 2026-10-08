import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import {
  BotMessageSquare, Check, ChevronsUpDown, History, LayoutDashboard, Menu, Moon, Palette, PanelLeft, Radio, Search, Sun,
  UsersRound, type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useMatch, useNavigate } from "react-router";
import { MOCK, useHealth, useRooms } from "../lib/api";
import { formatRelative } from "../lib/format";
import { useLive } from "../lib/useLive";
import type { Room } from "../lib/types";
import { Dot, StateBadge, type Tone } from "../ui/Badge";
import { IconButton } from "../ui/Button";
import { cn } from "../ui/cn";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import { Kbd } from "../ui/Kbd";
import { DURATION, EASE } from "../ui/motion";
import { Tooltip } from "../ui/Tooltip";
import { CommandPalette } from "./CommandPalette";
import { AppContext, useApp } from "./context";
import { LogoMark } from "./Logo";
import { useTheme } from "./theme";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  key: string; // second key of the "g <key>" chord
}
export const NAV: NavItem[] = [
  { to: "/", label: "Resumen", icon: LayoutDashboard, key: "o" },
  { to: "/aula", label: "Aula en vivo", icon: Radio, key: "l" },
  { to: "/sesiones", label: "Sesiones", icon: History, key: "s" },
  { to: "/asistente", label: "Asistente", icon: BotMessageSquare, key: "a" },
  { to: "/estudiantes", label: "Estudiantes", icon: UsersRound, key: "e" },
];
export const NAV_FOOTER: NavItem[] = [{ to: "/design", label: "Sistema de diseño", icon: Palette, key: "d" }];

const read = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable; preference lasts for this tab
  }
};

export const roomName = (rooms: Room[] | undefined, id: string) => rooms?.find((r) => r.id === id)?.name ?? id.toUpperCase();
export const roomTone = (room: Room | undefined): Tone => {
  if (!room || room.status === "offline") return "offline";
  const state = room.last_telemetry?.state;
  return state === "OK" ? "ok" : state === "ALERT" ? "alert" : state === "REGULAR" ? "regular" : "neutral";
};

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const rooms = useRooms();
  const [room, setRoomState] = useState(() => read("classai.room", "a101"));
  const [collapsed, setCollapsed] = useState(() => read("classai.sidebar", "open") === "collapsed");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const live = useLive(room);

  const setRoom = useCallback((next: string) => {
    setRoomState(next);
    write("classai.room", next);
  }, []);

  // Keep the selected room valid once /rooms answers.
  useEffect(() => {
    if (rooms.data?.length && !rooms.data.some((r) => r.id === room)) setRoom(rooms.data[0]!.id);
  }, [rooms.data, room, setRoom]);

  // /aula/:room in the URL wins over the stored room.
  const aulaMatch = useMatch("/aula/:room");
  useEffect(() => {
    const fromUrl = aulaMatch?.params.room;
    if (fromUrl && fromUrl !== room) setRoom(fromUrl);
  }, [aulaMatch?.params.room, room, setRoom]);

  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      write("classai.sidebar", c ? "open" : "collapsed");
      return !c;
    });
  }, []);

  useEffect(() => {
    let chordAt = 0;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      if (event.key === "g") {
        chordAt = Date.now();
        return;
      }
      if (Date.now() - chordAt < 1200) {
        chordAt = 0;
        const item = [...NAV, ...NAV_FOOTER].find((n) => n.key === event.key);
        if (item) {
          event.preventDefault();
          navigate(item.to === "/aula" ? `/aula/${read("classai.room", "a101")}` : item.to);
        }
        return;
      }
      if (event.key === "[") toggleSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, toggleSidebar]);

  useEffect(() => setMobileNav(false), [location.pathname]);

  const value = useMemo(
    () => ({ room, setRoom, rooms: rooms.data, live, theme, openPalette: () => setPaletteOpen(true) }),
    [room, setRoom, rooms.data, live, theme],
  );

  return (
    <AppContext.Provider value={value}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[90] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Saltar al contenido
      </a>
      <div className="flex min-h-dvh">
        <motion.aside
          initial={false}
          animate={{ width: collapsed ? 60 : 240 }}
          transition={{ duration: DURATION.base, ease: EASE.standard }}
          className="sticky top-0 z-20 hidden h-dvh shrink-0 overflow-hidden border-r border-line bg-page lg:block"
        >
          <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
        </motion.aside>

        <Dialog.Root open={mobileNav} onOpenChange={setMobileNav}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] lg:hidden" />
            <Dialog.Content className="fixed inset-y-0 left-0 z-60 w-[264px] border-r border-line bg-page shadow-lg outline-none lg:hidden">
              <Dialog.Title className="sr-only">Navegación</Dialog.Title>
              <Dialog.Description className="sr-only">Secciones de ClassAI</Dialog.Description>
              <Sidebar collapsed={false} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenu={() => setMobileNav(true)} />
          <main id="main" className="min-w-0 flex-1">
            <motion.div
              key={location.pathname.split("/").slice(0, 2).join("/")}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION.base, ease: EASE.enter }}
              className="mx-auto w-full max-w-[1360px] px-4 pt-5 pb-16 sm:px-6 lg:px-8 lg:pt-7"
            >
              <ErrorBoundary label="esta página" resetKey={location.pathname}>
                <Outlet />
              </ErrorBoundary>
            </motion.div>
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onToggleSidebar={toggleSidebar} />
    </AppContext.Provider>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle?: () => void }) {
  const { rooms, room } = useApp();
  const health = useHealth();
  const location = useLocation();
  const apiOk = health.data?.status === "ok";

  const link = (item: NavItem) => {
    const to = item.to === "/aula" ? `/aula/${room}` : item.to;
    const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
    const body = (
      <NavLink
        key={item.to}
        to={to}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-label font-medium transition-colors duration-100",
          active ? "bg-selected text-fg" : "text-fg-2 hover:bg-hover hover:text-fg",
          collapsed && "justify-center px-0",
        )}
      >
        <item.icon size={16} className={active ? "text-fg" : "text-muted group-hover:text-fg-2"} aria-hidden />
        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
        {!collapsed && (
          <span className="hidden items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 xl:flex">
            <Kbd>G</Kbd>
            <Kbd>{item.key.toUpperCase()}</Kbd>
          </span>
        )}
      </NavLink>
    );
    return collapsed ? (
      <Tooltip key={item.to} content={item.label} shortcut={`G ${item.key.toUpperCase()}`} side="right">
        {body}
      </Tooltip>
    ) : (
      body
    );
  };

  return (
    <nav aria-label="Principal" className="flex h-full w-full flex-col gap-1 px-2.5 py-3">
      <div className={cn("mb-3 flex h-8 items-center gap-2.5 px-1.5", collapsed && "justify-center px-0")}>
        <LogoMark size={24} />
        {!collapsed && <span className="flex-1 text-heading font-semibold tracking-[-0.02em] text-fg">ClassAI</span>}
        {!collapsed && onToggle && (
          <IconButton label="Contraer barra lateral" shortcut="[" size="sm" onClick={onToggle}>
            <PanelLeft size={16} />
          </IconButton>
        )}
      </div>
      {collapsed && onToggle && (
        <div className="mb-2 flex justify-center">
          <IconButton label="Expandir barra lateral" shortcut="[" size="sm" onClick={onToggle}>
            <PanelLeft size={16} />
          </IconButton>
        </div>
      )}
      <div className="flex flex-col gap-0.5">{NAV.map(link)}</div>

      <div className={cn("mt-6 mb-1 px-2.5 text-caption font-medium text-muted", collapsed && "sr-only")}>Aulas</div>
      <div className="flex flex-col gap-0.5">
        {(rooms ?? []).map((r) => {
          const active = location.pathname === `/aula/${r.id}`;
          const tone = roomTone(r);
          const body = (
            <NavLink
              key={r.id}
              to={`/aula/${r.id}`}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-label transition-colors duration-100",
                active ? "bg-selected text-fg" : "text-fg-2 hover:bg-hover hover:text-fg",
                collapsed && "justify-center px-0",
              )}
            >
              <span className="flex size-4 items-center justify-center">
                <Dot tone={tone} pulse={tone === "alert"} />
              </span>
              {!collapsed && <span className="flex-1 truncate">{r.name ?? r.id}</span>}
              {!collapsed && r.status === "offline" && <span className="text-caption text-faint">sin conexión</span>}
            </NavLink>
          );
          return collapsed ? (
            <Tooltip key={r.id} content={r.name ?? r.id} side="right">
              {body}
            </Tooltip>
          ) : (
            body
          );
        })}
      </div>

      <div className="mt-auto flex flex-col gap-0.5">
        {NAV_FOOTER.map(link)}
        <Tooltip content={MOCK ? "Datos simulados en el navegador" : apiOk ? "API conectada" : "La API no responde"} side="right">
          <div className={cn("flex h-8 items-center gap-2.5 px-2.5 text-caption text-muted", collapsed && "justify-center px-0")}>
            <span className="flex size-4 items-center justify-center">
              <Dot tone={MOCK ? "info" : apiOk ? "ok" : health.isPending ? "neutral" : "alert"} />
            </span>
            {!collapsed && <span className="truncate">{MOCK ? "Modo demostración" : apiOk ? "API en línea" : health.isPending ? "Comprobando API…" : "API sin respuesta"}</span>}
          </div>
        </Tooltip>
      </div>
    </nav>
  );
}

function useTitle() {
  const location = useLocation();
  const { rooms } = useApp();
  const parts = location.pathname.split("/").filter(Boolean);
  const item = [...NAV, ...NAV_FOOTER].find((n) => (n.to === "/" ? parts.length === 0 : `/${parts[0]}` === n.to));
  const crumbs = [item?.label ?? "ClassAI"];
  if (parts[0] === "aula" && parts[1]) crumbs.push(roomName(rooms, parts[1]));
  if (parts[0] === "sesiones" && parts[1]) crumbs.push(decodeURIComponent(parts[1]));
  return crumbs;
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { theme, openPalette } = useApp();
  const crumbs = useTitle();
  return (
    <header className="sticky top-0 z-30 flex h-13 items-center gap-2 border-b border-line bg-page/85 px-3 backdrop-blur-md sm:px-5 lg:px-8">
      <IconButton label="Abrir navegación" className="lg:hidden" onClick={onMenu}>
        <Menu size={18} />
      </IconButton>
      <nav aria-label="Ruta" className="flex min-w-0 flex-1 items-center gap-1.5 text-label">
        {crumbs.map((c, i) => (
          <span key={c} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <span className="text-faint">/</span>}
            <span className={cn("truncate", i === crumbs.length - 1 ? "font-medium text-fg" : "text-muted")}>{c}</span>
          </span>
        ))}
      </nav>
      <RoomSwitcher />
      <LiveIndicator />
      <button
        type="button"
        onClick={openPalette}
        className="hidden h-8 items-center gap-2 rounded-md border border-line bg-surface pr-1.5 pl-2.5 text-label text-muted shadow-xs transition-colors hover:border-line-strong hover:text-fg-2 md:flex"
      >
        <Search size={14} aria-hidden />
        <span className="pr-4">Buscar</span>
        <Kbd>⌘K</Kbd>
      </button>
      <IconButton label="Buscar" className="md:hidden" onClick={openPalette}>
        <Search size={16} />
      </IconButton>
      <IconButton label={theme.resolved === "dark" ? "Usar tema claro" : "Usar tema oscuro"} onClick={theme.toggle}>
        <motion.span key={theme.resolved} initial={{ rotate: -40, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: DURATION.base }}>
          {theme.resolved === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </motion.span>
      </IconButton>
    </header>
  );
}

function RoomSwitcher() {
  const { room, setRoom, rooms } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const current = rooms?.find((r) => r.id === room);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Aula seleccionada: ${current?.name ?? room}. Cambiar aula`}
          className="flex h-8 max-w-[200px] items-center gap-2 rounded-md px-2 text-label font-medium text-fg transition-colors hover:bg-hover"
        >
          <Dot tone={roomTone(current)} />
          <span className="truncate">{current?.name ?? room.toUpperCase()}</span>
          <ChevronsUpDown size={14} className="text-muted" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-40 w-72 rounded-lg border border-line bg-raised p-1 shadow-lg data-[state=open]:animate-[ds-tip_160ms_var(--ds-motion-easing-enter)]"
        >
          <p className="px-2.5 pt-1.5 pb-1 text-caption text-muted">Cambiar aula</p>
          {(rooms ?? []).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setRoom(r.id);
                setOpen(false);
                if (location.pathname.startsWith("/aula")) navigate(`/aula/${r.id}`);
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-hover focus-visible:bg-hover"
            >
              <Dot tone={roomTone(r)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-label font-medium text-fg">{r.name ?? r.id}</span>
                <span className="block text-caption text-muted">
                  {r.status === "offline" ? `Visto ${formatRelative(r.last_telemetry?.received_at ?? r.last_telemetry?.ts)}` : r.current_session_id ? "Clase en curso" : "Sin clase"}
                </span>
              </span>
              {r.status !== "offline" && r.last_telemetry?.state && <StateBadge size="sm" state={r.last_telemetry.state} />}
              {r.id === room && <Check size={14} className="text-fg" aria-label="Seleccionada" />}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function LiveIndicator() {
  const { live } = useApp();
  const { connection, node, lastAt } = live.state;
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5_000);
    return () => clearInterval(id);
  }, []);
  let tone: Tone = "regular";
  let text = "Conectando";
  if (node === "offline") [tone, text] = ["offline", "Nodo sin conexión"];
  else if (connection === "open" && node === "online") [tone, text] = ["ok", "En vivo"];
  else if (connection === "open") [tone, text] = ["neutral", "Esperando datos"];
  else if (connection === "closed") [tone, text] = ["offline", "Sin flujo en vivo"];
  const detail = lastAt ? `Última lectura ${formatRelative(lastAt)}` : connection === "closed" ? "Reintentando conexión…" : "Sin lecturas todavía";
  return (
    <Tooltip content={detail}>
      <span role="status" className="hidden h-8 items-center gap-2 rounded-md px-2 text-label text-fg-2 sm:inline-flex" tabIndex={0}>
        <Dot tone={tone} pulse={tone === "ok"} />
        {text}
      </span>
    </Tooltip>
  );
}
