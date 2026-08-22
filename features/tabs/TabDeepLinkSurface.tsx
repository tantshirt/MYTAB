"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { ClaimBoard, FIXTURE_CLAIM_BOARD, type ClaimBoardProps } from "@/features/claims";
import { SettleSheetHost, settleSearch } from "@/features/settlement/SettleSheetHost";
import { useTelegramBackButton } from "@/features/telegram/useTelegramBackButton";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { isConvexAuthFixtureMode } from "@/lib/privy/config";
import { isReceiptScanEnabled } from "@/lib/features/flags";
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

  /*
   * The locked footer action. The Payment Sheet is a sheet, not a route (§1.0),
   * so it is opened by adding `SettleSheetHost`'s `?settle=` key to this URL —
   * the host below is already mounted and picks it up.
   *
   * TODO(live-data): the key is the viewer's own obligation id from
   * `api.settlements.getObligationForViewer`, not the tab token.
   */
  const openSettleSheet = useCallback(() => {
    router.push(`/tabs/${publicToken}${settleSearch(publicToken)}`);
  }, [router, publicToken]);

  /*
   * The organizer override — Flow 4 step 2. Without a handler the who-has-this
   * sheet never renders its "Assign to" list at all, so this is what makes that
   * half of the sheet exist.
   *
   * TODO(live-data): `api.allocations.organizerAssignItem({ itemId, userId })`.
   */
  const assignItem = useCallback((itemId: string, userId: string) => {
    void itemId;
    void userId;
  }, []);

  /*
   * The organizer empty state's "Type an item". This adds an item to *this* tab,
   * which is not what `/tabs/new` does, so it stays a fixture-mode no-op rather
   * than routing somewhere plausible and wrong.
   *
   * TODO(live-data): `api.items.addItem({ tabId, name, unitPriceMinor })`.
   */
  const addManualItem = useCallback(() => {}, []);

  // "Scan a receipt" routes at the Receipt Review surface for this tab. Gated on
  // the flag as well as the handler: §4.2 shows the scan action only when receipt
  // scanning is on, and a visible button that does nothing is worse than none.
  const scanReceipt = useCallback(() => {
    router.push(`/tabs/${publicToken}/receipt`);
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
      <ClaimBoard
        {...board}
        onOpenBillReview={openBillReview}
        onSettleUp={openSettleSheet}
        onAssignItem={assignItem}
        onAddManual={addManualItem}
        onScanReceipt={isReceiptScanEnabled() ? scanReceipt : undefined}
      />
      <SettleSheetHost />
    </AppShell>
  );
}
