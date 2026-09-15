"use client";

import { useState, type ReactNode } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type AppHeaderProps = { project?: string; page?: string; account?: ReactNode };

export function AppHeader({ project = "Engelbart", page, account }: AppHeaderProps) {
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <header className="flex h-[68px] shrink-0 items-center justify-between border-b px-6">
      <Breadcrumb>
        <BreadcrumbList className="gap-2.5 text-[15px] sm:gap-2.5">
          <BreadcrumbItem>
            <BreadcrumbLink href="/workspace" title="All projects" className="text-base font-semibold text-foreground">
              {project}
            </BreadcrumbLink>
          </BreadcrumbItem>
          {page && (
            <>
              <BreadcrumbSeparator>/</BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage className="text-muted-foreground">{page}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-4">
        <Popover open={notifOpen} onOpenChange={setNotifOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="size-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="w-80 rounded-xl px-[18px] pt-4 pb-[18px]">
            <div className="mb-3.5 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">Notifications</h2>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setNotifOpen(false)} className="size-6 rounded-md">
                <X className="size-3" />
              </Button>
            </div>
            <p className="text-sm leading-relaxed">Completed builds will appear here.</p>
          </PopoverContent>
        </Popover>

        {account}
      </div>
    </header>
  );
}
