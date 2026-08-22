"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { ClaimBoard, FIXTURE_CLAIM_BOARD, type ClaimBoardProps } from "@/features/claims";
import { SettleSheetHost, settleSearch } from "@/features/settlement/SettleSheetHost";
import { useTelegramBackButton } from "@/features/telegram/useTelegramBackButton";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import {
  STALE_NOTICE,
  useLiveMutation,
  useLiveQuery,
} from "@/features/convex/useConvexData";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { isReceiptScanEnabled } from "@/lib/features/flags";
import { MYTAB_COLORS } from "@/lib/theme/tokens";
import { AppShell } from "@/components/layout/AppShell";
import { INVALID_LINK_MESSAGE, useResolvedTab } from "./useTabData";

type TabDeepLinkSurfaceProps = {
  publicToken: string;
};

type ClaimBoardData = {
  status: "loading" | "ready" | "error";
  board: ClaimBoardProps;
};

/** `getClaimBoard` returns participants and the organizer's Telegram id, not a name. */
function organizerNameFor(view: {
  participants: Array<{ telegramUserId: string; displayName: string }>;
  tab: { organizerTelegramUserId: string };
}): string {
  return (
    view.participants.find(
      (participant) => participant.telegramUserId === view.tab.organizerTelegramUserId,
    )?.displayName ?? "Organizer"
  );
}

/**
 * Single prop-resolution point for the deep-linked Claim Board.
 *
 * Live read: `api.allocations.getClaimBoard({ tabId })` — one reactive
 * subscription, so someone else's claim arrives in place and the board corrects
 * itself after a stale write with no reload (EXPERIENCE, *Concurrency and
 * Revision*).
 */
function useClaimBoardData(
  tabId: string | null,
  tabName: string | null,
): ClaimBoardData {
  const result = useLiveQuery(
    api.allocations.getClaimBoard,
    tabId ? { tabId: tabId as Id<"tabs"> } : "skip",
  );

  const board = useMemo<ClaimBoardProps | null>(() => {
    const view = result.data;
    if (!view) {
      return null;
    }

    return {
      tabName: view.tab.name,
      revision: view.tab.revision,
      isLocked: view.isLocked,
      isOrganizer: view.isOrganizer,
      viewerUserId: view.viewerUserId,
      organizerDisplayName: organizerNameFor(view),
      participants: view.participants.map((participant) => ({
        userId: participant.userId,
        displayName: participant.displayName,
        avatarUrl: participant.avatarUrl,
      })),
      items: view.items.map((item) => ({
        id: item._id,
        name: item.name,
        lineTotalMinor: item.lineTotalMinor,
        claimantIds: item.claimantIds,
        viewerOwns: item.viewerOwns,
        unassigned: item.unassigned,
      })),
      unassignedCount: view.unassignedCount,
      viewerSubtotalMinor: view.viewerSubtotalMinor,
      viewerHasClaims: view.viewerHasClaims,
    };
  }, [result.data]);

  if (result.fixture) {
    return {
      status: "ready",
      board: { ...FIXTURE_CLAIM_BOARD, tabName: tabName ?? FIXTURE_CLAIM_BOARD.tabName },
    };
  }

  if (result.error) {
    return { status: "error", board: FIXTURE_CLAIM_BOARD };
  }

  if (!board) {
    // First paint: the board renders its own empty geometry rather than a
    // spinner over nothing (EXPERIENCE, *State Patterns*).
    return {
      status: "loading",
      board: {
        tabName: tabName ?? "",
        revision: 0,
        isLocked: false,
        isOrganizer: false,
        viewerUserId: "",
        organizerDisplayName: "Organizer",
        participants: [],
        items: [],
        unassignedCount: 0,
        viewerSubtotalMinor: 0,
        viewerHasClaims: false,
      },
    };
  }

  return { status: "ready", board };
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
  const session = useResolvedTab(publicToken);

  const handleBack = useCallback(() => {
    router.push("/");
  }, [router]);

  useTelegramBackButton(handleBack, true);

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
        tabId={session.tabId}
        tabName={session.tabName}
        showInAppBack={!isTelegramWebApp}
        onBack={handleBack}
      />
    </AuthGate>
  );
}

function DeepLinkedClaimBoard({
  publicToken,
  tabId,
  tabName,
  showInAppBack,
  onBack,
}: {
  publicToken: string;
  tabId: string;
  tabName: string | null;
  showInAppBack: boolean;
  onBack: () => void;
}) {
  const router = useRouter();
  const { isTelegramWebApp } = useTelegramRuntime();
  const { status, board } = useClaimBoardData(tabId, tabName);

  /*
   * §4.5 — outside Telegram reads work and every mutation is disabled. The
   * handlers below are `undefined` rather than no-ops in that case, so the
   * affordances are absent rather than present and dead.
   */
  const canWrite = isTelegramWebApp;
  const toggleOwnClaim = useLiveMutation(api.allocations.toggleOwnClaim);
  const organizerAssignItem = useLiveMutation(api.allocations.organizerAssignItem);

  /*
   * "That changed a moment ago." — the one line a rejected write is allowed to
   * produce. `toggleOwnClaim` returns `{ stale: true }` rather than throwing;
   * `organizerAssignItem` throws `RevisionSyncError`. Both land here, the board
   * corrects itself through its own subscription, and nothing is reloaded
   * (EXPERIENCE, *Concurrency and Revision*).
   */
  const [staleNotice, setStaleNotice] = useState<string | null>(null);

  const openBillReview = useCallback(() => {
    router.push(`/tabs/${publicToken}/bill`);
  }, [router, publicToken]);

  /*
   * The locked footer action. The Payment Sheet is a sheet, not a route (§1.0),
   * so it is opened by adding `SettleSheetHost`'s `?settle=` key to this URL.
   *
   * BLOCKED: the key should be the viewer's own obligation id, and no Convex
   * function returns it — `convex/obligations.ts` is a stub and no query reads
   * the `obligations` table. The tab token stands in until an
   * `obligations.forViewer(tabId)` query exists.
   */
  const openSettleSheet = useCallback(() => {
    router.push(`/tabs/${publicToken}${settleSearch(publicToken)}`);
  }, [router, publicToken]);

  /** Claiming is additive: two people on one dish both succeed ("Split 2 ways"). */
  const handleToggleClaim = useCallback(
    (itemId: string) => {
      if (!toggleOwnClaim) {
        return;
      }
      setStaleNotice(null);
      void toggleOwnClaim({
        tabId: tabId as Id<"tabs">,
        itemId: itemId as Id<"items">,
        clientRevision: board.revision,
      })
        .then((result) => {
          if (result && "stale" in result && result.stale) {
            setStaleNotice(STALE_NOTICE);
          }
        })
        .catch(() => setStaleNotice(STALE_NOTICE));
    },
    [toggleOwnClaim, tabId, board.revision],
  );

  /** The organizer override — Flow 4 step 2. */
  const handleAssignItem = useCallback(
    (itemId: string, userId: string) => {
      if (!organizerAssignItem) {
        return;
      }
      setStaleNotice(null);
      void organizerAssignItem({
        tabId: tabId as Id<"tabs">,
        itemId: itemId as Id<"items">,
        targetUserId: userId as Id<"users">,
        clientRevision: board.revision,
      }).catch(() => setStaleNotice(STALE_NOTICE));
    },
    [organizerAssignItem, tabId, board.revision],
  );

  /*
   * The organizer empty state's "Type an item".
   *
   * BLOCKED, and not on Convex: `api.items.addItem({ tabId, name, quantity,
   * unitPriceMinor })` exists and is ready, but `onAddManual` takes no arguments
   * and this surface has no item editor — `ItemEditor` lives on
   * `BillAuthoringSurface`, which only has a route for a *new* tab
   * (`/tabs/new`). Wiring it needs an authoring route for an existing tab, not
   * a new backend function.
   */
  const addManualItem = useCallback(() => {}, []);

  // "Scan a receipt" routes at the Receipt Review surface for this tab. Gated on
  // the flag as well as the handler: §4.2 shows the scan action only when receipt
  // scanning is on, and a visible button that does nothing is worse than none.
  const scanReceipt = useCallback(() => {
    router.push(`/tabs/${publicToken}/receipt`);
  }, [router, publicToken]);

  if (status === "error") {
    return (
      <AppShell hideTabBar>
        <p className="mytab-type-body" style={{ marginTop: "24px", color: MYTAB_COLORS.inkMuted }}>
          {INVALID_LINK_MESSAGE}
        </p>
      </AppShell>
    );
  }

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
        staleNotice={staleNotice}
        onToggleClaim={canWrite && toggleOwnClaim ? handleToggleClaim : undefined}
        onOpenBillReview={openBillReview}
        onSettleUp={openSettleSheet}
        onAssignItem={canWrite && organizerAssignItem ? handleAssignItem : undefined}
        onAddManual={addManualItem}
        onScanReceipt={isReceiptScanEnabled() ? scanReceipt : undefined}
      />
      <SettleSheetHost />
    </AppShell>
  );
}
