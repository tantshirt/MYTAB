import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));

import { api } from "@/convex/_generated/api";
import { ClaimBoard } from "@/features/claims";
import { useBillReviewData } from "@/features/claims/useBillReviewData";
import { useClaimBoardData } from "@/features/claims/useClaimBoardData";
import { FixtureAuthProvider } from "@/features/auth/fixture-auth";
import { useViewer } from "@/features/auth/useViewer";
import {
  STALE_NOTICE,
  useIsLive,
  useLiveMutation,
  useLiveQuery,
} from "@/features/convex/useConvexData";
import { useActivityData } from "@/features/balances/useActivityData";
import { useTabsHomeData } from "@/features/balances/useTabsHomeData";
import { toActivityRow } from "@/features/balances/activityRow";
import { useGroupData } from "@/features/groups/useGroupData";
import { useNewTabData } from "@/features/bills/useNewTabData";
import { useReceiptData } from "@/features/receipts/useReceiptData";
import { useSettleSheetData } from "@/features/settlement/useSettleSheetData";
import { refusalFor } from "@/features/tabs/useTabData";
import { useYouSurfaceData } from "@/features/you/useYouSurfaceData";
import { TelegramRuntimeProvider } from "@/features/telegram/TelegramRuntimeProvider";
import { FIXTURE_CLAIM_BOARD } from "@/tests/fixtures/claims";
import { ACTIVITY_EVENT_TYPE } from "@/lib/domain/activityTypes";
import { showSkeleton } from "@/components/primitives/load-state";

/**
 * Runs a hook once through the server renderer — the same environment the rest
 * of `tests/features` uses. No Convex provider is mounted anywhere, which is
 * exactly the condition every seam has to survive.
 */
function renderHook<T>(hook: () => T, wrap: (node: React.ReactNode) => React.ReactElement = (n) => <>{n}</>): T {
  let captured!: T;
  function Probe() {
    captured = hook();
    return null;
  }
  renderToStaticMarkup(wrap(<Probe />));
  return captured;
}

describe("live-data seams — no Convex client means no data, never invented data", () => {
  it("useLiveQuery reports fixture mode instead of loading forever", () => {
    const result = renderHook(() => useLiveQuery(api.users.viewer, {}));
    expect(result.fixture).toBe(true);
    expect(result.loading).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("useIsLive is false, so no surface claims live data", () => {
    expect(renderHook(() => useIsLive())).toBe(false);
  });

  it("useLiveMutation is null — every write is unavailable, never a silent no-op", () => {
    expect(renderHook(() => useLiveMutation(api.allocations.toggleOwnClaim))).toBeNull();
  });

  it("useViewer resolves the fixture identity rather than hanging undefined", () => {
    const viewer = renderHook(
      () => useViewer(),
      (node) => <FixtureAuthProvider>{node}</FixtureAuthProvider>,
    );
    expect(viewer).toBe("fixture-user");
  });

  it("useTabsHomeData hides the hero rather than asserting a position it never read", () => {
    const data = renderHook(() => useTabsHomeData());
    expect(data.content.balanceHero).toBeUndefined();
    expect(data.content.openTabs).toEqual([]);
    expect(data.content.groups).toEqual([]);
    expect(data.content.recentActivity).toEqual([]);
    expect(data.content.compressedTransfers).toEqual([]);
  });

  it("useActivityData reports an empty feed, which is the designed empty state", () => {
    const data = renderHook(() => useActivityData());
    expect(data.status).toBe("ready");
    expect(data.events).toEqual([]);
  });

  it("useYouSurfaceData names nobody and shows no key", () => {
    const data = renderHook(
      () => useYouSurfaceData(),
      (node) => <TelegramRuntimeProvider>{node}</TelegramRuntimeProvider>,
    );
    expect(data.viewer).toBeNull();
    expect(data.wallet).toEqual({ kind: "provisioning" });
  });

  it("useGroupData has no members and no tabs to show", () => {
    const data = renderHook(() => useGroupData("groups:none"));
    expect(data.content.members).toEqual([]);
    expect(data.content.openTabs).toEqual([]);
    expect(data.content.position).toBeUndefined();
  });

  it("useClaimBoardData has no items and no participants", () => {
    const data = renderHook(() => useClaimBoardData("tabs:none", null));
    expect(data.board.items).toEqual([]);
    expect(data.board.participants).toEqual([]);
    expect(data.board.viewerSubtotalMinor).toBe(0);
  });

  it("useBillReviewData has nobody with a share", () => {
    const data = renderHook(() => useBillReviewData("tabs:none"));
    expect(data.bill.breakdowns).toEqual([]);
    expect(data.bill.billTotalMinor).toBe(0);
  });

  it("useNewTabData offers no payer nobody has ever opened the app as", () => {
    const data = renderHook(
      () => useNewTabData(null),
      (node) => <TelegramRuntimeProvider>{node}</TelegramRuntimeProvider>,
    );
    expect(data.members).toEqual([]);
    expect(data.items).toEqual([]);
    expect(data.organizerUserId).toBe("");
  });

  it("useReceiptData has no lines and reconciles at zero", () => {
    const data = renderHook(() => useReceiptData("tabs:none", null));
    expect(data.parsed.lines).toEqual([]);
    expect(Number(data.parsed.reconciliation.receiptTotalMinor)).toBe(0);
  });

  it("useSettleSheetData refuses to price a payment it cannot read", () => {
    const data = renderHook(() => useSettleSheetData("ob_1"));
    expect(data.status).not.toBe("ready");
    expect(data.billAmount).toBe("");
    expect(data.tokens).toEqual([]);
  });

  it("a deep link with no deployment behind it is refused, not filled in", () => {
    const refusal = refusalFor("UNAVAILABLE");
    expect(refusal.message).toBe("Can't get you in right now. Try the link again in a moment.");
    expect(refusal.action).toBe("retry");
  });
});

describe("activity mapping — Convex rows to ActivityRowData", () => {
  it("carries the payload through and derives the explorer link", () => {
    const row = toActivityRow({
      _id: "ae1",
      type: ACTIVITY_EVENT_TYPE.PAYMENT,
      payload: {
        summary: "Tim paid Maya",
        amountLabel: "42.10 USDC",
        detail: "Confirmed on chain",
        transactionSignature: "sig-1",
      },
      createdAt: 1_700_000_000_000,
    });

    expect(row).toMatchObject({
      id: "ae1",
      type: ACTIVITY_EVENT_TYPE.PAYMENT,
      summary: "Tim paid Maya",
      amountLabel: "42.10 USDC",
      detail: "Confirmed on chain",
      explorerUrl: "https://explorer.solana.com/tx/sig-1",
    });
  });

  it("leaves the explorer link off an event with no signature", () => {
    const row = toActivityRow({
      _id: "ae2",
      type: ACTIVITY_EVENT_TYPE.CLAIM,
      payload: { summary: "Maya claimed Green Curry" },
      createdAt: 1,
    });
    expect(row.explorerUrl).toBeUndefined();
    expect(row.transactionSignature).toBeUndefined();
  });

  it("never renders an unknown event type as an unknown icon key", () => {
    const row = toActivityRow({ _id: "ae3", type: "not_a_type", payload: {}, createdAt: 1 });
    expect(Object.values(ACTIVITY_EVENT_TYPE)).toContain(row.type);
  });
});

describe("EXPERIENCE — Concurrency and Revision", () => {
  it("a rejected write says one line, and it is the sanctioned one", () => {
    expect(STALE_NOTICE).toBe("That changed a moment ago.");
  });

  it("the board renders that line in place, with no modal and no reload", () => {
    const html = renderToStaticMarkup(
      <ClaimBoard {...FIXTURE_CLAIM_BOARD} staleNotice={STALE_NOTICE} />,
    );
    expect(html).toContain("That changed a moment ago.");
    expect(html).not.toContain("role=\"dialog\"");
  });

  it("claiming is additive — a shared item reads as a split, never a conflict", () => {
    const shared = FIXTURE_CLAIM_BOARD.items.find((item) => item.claimantIds.length > 1);
    expect(shared).toBeDefined();
    const html = renderToStaticMarkup(<ClaimBoard {...FIXTURE_CLAIM_BOARD} />);
    expect(html).toContain("Split 2 ways");
  });
});

describe("EXPERIENCE — Loading, first paint only", () => {
  it("a subsequent load never shows a skeleton over data the client already holds", () => {
    expect(showSkeleton({ loading: true, hasCachedData: false })).toBe(true);
    expect(showSkeleton({ loading: true, hasCachedData: true })).toBe(false);
  });
});
