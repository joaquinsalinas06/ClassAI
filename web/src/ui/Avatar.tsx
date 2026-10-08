import { initials } from "../lib/format";
import { cn } from "./cn";

// Eight hues spaced around OKLCH; each avatar is a two-step gradient within its hue family.
const HUES = [250, 200, 160, 120, 75, 30, 340, 290];
const hashCode = (text: string) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

export function avatarGradient(seed: string) {
  const hue = HUES[hashCode(seed) % HUES.length]!;
  return `linear-gradient(140deg, oklch(0.66 0.11 ${hue}) 0%, oklch(0.5 0.13 ${hue + 24}) 100%)`;
}

export function Avatar({ name, seed, size = 32, className }: { name: string; seed?: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]", className)}
      style={{ width: size, height: size, background: avatarGradient(seed ?? name), fontSize: Math.round(size * 0.36), letterSpacing: "0.01em" }}
    >
      {initials(name)}
    </span>
  );
}
