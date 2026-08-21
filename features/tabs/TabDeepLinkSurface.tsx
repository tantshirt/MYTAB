"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { useTelegramBackButton } from "@/features/telegram/useTelegramBackButton";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { isConvexAuthFixtureMode } from "@/lib/privy/config";
import { MYTAB_COLORS } from "@/lib/theme/tokens";
import { AppShell } from "@/components/layout/AppShell";

type TabDeepLinkSurfaceProps = {
  publicToken: string;
};

type TabSessionState =
  | { status: "loading" }
  | { status: "ready"; tabName: string; tabId: string }
  | { status: "invalid"; message: string };

const FIXTURE_TAB: TabSessionState = {
  status: "ready",
  tabName: "Sukhumvit Dinner",
  tabId: "tabs:fixture",
};

export function TabDeepLinkSurface({ publicToken }: TabDeepLinkSurfaceProps) {
  const router = useRouter();
  const { isTelegramWebApp } = useTelegramRuntime();
  const [session, setSession] = useState<TabSessionState>({ status: "loading" });

  const handleBack = useCallback(() => {
    router.push("/");
  }, [router]);

  useTelegramBackButton(handleBack, true);

  useEffect(() => {
    if (isConvexAuthFixtureMode()) {
      setSession(publicToken === "invalid" ? {
        status: "invalid",
        message: "This link is no longer valid.",
      } : FIXTURE_TAB);
      return;
    }

    // Live Convex resolution lands in Story integration — stub invalid tokens locally.
    if (!publicToken || publicToken.length < 8) {
      setSession({
        status: "invalid",
        message: "This link is no longer valid.",
      });
      return;
    }

    setSession({
      status: "ready",
      tabName: "Group tab",
      tabId: publicToken.slice(0, 8),
    });
  }, [publicToken]);

  if (session.status === "loading") {
    return (
      <AuthGate>
        <AppShell hideTabBar>
          <p className="mytab-type-meta" style={{ marginTop: "24px" }}>
            Opening tab…
          </p>
        </AppShell>
      </AuthGate>
    );
  }

  if (session.status === "invalid") {
    return (
      <AuthGate>
        <AppShell>
          <p className="mytab-type-body" style={{ marginTop: "24px", color: MYTAB_COLORS.inkMuted }}>
            {session.message}
          </p>
        </AppShell>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <AppShell hideTabBar>
        <header style={{ paddingTop: "8px", paddingBottom: "16px" }}>
          {!isTelegramWebApp ? (
            <button
              type="button"
              onClick={handleBack}
              style={{
                background: "none",
                border: "none",
                color: MYTAB_COLORS.primary,
                fontSize: "15px",
                fontWeight: 500,
                padding: 0,
                cursor: "pointer",
                marginBottom: "12px",
              }}
            >
              ← Tabs
            </button>
          ) : null}
          <h1 className="mytab-type-title" style={{ margin: 0 }}>
            {session.tabName}
          </h1>
          <p className="mytab-type-meta" style={{ marginTop: "8px" }}>
            Scoped session · tab bar hidden
          </p>
        </header>

        <section className="mytab-card" style={{ padding: "20px" }}>
          <p className="mytab-type-micro-label">Total</p>
          <p className="mytab-type-amount-md mytab-tabular" data-mytab-amount style={{ margin: "8px 0 0" }}>
            ฿1,840.00
          </p>
          <p className="mytab-type-meta" style={{ marginTop: "12px" }}>
            Fixture mode — Sukhumvit Dinner, five people.
          </p>
        </section>
      </AppShell>
    </AuthGate>
  );
}
