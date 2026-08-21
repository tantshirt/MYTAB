"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type TelegramBackButton = {
  show: () => void;
  hide: () => void;
  onClick: (handler: () => void) => void;
  offClick: (handler: () => void) => void;
};

type TelegramHapticFeedback = {
  impactOccurred: (style: "light" | "medium" | "heavy") => void;
  notificationOccurred: (type: "success" | "warning" | "error") => void;
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
  safeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
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

export function TelegramRuntimeProvider({
  children,
}: TelegramRuntimeProviderProps) {
  const [runtime, setRuntime] = useState<TelegramRuntimeContextValue>({
    isTelegramWebApp: false,
    initData: null,
    initDataUnsafe: null,
    platform: null,
    version: null,
    startParam: null,
  });

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) {
      return;
    }

    webApp.ready();
    webApp.expand();

    setRuntime({
      isTelegramWebApp: true,
      initData: webApp.initData || null,
      initDataUnsafe: webApp.initDataUnsafe ?? null,
      platform: webApp.platform ?? null,
      version: webApp.version ?? null,
      startParam: readStartParam(webApp),
    });
  }, []);

  const value = useMemo(() => runtime, [runtime]);

  return (
    <TelegramRuntimeContext.Provider value={value}>
      {children}
    </TelegramRuntimeContext.Provider>
  );
}
