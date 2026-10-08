import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./cn";

export const Table = ({ className, ...rest }: HTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-x-auto">
    <table className={cn("w-full border-separate border-spacing-0 text-small", className)} {...rest} />
  </div>
);
export const Th = ({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    className={cn("sticky top-0 z-[1] h-9 border-b border-line bg-surface px-3 text-left text-caption font-medium whitespace-nowrap text-muted first:pl-4 last:pr-4", className)}
    {...rest}
  />
);
export const Td = ({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("h-11 border-b border-line-subtle px-3 whitespace-nowrap text-fg-2 first:pl-4 last:pr-4", className)} {...rest} />
);
