"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { ClaimBoard, FIXTURE_CLAIM_BOARD, type ClaimBoardProps } from "@/features/claims";
import { SettleSheetHost } from "@/features/settlement/SettleSheetHost";
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

/**
 * Single prop-resolution point for the deep-linked Claim Board.
 *
 * TODO(live-data): replace the fixture spread with
 * `useQuery(api.claims.getClaimBoard, { publicToken })` and drop the
 * `FIXTURE_CLAIM_BOARD` import. The surface below never learns the difference.
 */
function useClaimBoardData(publicToken: string, tabName: string): ClaimBoardProps {
  return useMemo(
    () => ({ ...FIXTURE_CLAIM_BOARD, tabName }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [publicToken, tabName],
  );
}

/**
 * The `[Open tab]` button in the group message always lands here, and this
 * surface is the Claim Board for that specific tab — never the authoring
 * screen, which lives at `/tabs/new` (EXPERIENCE, Information Architecture;
 * POLISH-SPEC §1.0, §1.6).
 */
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
      <DeepLinkedClaimBoard
        publicToken={publicToken}
        tabName={session.tabName}
        showInAppBack={!isTelegramWebApp}
        onBack={handleBack}
      />
    </AuthGate>
  );
}

function DeepLinkedClaimBoard({
  publicToken,
  tabName,
  showInAppBack,
  onBack,
}: {
  publicToken: string;
  tabName: string;
  showInAppBack: boolean;
  onBack: () => void;
}) {
  const router = useRouter();
  const board = useClaimBoardData(publicToken, tabName);

  const openBillReview = useCallback(() => {
    router.push(`/tabs/${publicToken}/bill`);
  }, [router, publicToken]);

  return (
    // A deep-linked Claim Board hides the tab bar entirely. The only exit is
    // the back control, which lands on Tabs (EXPERIENCE, Information Architecture).
    <AppShell hideTabBar>
      {showInAppBack ? (
        <div style={{ padding: "8px 0 0" }}>
          <button
            type="button"
            onClick={onBack}
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
      <ClaimBoard {...board} onOpenBillReview={openBillReview} />
      <SettleSheetHost />
    </AppShell>
  );
}
