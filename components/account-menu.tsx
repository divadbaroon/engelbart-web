"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AccountMenuProps = { email: string | null; avatarUrl?: string | null };

// The account control in the header. `email` is who the server says is
// signed in; null means nobody is, and the menu offers Sign in instead.
export function AccountMenu({ email, avatarUrl }: AccountMenuProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    await createClient().auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  const itemClass = "h-[38px] gap-3 rounded-lg px-2.5 text-sm font-medium";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={email ? `Account, signed in as ${email}` : "Account"}
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AccountAvatar avatarUrl={avatarUrl} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60 rounded-xl p-1.5">
        {email ? (
          <>
            <DropdownMenuLabel className="px-2.5 py-2 text-xs font-normal text-muted-foreground">
              Signed in as
              <span className="block truncate font-medium text-foreground">{email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut} disabled={busy} className={itemClass}>
              <LogOut className="size-4 text-muted-foreground" />
              {busy ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem asChild className={itemClass}>
            <Link href="/auth/login">
              <LogIn className="size-4 text-muted-foreground" />
              Sign in
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The avatar alone: the account's picture when it has one, else the
// silhouette the goal page uses. Also the Suspense fallback while the
// server is still finding out who is signed in.
export function AccountAvatar({ avatarUrl }: { avatarUrl?: string | null }) {
  return (
    <Avatar className="size-8">
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
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
  );
}
