"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { ClaimBoard } from "@/features/claims";
import { useClaimBoardData } from "@/features/claims/useClaimBoardData";
import { SettleSheetHost, settleSearch } from "@/features/settlement/SettleSheetHost";
import { useTelegramBackButton } from "@/features/telegram/useTelegramBackButton";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import {
  STALE_NOTICE,
  useLiveMutation,
  useLiveQuery,
  useRetryNonce,
} from "@/features/convex/useConvexData";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useReceiptScanEnabled } from "@/features/receipts/useReceiptScanEnabled";
import { MYTAB_COLORS } from "@/lib/theme/tokens";
import { AppShell } from "@/components/layout/AppShell";
import {
  TAB_REFUSAL_ACTION_LABEL,
  useResolvedTab,
} from "@/features/tabs/useTabData";
import { InviteSheet, type InviteSheetMode } from "@/features/invite/InviteSheet";

/**
 * A text action that is still a 44px target.
 *
 * `padding: 0` on a 15px line box is a 19px tap target — under EXPERIENCE's
 * hard floor, and `scripts/sweep.mjs` measures it. `inline-flex` with a
 * `min-height` keeps the type where the design puts it and gives the finger
 * somewhere to land.
 */
const TEXT_ACTION_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "44px",
  background: "none",
  border: "none",
  color: MYTAB_COLORS.primary,
  fontSize: "15px",
  fontWeight: 500,
  padding: 0,
  cursor: "pointer",
} as const;

type TabDeepLinkSurfaceProps = {
  publicToken: string;
};

/**
 * The `[Open tab]` button in the group message always lands here, and this
 * surface is the Claim Board for that specific tab — never the authoring
 * screen, which lives at `/tabs/new` (EXPERIENCE, Information Architecture;
 * POLISH-SPEC §1.0, §1.6).
 */
export function TabDeepLinkSurface({ publicToken }: TabDeepLinkSurfaceProps) {
  const router = useRouter();
  const { isTelegramWebApp } = useTelegramRuntime();
  const { nonce, retry } = useRetryNonce();
  const session = useResolvedTab(publicToken, nonce);

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
    /*
     * §7 — no raw codes, no stack traces, no dead ends. Each cause carries its
     * own words and its own next action, and where the design allows it the
     * group facts stay visible: tab name and people count, never an amount.
     */
    const onAction = session.action === "retry" ? retry : handleBack;

    return (
      <AuthGate>
        <AppShell>
          <div style={{ marginTop: "24px", display: "grid", gap: "12px", justifyItems: "start" }}>
            {session.facts ? (
              <p className="mytab-type-meta" style={{ color: MYTAB_COLORS.inkMuted }}>
                {session.facts.tabName} · {session.facts.peopleCount}{" "}
                {session.facts.peopleCount === 1 ? "person" : "people"}
              </p>
            ) : null}
            <p className="mytab-type-body" style={{ color: MYTAB_COLORS.inkMuted }}>
              {session.message}
            </p>
            <button
              type="button"
              onClick={onAction}
              // The refusal's only action, and now a reachable one: no
              // deployment behind a link resolves here, so this button is on
              // screen in the shipped app rather than only in a dead branch.
              // EXPERIENCE's 44px floor applies to it like anything else.
              style={TEXT_ACTION_STYLE}
            >
              {TAB_REFUSAL_ACTION_LABEL[session.action]}
            </button>
          </div>
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
  const setOwnClaimQuantity = useLiveMutation(api.allocations.setOwnClaimQuantity);
  const organizerAssignItem = useLiveMutation(api.allocations.organizerAssignItem);
  const tabObligations = useLiveQuery(api.obligations.forTab, {
    tabId: tabId as Id<"tabs">,
  });

  /*
   * "That changed a moment ago." — the one line a rejected write is allowed to
   * produce. `toggleOwnClaim` returns `{ stale: true }` rather than throwing;
   * `organizerAssignItem` throws `RevisionSyncError`. Both land here, the board
   * corrects itself through its own subscription, and nothing is reloaded
   * (EXPERIENCE, *Concurrency and Revision*).
   */
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  /*
   * `?invite=1` is what "Start a tab" hands over on success: open the code
   * immediately, in handoff shape, once.
   *
   * Read from `window.location` rather than `useSearchParams` for the reason
   * `useGroupScope` gives — this surface has no Suspense boundary of its own,
   * and `useSearchParams` would opt the whole route out of static rendering.
   */
  const [inviteMode, setInviteMode] = useState<InviteSheetMode>("manage");
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (new URLSearchParams(window.location.search).get("invite") === "1") {
      setInviteMode("handoff");
      setInviteOpen(true);
    }
  }, []);

  /*
   * Dismissing the handoff drops the key, so a back-navigation or a refresh
   * does not re-open the code over a board the organizer is now working in.
   */
  const dismissInvite = useCallback(() => {
    setInviteOpen(false);
    if (inviteMode === "handoff") {
      setInviteMode("manage");
      router.replace(`/tabs/${publicToken}`);
    }
  }, [inviteMode, router, publicToken]);

  const openBillReview = useCallback(() => {
    router.push(`/tabs/${publicToken}/bill`);
  }, [router, publicToken]);

  /*
   * The locked footer action. The Payment Sheet is a sheet, not a route (§1.0),
   * so it is opened by adding `SettleSheetHost`'s `?settle=` key to this URL.
   *
   * The Payment Sheet is keyed on the viewer's own obligation id from
   * `obligations.forTab`, never the tab public token.
   */
  const openSettleSheet = useCallback(() => {
    const obligationId = tabObligations.data?.viewerObligationId;
    if (!obligationId) {
      return;
    }
    router.push(`/tabs/${publicToken}${settleSearch(obligationId)}`);
  }, [router, publicToken, tabObligations.data?.viewerObligationId]);

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

  const handleSetClaimQuantity = useCallback(
    (itemId: string, quantity: number) => {
      if (!setOwnClaimQuantity) {
        return;
      }
      setStaleNotice(null);
      void setOwnClaimQuantity({
        tabId: tabId as Id<"tabs">,
        itemId: itemId as Id<"items">,
        clientRevision: board.revision,
        quantity,
      })
        .then((result) => {
          if (result && "stale" in result && result.stale) {
            setStaleNotice(STALE_NOTICE);
          }
        })
        .catch(() => setStaleNotice(STALE_NOTICE));
    },
    [setOwnClaimQuantity, tabId, board.revision],
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
  const scanEnabled = useReceiptScanEnabled();

  // "Scan receipt" routes at the Receipt Review surface for this tab. Gated on
  // the Convex capability: §4.2 shows the scan action only when scanning can
  // run, and a visible button that does nothing is worse than none.
  const scanReceipt = useCallback(() => {
    router.push(`/tabs/${publicToken}/receipt`);
  }, [router, publicToken]);

  if (status === "error") {
    return (
      <AppShell hideTabBar>
        <p className="mytab-type-body" style={{ marginTop: "24px", color: MYTAB_COLORS.inkMuted }}>
          Can&rsquo;t load this tab right now. Try again in a moment.
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
            style={TEXT_ACTION_STYLE}
          >
            ← Tabs
          </button>
        </div>
      ) : null}
      <ClaimBoard
        {...board}
        staleNotice={staleNotice}
        onToggleClaim={canWrite && toggleOwnClaim ? handleToggleClaim : undefined}
        onSetClaimQuantity={canWrite && setOwnClaimQuantity ? handleSetClaimQuantity : undefined}
        onOpenBillReview={openBillReview}
        onSettleUp={openSettleSheet}
        onAssignItem={canWrite && organizerAssignItem ? handleAssignItem : undefined}
        onAddManual={addManualItem}
        onScanReceipt={scanEnabled ? scanReceipt : undefined}
        onInvite={
          board.isOrganizer
            ? () => {
                setInviteMode("manage");
                setInviteOpen(true);
              }
            : undefined
        }
      />
      {board.isOrganizer ? (
        <InviteSheet
          open={inviteOpen}
          tabId={tabId}
          mode={inviteMode}
          onDismiss={dismissInvite}
        />
      ) : null}
      <SettleSheetHost />
    </AppShell>
  );
}
