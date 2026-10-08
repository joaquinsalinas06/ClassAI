import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/** Panel: the one container. Hairline border, radius lg, almost no shadow — hierarchy comes from type and space. */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("rounded-lg border border-line bg-surface shadow-xs", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, icon, actions, className }: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex min-h-12 items-center gap-3 px-4 pt-3.5 pb-2", className)}>
      {icon && <span className="text-muted">{icon}</span>}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-label font-semibold text-fg">{title}</h2>
        {description && <p className="truncate text-caption text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}
