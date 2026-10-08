import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { SPRING } from "./motion";

type ToastTone = "ok" | "info" | "alert";
interface ToastItem { id: number; tone: ToastTone; title: string; description?: string }
type Push = (toast: Omit<ToastItem, "id">) => void;

const ToastContext = createContext<Push>(() => {});
export const useToast = () => useContext(ToastContext);

const ICON = { ok: CircleCheck, info: Info, alert: TriangleAlert };
const ICON_COLOR = { ok: "text-ok", info: "text-info", alert: "text-alert" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback<Push>((toast) => {
    const id = ++counter.current;
    setItems((list) => [...list.slice(-2), { ...toast, id }]);
    setTimeout(() => dismiss(id), 4_200);
  }, [dismiss]);
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2">
        <AnimatePresence initial={false}>
          {items.map((toast) => {
            const Icon = ICON[toast.tone];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, transition: { duration: 0.14 } }}
                transition={SPRING.gentle}
                role="status"
                className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-raised p-3 pr-2 shadow-lg"
              >
                <Icon size={18} className={cn("mt-px", ICON_COLOR[toast.tone])} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-label font-medium text-fg">{toast.title}</p>
                  {toast.description && <p className="mt-0.5 text-small text-muted">{toast.description}</p>}
                </div>
                <button aria-label="Cerrar aviso" onClick={() => dismiss(toast.id)} className="rounded-sm p-1 text-faint hover:bg-hover hover:text-fg">
                  <X size={14} aria-hidden />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
