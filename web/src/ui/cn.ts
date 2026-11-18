export const cn = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

export const inputClass =
  "h-9 w-full rounded-md border border-line bg-surface px-3 text-body text-fg shadow-xs outline-none transition-colors placeholder:text-faint hover:border-line-strong focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/25";
