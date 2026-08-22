"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ActivityFilledIcon,
  ActivityIcon,
  TabsFilledIcon,
  TabsIcon,
  YouFilledIcon,
  YouIcon,
  type IconProps,
} from "@/components/icons";
import { MYTAB_COLORS, MYTAB_LAYOUT, MYTAB_SPACING } from "@/lib/theme/tokens";
import { useBottomBarColor } from "@/features/telegram/useBottomBarColor";
import { useHiddenTelegramBackButton } from "@/features/telegram/useBackAffordance";
import type { BottomBarSurface } from "@/features/telegram/telegramChrome";

/**
 * The Mini App shell (POLISH-SPEC §2.9, §2.10).
 *
 * Two pieces, deliberately split:
 *
 * - `AppShellRoot` is mounted **once**, by `app/(miniapp)/layout.tsx`. It owns
 *   the shell box, the tab bar and per-tab scroll restoration. Because it lives
 *   in the layout it survives every navigation, so the `<nav>` element is the
 *   same DOM node before and after a tab switch — it cannot unmount, remount or
 *   shift by a pixel. That is the whole point of §2.9.1.
 * - `AppShell` is what a surface renders. It no longer draws chrome of its own;
 *   it contributes the centred content column plus an optional sticky footer,
 *   and registers what the root needs to know (tab bar hidden? footer present?).
 *
 * The split is what lets surfaces keep their existing `<AppShell …>` call sites
 * unchanged while the chrome stops remounting underneath them.
 */

type ShellRegistration = {
  hideTabBar: boolean;
  hasFooter: boolean;
};

type ShellContextValue = {
  register: (registration: ShellRegistration) => () => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

/** `useLayoutEffect` that does not warn during server rendering. */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const TAB_ITEMS = [
  { href: "/", label: "Tabs", Icon: TabsIcon, ActiveIcon: TabsFilledIcon },
  {
    href: "/activity",
    label: "Activity",
    Icon: ActivityIcon,
    ActiveIcon: ActivityFilledIcon,
  },
  { href: "/you", label: "You", Icon: YouIcon, ActiveIcon: YouFilledIcon },
] as const satisfies ReadonlyArray<{
  href: string;
  label: string;
  Icon: (props: IconProps) => ReactNode;
  ActiveIcon: (props: IconProps) => ReactNode;
}>;

const TAB_ROOTS: ReadonlySet<string> = new Set(TAB_ITEMS.map((item) => item.href));

/**
 * Fallback until the nav has been measured. The nav is 22px icon + 4px gap +
 * an 11px label inside a 44px minimum target with 10px of padding either side,
 * so ~65px before the safe-area inset. The old hardcoded 56 was never
 * re-measured and floated the sticky footer above the bar (§2.10 item 4).
 */
const TAB_BAR_FALLBACK_HEIGHT = 65;

/**
 * `usePathname()` returns `null` outside an App Router tree — in tests, and in
 * any renderer that has no router context. Every read goes through this.
 */
function useSafePathname(): string {
  const pathname = usePathname();
  return typeof pathname === "string" && pathname.length > 0 ? pathname : "/";
}

function isTabActive(href: string, pathname: string): boolean {
  if (href === "/") {
    // A group is a child of Tabs in the information architecture, so `/groups/*`
    // keeps the Tabs item lit (§1.0).
    return pathname === "/" || pathname.startsWith("/groups");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Per-tab scroll restoration (§2.9.2). Returning to Tabs from Activity lands
 * where you left it rather than at the top.
 *
 * Only the three tab roots are remembered. Every other route keeps Next's own
 * scroll behaviour, which is correct for a push into a deeper surface.
 */
function useTabScrollRestoration(pathname: string): void {
  const positions = useRef<Map<string, number>>(new Map());
  const currentPath = useRef(pathname);

  useEffect(() => {
    const onScroll = () => {
      if (TAB_ROOTS.has(currentPath.current)) {
        positions.current.set(currentPath.current, window.scrollY);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useIsomorphicLayoutEffect(() => {
    const previous = currentPath.current;
    currentPath.current = pathname;
    if (previous === pathname) {
      return;
    }
    if (!TAB_ROOTS.has(pathname)) {
      return;
    }
    // The tab links pass `scroll={false}`, so Next has not touched the scroll
    // position and this is the only thing that moves it.
    window.scrollTo(0, positions.current.get(pathname) ?? 0);
  }, [pathname]);
}

/**
 * Measures the nav instead of assuming its height — it changes with icon size,
 * label size and the bottom safe-area inset (§2.10 item 4).
 */
function useMeasuredHeight(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
): number {
  const [height, setHeight] = useState(TAB_BAR_FALLBACK_HEIGHT);

  useEffect(() => {
    if (!enabled) {
      // Deliberately keep the last measurement rather than zeroing it: the
      // getter below already reports 0 while disabled, and keeping the value
      // means re-enabling does not offset the sticky footer by 0 for a frame.
      return;
    }
    const node = ref.current;
    if (!node) {
      return;
    }

    const measure = () => {
      const next = Math.round(node.getBoundingClientRect().height);
      if (next > 0) {
        setHeight((previous) => (previous === next ? previous : next));
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
  }, [ref, enabled]);

  return enabled ? height : 0;
}

function TabBarItem({
  item,
  active,
}: {
  item: (typeof TAB_ITEMS)[number];
  active: boolean;
}) {
  const Glyph = active ? item.ActiveIcon : item.Icon;
  return (
    <Link
      href={item.href}
      // Next's own scroll reset would defeat per-tab restoration (§2.9.2).
      scroll={false}
      aria-current={active ? "page" : undefined}
      style={{
        flex: 1,
        // Full-height target across a third of the width, never under 44px.
        minHeight: "44px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: MYTAB_SPACING["1"],
        // Active is a colour change only: no indicator bar, no scale, no
        // bounce (§2.9.4).
        color: active ? MYTAB_COLORS.primary : MYTAB_COLORS.inkMuted,
        textDecoration: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <Glyph size={22} />
      <span
        style={{
          fontSize: "11px",
          lineHeight: 1.2,
          fontWeight: active ? 600 : 500,
          letterSpacing: "-0.002em",
        }}
      >
        {item.label}
      </span>
    </Link>
  );
}

/**
 * Mounted once, by `app/(miniapp)/layout.tsx`.
 *
 * There is no transition between the three tab surfaces and there must not be
 * one: they are peers, and a slide would assert a hierarchy that does not exist
 * (§2.9). The swap is instant because nothing here re-mounts.
 */
export function AppShellRoot({ children }: { children: ReactNode }) {
  const pathname = useSafePathname();
  const navRef = useRef<HTMLElement | null>(null);
  const registry = useRef<Map<number, ShellRegistration>>(new Map());
  const nextId = useRef(0);
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const register = useCallback((registration: ShellRegistration) => {
    const id = nextId.current++;
    registry.current.set(id, registration);
    bump();
    return () => {
      registry.current.delete(id);
      bump();
    };
  }, []);

  const contextValue = useMemo<ShellContextValue>(() => ({ register }), [register]);

  // Registration happens in a layout effect, so a navigation that swaps one
  // registered surface for another nets out inside a single commit: the nav is
  // never removed from the DOM in between.
  const registrations = Array.from(registry.current.values());
  const showTabBar =
    registrations.length > 0 && !registrations.some((entry) => entry.hideTabBar);
  const hasFooter = registrations.some((entry) => entry.hasFooter);

  const tabBarHeight = useMeasuredHeight(navRef, showTabBar);

  useTabScrollRestoration(pathname);

  // A stale BackButton from a previous surface must never survive onto a tab
  // root (§2.4).
  useHiddenTelegramBackButton(TAB_ROOTS.has(pathname));

  const shellStyle: CSSProperties & Record<"--tab-bar-height", string> = {
    // Telegram's stable viewport height, never 100vh: on Android Telegram
    // 100vh overshoots by the address-bar equivalent (§2.7).
    minHeight: "var(--app-height, 100dvh)",
    background: MYTAB_COLORS.paper,
    color: MYTAB_COLORS.ink,
    fontFamily: "var(--mytab-font-family)",
    // Content-safe area: below Telegram's own header, not just the device notch.
    paddingTop: "var(--app-pad-top, 0px)",
    paddingBottom: showTabBar || hasFooter ? 0 : "var(--app-pad-bottom, 0px)",
    paddingLeft: "var(--app-pad-left, 0px)",
    paddingRight: "var(--app-pad-right, 0px)",
    display: "flex",
    flexDirection: "column",
    "--tab-bar-height": `${tabBarHeight}px`,
  };

  return (
    <ShellContext.Provider value={contextValue}>
      <div style={shellStyle}>
        {children}

        {showTabBar ? (
          <nav
            ref={navRef}
            aria-label="Main"
            style={{
              position: "sticky",
              bottom: 0,
              background: MYTAB_COLORS.surface,
              borderTop: `1px solid ${MYTAB_COLORS.border}`,
              padding: "10px 0 calc(10px + var(--app-pad-bottom, 0px))",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "stretch",
                width: "100%",
                maxWidth: MYTAB_LAYOUT.maxColumnWidth,
                margin: "0 auto",
              }}
            >
              {TAB_ITEMS.map((item) => (
                <TabBarItem
                  key={item.href}
                  item={item}
                  active={isTabActive(item.href, pathname)}
                />
              ))}
            </div>
          </nav>
        ) : null}
      </div>
    </ShellContext.Provider>
  );
}

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
  /**
   * Drop the column's 16px gutters — for the one edge-to-edge surface, Payment
   * Progress (§1.9). The centred column cap stays; only the padding goes.
   */
  fullBleed?: boolean;
};

/**
 * What a surface renders. Contributes the content column and the sticky footer;
 * the shell box and the tab bar belong to `AppShellRoot`.
 *
 * Renders standalone too (no root in the tree) so component tests and any
 * non-`(miniapp)` mount keep working — they simply get no tab bar.
 */
export function AppShell({
  children,
  hideTabBar = false,
  footer,
  bottomBar,
  fullBleed = false,
}: AppShellProps) {
  const shell = useContext(ShellContext);
  const showTabBar = !hideTabBar;
  const hasFooter = Boolean(footer);

  useBottomBarColor(bottomBar ?? (showTabBar || hasFooter ? "surface" : "paper"));

  const register = shell?.register;
  useIsomorphicLayoutEffect(() => {
    if (!register) {
      return;
    }
    return register({ hideTabBar, hasFooter });
  }, [register, hideTabBar, hasFooter]);

  return (
    <>
      <div
        style={{
          flex: 1,
          width: "100%",
          maxWidth: MYTAB_LAYOUT.maxColumnWidth,
          margin: "0 auto",
          paddingLeft: fullBleed ? undefined : MYTAB_LAYOUT.gutter,
          paddingRight: fullBleed ? undefined : MYTAB_LAYOUT.gutter,
          overflowX: "hidden",
          display: fullBleed ? "flex" : undefined,
          flexDirection: fullBleed ? "column" : undefined,
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
    </>
  );
}
