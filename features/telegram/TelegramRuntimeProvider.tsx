"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { applyTelegramChrome, safeInvoke, versionAtLeast } from "./telegramChrome";

type TelegramBackButton = {
  show: () => void;
  hide: () => void;
  onClick: (handler: () => void) => void;
  offClick: (handler: () => void) => void;
};

type TelegramBottomButton = {
  show: () => void;
  hide: () => void;
};

type TelegramHapticFeedback = {
  impactOccurred: (style: "light" | "medium" | "heavy") => void;
  notificationOccurred: (type: "success" | "warning" | "error") => void;
};

export type TelegramInset = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe: Record<string, unknown>;
  ready: () => void;
  expand: () => void;
  platform: string;
  version: string;
  isExpanded?: boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  /** Device inset — notch and home indicator (Bot API 8.0). */
  safeAreaInset?: TelegramInset;
  /** Inset free of Telegram's own chrome; changes with expanded state (Bot API 8.0). */
  contentSafeAreaInset?: TelegramInset;
  themeParams?: Record<string, unknown>;
  colorScheme?: string;
  isVersionAtLeast?: (version: string) => boolean;
  /** Bot API 6.1 — key only until 6.9, then #RRGGBB. */
  setHeaderColor?: (color: string) => void;
  /** Bot API 6.1. */
  setBackgroundColor?: (color: string) => void;
  /** Bot API 7.10. */
  setBottomBarColor?: (color: string) => void;
  /** Bot API 7.7. */
  disableVerticalSwipes?: () => void;
  /** Bot API 7.7. */
  enableVerticalSwipes?: () => void;
  /** Bot API 6.2. */
  disableClosingConfirmation?: () => void;
  /** Bot API 6.2. */
  enableClosingConfirmation?: () => void;
  MainButton?: TelegramBottomButton;
  /** Bot API 7.10. */
  SecondaryButton?: TelegramBottomButton;
  BackButton?: TelegramBackButton;
  HapticFeedback?: TelegramHapticFeedback;
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export type TelegramRuntimeContextValue = {
  /** Whether the page is running inside a Telegram Mini App WebView. */
  isTelegramWebApp: boolean;
  /** Raw initData string for server verification — never trust initDataUnsafe alone (FR-A4). */
  initData: string | null;
  /** Display-only Telegram payload; never used for authorization. */
  initDataUnsafe: Record<string, unknown> | null;
  platform: string | null;
  version: string | null;
  /** Deep-link startapp token when present in launch params. */
  startParam: string | null;
  /** Bot API feature gate — false outside Telegram (POLISH-SPEC §2.1). */
  isVersionAtLeast: (version: string) => boolean;
};

const TelegramRuntimeContext = createContext<TelegramRuntimeContextValue | null>(
  null,
);

export function useTelegramRuntime(): TelegramRuntimeContextValue {
  const context = useContext(TelegramRuntimeContext);
  if (!context) {
    throw new Error("useTelegramRuntime must be used within TelegramRuntimeProvider");
  }
  return context;
}

type TelegramRuntimeProviderProps = {
  children: ReactNode;
};

function readStartParam(webApp: TelegramWebApp): string | null {
  const unsafe = webApp.initDataUnsafe as { start_param?: unknown };
  if (typeof unsafe.start_param === "string" && unsafe.start_param.length > 0) {
    return unsafe.start_param;
  }
  if (typeof window !== "undefined") {
    const fromQuery = new URLSearchParams(window.location.search).get("tgWebAppStartParam");
    if (fromQuery) {
      return fromQuery;
    }
  }
  return null;
}

/** How long to keep looking for the injected SDK before concluding we are not in Telegram. */
const SDK_POLL_TIMEOUT_MS = 3000;

export function TelegramRuntimeProvider({
  children,
}: TelegramRuntimeProviderProps) {
  const [runtime, setRuntime] = useState<Omit<TelegramRuntimeContextValue, "isVersionAtLeast">>({
    isTelegramWebApp: false,
    initData: null,
    initDataUnsafe: null,
    platform: null,
    version: null,
    startParam: null,
  });

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    let teardown: (() => void) | null = null;
    const startedAt = Date.now();

    const boot = (webApp: TelegramWebApp) => {
      // Colours first, then ready(): Telegram lifts its loading placeholder on
      // ready(), and we want the header already paper when it does (§2.6).
      applyTelegramChrome(webApp);
      safeInvoke("ready", () => webApp.ready());

      const reapply = () => applyTelegramChrome(webApp);
      webApp.onEvent?.("themeChanged", reapply);
      // Expanding/collapsing re-lays Telegram's own bars on some clients.
      webApp.onEvent?.("viewportChanged", reapply);

      teardown = () => {
        webApp.offEvent?.("themeChanged", reapply);
        webApp.offEvent?.("viewportChanged", reapply);
      };

      setRuntime({
        isTelegramWebApp: true,
        initData: webApp.initData || null,
        initDataUnsafe: webApp.initDataUnsafe ?? null,
        platform: webApp.platform ?? null,
        version: webApp.version ?? null,
        startParam: readStartParam(webApp),
      });
    };

    // The SDK is a blocking <script> in <head>, so it is normally present on the
    // first tick — but "normally" is not a property worth betting a demo on.
    const poll = () => {
      if (cancelled) {
        return;
      }
      const webApp = window.Telegram?.WebApp;
      if (webApp) {
        boot(webApp);
        return;
      }
      if (Date.now() - startedAt >= SDK_POLL_TIMEOUT_MS) {
        return;
      }
      rafId = window.requestAnimationFrame(poll);
    };

    poll();

    return () => {
      cancelled = true;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      teardown?.();
    };
  }, []);

  const isVersionAtLeast = useCallback(
    (version: string) => {
      if (typeof window === "undefined") {
        return false;
      }
      return versionAtLeast(window.Telegram?.WebApp, version);
    },
    // runtime.version is the signal that the SDK became available.
    [runtime.version],
  );

  const value = useMemo<TelegramRuntimeContextValue>(
    () => ({ ...runtime, isVersionAtLeast }),
    [runtime, isVersionAtLeast],
  );

  return (
    <TelegramRuntimeContext.Provider value={value}>
      {children}
    </TelegramRuntimeContext.Provider>
  );
}
