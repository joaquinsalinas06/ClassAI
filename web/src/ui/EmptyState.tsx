import type { ReactNode } from "react";
import { cn } from "./cn";

/** Line illustrations drawn in the icon language (1.75 stroke, rounded), tinted with text tokens only. */
const ILLUSTRATIONS = {
  room: (
    <>
      <rect x="14" y="18" width="68" height="44" rx="6" />
      <path d="M14 30h68M26 18v-6M70 18v-6" />
      <circle cx="48" cy="46" r="9" strokeDasharray="3 4" />
      <path d="M48 40v6l4 3" />
    </>
  ),
  chart: (
    <>
      <path d="M14 66h68M14 66V14" />
      <path d="M20 54c8 0 10-14 18-14s10 10 18 10 10-22 20-22" strokeDasharray="4 4" />
      <rect x="14" y="26" width="68" height="16" rx="3" strokeOpacity=".45" />
    </>
  ),
  people: (
    <>
      <circle cx="34" cy="32" r="9" />
      <path d="M18 64c2-10 9-15 16-15s14 5 16 15" />
      <circle cx="64" cy="34" r="7" strokeDasharray="3 3.5" />
      <path d="M54 62c1.5-7 5.5-11 10-11s8.5 4 10 11" strokeDasharray="3 3.5" />
    </>
  ),
  chat: (
    <>
      <path d="M16 20h46a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H34l-10 9v-9h-8a6 6 0 0 1-6-6V26a6 6 0 0 1 6-6Z" />
      <path d="M26 34h28M26 42h18" />
      <path d="M74 38h4a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6h-2v7l-8-7H58" strokeDasharray="3 3.5" />
    </>
  ),
  plug: (
    <>
      <path d="M30 40h12M54 40h12M42 30v20a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V30Z" />
      <path d="M46 30v-8M50 30v-8M18 40h-4M82 40h-4" strokeDasharray="2 3" />
    </>
  ),
};

export function EmptyState({ illustration = "chart", title, description, action, className, compact }: {
  illustration?: keyof typeof ILLUSTRATIONS;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12", className)}>
      <svg
        viewBox="0 0 96 80"
        width={compact ? 72 : 96}
        height={compact ? 60 : 80}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-faint"
        aria-hidden
      >
        {ILLUSTRATIONS[illustration]}
      </svg>
      <div className="max-w-[320px]">
        <p className="text-label font-semibold text-fg">{title}</p>
        {description && <p className="mt-1 text-small text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
