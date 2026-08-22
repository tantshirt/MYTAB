"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MYTAB_COLORS, MYTAB_LAYOUT } from "@/lib/theme/tokens";
import { useBottomBarColor } from "@/features/telegram/useBottomBarColor";
import type { BottomBarSurface } from "@/features/telegram/telegramChrome";

type AppShellProps = {
  children: ReactNode;
  /** Hide bottom tab bar on deep-linked tab surfaces (Story 2.6 AC2). */
  hideTabBar?: boolean;
  /** Optional sticky footer action bar content. */
  footer?: ReactNode;
  /**
   * Telegram bottom-bar colour override (POLISH-SPEC §2.1). Defaults to
   * `"surface"` when the shell's bottom-most element is a tab bar or a sticky
   * footer, and `"paper"` on the surfaces that end in canvas.
   */
  bottomBar?: BottomBarSurface;
};

const TAB_ITEMS = [
  { href: "/", label: "Tabs" },
  { href: "/activity", label: "Activity" },
  { href: "/you", label: "You" },
] as const;

/**
 * Fallback until the nav has been measured, and the value in
 * `MYTAB_VIEWPORT_CSS`. The previous hardcoded 56 was never re-measured, so the
 * sticky footer floated ~15px above a nav that is actually ~41px tall.
 */
const TAB_BAR_FALLBACK_HEIGHT = 56;

export function AppShell({
  children,
  hideTabBar = false,
  footer,
  bottomBar,
}: AppShellProps) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement | null>(null);
  const [tabBarHeight, setTabBarHeight] = useState(TAB_BAR_FALLBACK_HEIGHT);

  const showTabBar = !hideTabBar;

  useBottomBarColor(bottomBar ?? (showTabBar || footer ? "surface" : "paper"));

  // Measure the nav rather than assuming its height — it changes with icon
  // size, label size and the bottom safe-area inset.
  useEffect(() => {
    const node = navRef.current;
    if (!node) {
      setTabBarHeight(0);
      return;
    }

    const measure = () => {
      const height = Math.round(node.getBoundingClientRect().height);
      if (height > 0) {
        setTabBarHeight((previous) => (previous === height ? previous : height));
      }
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [showTabBar]);

  const shellStyle: CSSProperties & Record<"--tab-bar-height", string> = {
    // Telegram's stable viewport height, never 100vh: on Android Telegram
    // 100vh overshoots by the address-bar equivalent (§2.7).
    minHeight: "var(--app-height, 100dvh)",
    background: MYTAB_COLORS.paper,
    color: MYTAB_COLORS.ink,
    fontFamily: "var(--mytab-font-family)",
    // Content-safe area: below Telegram's own header, not just the device notch.
    paddingTop: "var(--app-pad-top, 0px)",
    paddingBottom: showTabBar || footer ? 0 : "var(--app-pad-bottom, 0px)",
    paddingLeft: "var(--app-pad-left, 0px)",
    paddingRight: "var(--app-pad-right, 0px)",
    display: "flex",
    flexDirection: "column",
    "--tab-bar-height": `${showTabBar ? tabBarHeight : 0}px`,
  };

  return (
    <div style={shellStyle}>
      <div
        style={{
          flex: 1,
          width: "100%",
          maxWidth: MYTAB_LAYOUT.maxColumnWidth,
          margin: "0 auto",
          paddingLeft: MYTAB_LAYOUT.gutter,
          paddingRight: MYTAB_LAYOUT.gutter,
          overflowX: "hidden",
        }}
      >
        {children}
      </div>

      {footer ? (
        <footer
          style={{
            // Sticky, never fixed: on Android Telegram resizes the viewport when
            // the keyboard opens and a fixed footer detaches over it (§2.5).
            position: "sticky",
            bottom: showTabBar ? "var(--tab-bar-height, 0px)" : 0,
            background: MYTAB_COLORS.surface,
            borderTop: `1px solid ${MYTAB_COLORS.border}`,
            padding: showTabBar
              ? `${MYTAB_LAYOUT.gutter} ${MYTAB_LAYOUT.gutter}`
              : `${MYTAB_LAYOUT.gutter} ${MYTAB_LAYOUT.gutter} calc(${MYTAB_LAYOUT.gutter} + var(--app-pad-bottom, 0px))`,
            maxWidth: MYTAB_LAYOUT.maxColumnWidth,
            margin: "0 auto",
            width: "100%",
          }}
        >
          {footer}
        </footer>
      ) : null}

      {showTabBar ? (
        <nav
          ref={navRef}
          aria-label="Main"
          style={{
            position: "sticky",
            bottom: 0,
            background: MYTAB_COLORS.surface,
            borderTop: `1px solid ${MYTAB_COLORS.border}`,
            paddingBottom: "var(--app-pad-bottom, 0px)",
          }}
        >
          <div
            style={{
              display: "flex",
              maxWidth: MYTAB_LAYOUT.maxColumnWidth,
              margin: "0 auto",
            }}
          >
            {TAB_ITEMS.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/" || pathname.startsWith("/groups")
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "12px 8px",
                    fontSize: "13px",
                    fontWeight: active ? 600 : 500,
                    color: active ? MYTAB_COLORS.primary : MYTAB_COLORS.inkMuted,
                    textDecoration: "none",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
