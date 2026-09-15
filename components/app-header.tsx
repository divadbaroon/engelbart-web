"use client";

import { useState } from "react";
import { Bell, LogIn, LogOut, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type AppHeaderProps = { project?: string; page?: string };

export function AppHeader({ project = "Engelbart", page }: AppHeaderProps) {
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Account" className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="size-8">
                <AvatarImage src="/avatar.png" alt="" />
                <AvatarFallback className="bg-zinc-700 text-white">
                  <svg viewBox="0 0 26 26" className="size-full" aria-hidden="true">
                    <clipPath id="avatar-clip"><circle cx="13" cy="13" r="13" /></clipPath>
                    <g fill="currentColor" clipPath="url(#avatar-clip)">
                      <circle cx="13" cy="10" r="4.4" />
                      <path d="M3.6 26.5a9.4 8.4 0 0 1 18.8 0z" />
                    </g>
                  </svg>
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-60 rounded-xl p-1.5">
            <DropdownMenuItem className="h-[38px] gap-3 rounded-lg px-2.5 text-sm font-medium">
              <LogIn className="size-4 text-muted-foreground" />
              Sign in
            </DropdownMenuItem>
            <DropdownMenuItem className="h-[38px] gap-3 rounded-lg px-2.5 text-sm font-medium">
              <LogOut className="size-4 text-muted-foreground" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
