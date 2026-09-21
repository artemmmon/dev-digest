/* ShellFrame.tsx — mounts the app shell once, in the root layout, around every page
   except the full-screen ones. Keeping it in the layout (not inside each page) means
   the sidebar, command palette and their state are not torn down on every navigation. */
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "./AppShell";
import { CrumbProvider, useCrumb } from "./crumb";

/** Routes that draw their own full-screen UI, without the sidebar and top bar. */
const BARE_ROUTES = ["/onboarding"];

function Shell({ children }: { children: React.ReactNode }) {
  const crumb = useCrumb();
  return <AppShell crumb={crumb}>{children}</AppShell>;
}

export function ShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  return <CrumbProvider>{bare ? children : <Shell>{children}</Shell>}</CrumbProvider>;
}
