// Motion presets from design/tokens.json so web and Android move the same way.
import tokens from "../../../design/tokens.json";

const ease = tokens.motion.easing;
export const EASE = {
  standard: ease.standard.$value as [number, number, number, number],
  enter: ease.enter.$value as [number, number, number, number],
  exit: ease.exit.$value as [number, number, number, number],
  emphasized: ease.emphasized.$value as [number, number, number, number],
};
const ms = (v: string) => parseInt(v, 10) / 1000;
const d = tokens.motion.duration;
export const DURATION = {
  instant: ms(d.instant.$value), fast: ms(d.fast.$value), base: ms(d.base.$value),
  slow: ms(d.slow.$value), chart: ms(d.chart.$value), update: ms(d.update.$value),
};
const s = tokens.motion.spring;
export const SPRING = {
  snappy: { type: "spring" as const, ...s.snappy.$value },
  gentle: { type: "spring" as const, ...s.gentle.$value },
  gauge: { type: "spring" as const, ...s.gauge.$value },
};
export const ICON_STROKE = tokens.icon.stroke.$value;
