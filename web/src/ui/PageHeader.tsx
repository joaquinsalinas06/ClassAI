import type { ReactNode } from "react";
import { cn } from "./cn";

export function PageHeader({ title, description, meta, actions, className }: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-title wrap-anywhere text-fg">{title}</h1>
        {description && <p className="mt-1.5 max-w-[68ch] text-body text-muted">{description}</p>}
        {meta && <div className="mt-2.5 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
