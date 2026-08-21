"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { BillAuthoringSurface } from "@/features/bills/BillAuthoringSurface";
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
      setSession(
        publicToken === "invalid"
          ? {
              status: "invalid",
              message: "This link is no longer valid.",
            }
          : FIXTURE_TAB,
      );
      return;
    }

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
      {!isTelegramWebApp ? (
        <div
          style={{
            maxWidth: 480,
            margin: "0 auto",
            padding: "8px 16px 0",
          }}
        >
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
            }}
          >
            ← Tabs
          </button>
        </div>
      ) : null}
      <BillAuthoringSurface
        tabId={session.tabId}
        tabTitle={session.tabName}
        viewerUserId={isConvexAuthFixtureMode() ? "users:andre" : undefined}
      />
    </AuthGate>
  );
}
