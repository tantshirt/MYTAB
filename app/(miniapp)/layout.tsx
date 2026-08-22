import type { ReactNode } from "react";
import { AppShellRoot } from "@/components/layout/AppShell";

/**
 * The Mini App shell, mounted once (POLISH-SPEC §2.9.1).
 *
 * Every surface under `(miniapp)` used to mount its own `AppShell`, so the tab
 * bar was part of the page and was destroyed and rebuilt on every switch —
 * which is exactly what made a tab switch feel like a page load. Hoisting the
 * shell into the layout means the `<nav>` is the same DOM node before and after
 * a navigation: no unmount, no remount, no pixel shift, and no transition.
 */
export default function MiniAppLayout({ children }: { children: ReactNode }) {
  return <AppShellRoot>{children}</AppShellRoot>;
}
