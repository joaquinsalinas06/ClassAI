import { useId } from "react";

/** The mark: a comfort ring, open at the bottom like the gauge, drawn in the "air" gradient. */
export function LogoMark({ size = 24 }: { size?: number }) {
  const id = `logo${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--ds-brand-air-from)" />
          <stop offset="1" stopColor="var(--ds-brand-air-to)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="var(--ds-brand-ink)" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="var(--ds-brand-on-ink)" strokeOpacity="0.16" strokeWidth="3.2" />
      <path d="M8.6 20.3A8.5 8.5 0 1 1 23.4 20.3" fill="none" stroke={`url(#${id})`} strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
