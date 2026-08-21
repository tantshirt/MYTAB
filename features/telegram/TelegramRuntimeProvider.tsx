"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type TelegramWebApp = {
  initData: string;
  initDataUnsafe: Record<string, unknown>;
  ready: () => void;
  expand: () => void;
  platform: string;
  version: string;
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

export function TelegramRuntimeProvider({
  children,
}: TelegramRuntimeProviderProps) {
  const [runtime, setRuntime] = useState<TelegramRuntimeContextValue>({
    isTelegramWebApp: false,
    initData: null,
    initDataUnsafe: null,
    platform: null,
    version: null,
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
    });
  }, []);

  const value = useMemo(() => runtime, [runtime]);

  return (
    <TelegramRuntimeContext.Provider value={value}>
      {children}
    </TelegramRuntimeContext.Provider>
  );
}
