import { cn } from "./cn";

export function Kbd({ children, tone = "default", className }: { children: React.ReactNode; tone?: "default" | "inverse"; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs px-1 font-mono text-[11px] leading-none",
        tone === "inverse" ? "bg-white/15 text-fg-inverse" : "border border-line bg-sunken text-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
