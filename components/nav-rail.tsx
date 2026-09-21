"use client";

import { FileText, Github } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type SidebarMode = "github" | "papers";

const MODES: { key: SidebarMode; label: string; icon: typeof Github }[] = [
  { key: "github", label: "GitHub", icon: Github },
  { key: "papers", label: "Papers", icon: FileText },
];

type NavRailProps = { mode: SidebarMode; onSelect: (mode: SidebarMode) => void };

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          className={cn(
            "size-8 rounded-md text-muted-foreground hover:bg-[#ececec] hover:text-foreground",
            active && "bg-[#e6e6e6] text-foreground",
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function NavRail({ mode, onSelect }: NavRailProps) {
  return (
    <nav
      aria-label="Project navigation"
      className="flex w-12 shrink-0 flex-col items-center border-r bg-background py-3"
    >
      <div className="flex flex-col gap-1">
        {MODES.map(({ key, label, icon: Icon }) => (
          <RailButton key={key} label={label} active={mode === key} onClick={() => onSelect(key)}>
            <Icon className="size-4" />
          </RailButton>
        ))}
      </div>
    </nav>
  );
}
