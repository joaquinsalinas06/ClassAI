import { useCallback, useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";
const KEY = "classai.theme";

const read = (): ThemePref => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
};

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read);
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (pref === "system") delete root.dataset.theme;
    else root.dataset.theme = pref;
    try {
      if (pref === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, pref);
    } catch {
      // storage unavailable (private mode): the choice lasts for this tab only
    }
  }, [pref]);

  const resolved: "light" | "dark" = pref === "system" ? (systemDark ? "dark" : "light") : pref;
  const toggle = useCallback(() => setPref(resolved === "dark" ? "light" : "dark"), [resolved]);
  return { pref, resolved, setPref, toggle };
}
