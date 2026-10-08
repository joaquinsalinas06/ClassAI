import * as RT from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { Kbd } from "./Kbd";

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RT.Provider delayDuration={350} skipDelayDuration={150}>{children}</RT.Provider>
);

export function Tooltip({ content, shortcut, children, side = "top" }: {
  content: ReactNode;
  shortcut?: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={6}
          className="z-[80] flex items-center gap-2 rounded-md bg-inverse px-2 py-1 text-caption text-fg-inverse shadow-md data-[state=delayed-open]:animate-[ds-tip_140ms_var(--ds-motion-easing-enter)]"
        >
          {content}
          {shortcut && <Kbd tone="inverse">{shortcut}</Kbd>}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}
