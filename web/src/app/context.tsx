import { createContext, useContext } from "react";
import type { useLive } from "../lib/useLive";
import type { Room } from "../lib/types";
import type { useTheme } from "./theme";

export interface AppContextValue {
  room: string;
  setRoom: (room: string) => void;
  rooms: Room[] | undefined;
  live: ReturnType<typeof useLive>;
  theme: ReturnType<typeof useTheme>;
  openPalette: () => void;
}

export const AppContext = createContext<AppContextValue | null>(null);
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp outside AppContext");
  return value;
}
