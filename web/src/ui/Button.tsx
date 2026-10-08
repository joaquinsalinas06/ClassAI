import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";
import { Tooltip } from "./Tooltip";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-100 ease-standard active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-on-ink shadow-xs hover:opacity-90",
  secondary: "border border-line bg-surface text-fg shadow-xs hover:border-line-strong hover:bg-hover",
  ghost: "text-fg-2 hover:bg-hover hover:text-fg",
  danger: "border border-alert-border bg-alert-subtle text-alert-text hover:border-alert",
};
const sizes: Record<Size, string> = {
  sm: "h-7 rounded-sm px-2.5 text-caption",
  md: "h-8 rounded-md px-3 text-label",
};

/** Button look for links (avoid nesting <button> in <a>). */
export const buttonClass = (variant: Variant = "secondary", size: Size = "md", className?: string) =>
  cn(base, variants[variant], sizes[size], className);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  trailing?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, trailing, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
      {trailing}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  shortcut?: string;
  variant?: Variant;
  size?: Size;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, variant = "ghost", size = "md", className, children, type = "button", ...rest },
  ref,
) {
  return (
    <Tooltip content={label} shortcut={shortcut}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cn(base, variants[variant], size === "sm" ? "size-7 rounded-sm" : "size-8 rounded-md", className)}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  );
});
