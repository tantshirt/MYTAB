"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { MYTAB_COLORS, MYTAB_LAYOUT } from "@/lib/theme/tokens";
import { useSafeAreaInsets } from "@/features/telegram/useSafeAreaInsets";

type AppShellProps = {
  children: ReactNode;
  /** Hide bottom tab bar on deep-linked tab surfaces (Story 2.6 AC2). */
  hideTabBar?: boolean;
  /** Optional sticky footer action bar content. */
  footer?: ReactNode;
};

const TAB_ITEMS = [
  { href: "/", label: "Tabs" },
  { href: "/activity", label: "Activity" },
  { href: "/you", label: "You" },
] as const;

export function AppShell({ children, hideTabBar = false, footer }: AppShellProps) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: MYTAB_COLORS.paper,
        color: MYTAB_COLORS.ink,
        fontFamily: "var(--mytab-font-family)",
        paddingTop: insets.top,
        paddingBottom: hideTabBar ? insets.bottom : 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
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
            position: "sticky",
            bottom: hideTabBar ? insets.bottom : 56 + insets.bottom,
            background: MYTAB_COLORS.surface,
            borderTop: `1px solid ${MYTAB_COLORS.border}`,
            padding: `${MYTAB_LAYOUT.gutter} ${MYTAB_LAYOUT.gutter} calc(${MYTAB_LAYOUT.gutter} + ${insets.bottom}px)`,
            maxWidth: MYTAB_LAYOUT.maxColumnWidth,
            margin: "0 auto",
            width: "100%",
          }}
        >
          {footer}
        </footer>
      ) : null}

      {!hideTabBar ? (
        <nav
          aria-label="Main"
          style={{
            position: "sticky",
            bottom: 0,
            background: MYTAB_COLORS.surface,
            borderTop: `1px solid ${MYTAB_COLORS.border}`,
            paddingBottom: insets.bottom,
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
