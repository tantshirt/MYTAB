import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));

import { api } from "@/convex/_generated/api";
import { ClaimBoard, FIXTURE_CLAIM_BOARD } from "@/features/claims";
import { FixtureAuthProvider } from "@/features/auth/fixture-auth";
import { useViewer } from "@/features/auth/useViewer";
import {
  STALE_NOTICE,
  useIsLive,
  useLiveMutation,
  useLiveQuery,
} from "@/features/convex/useConvexData";
import {
  FIXTURE_ACTIVITY,
  FIXTURE_BALANCE_HERO,
  FIXTURE_OPEN_TABS,
  useActivityData,
  useTabsHomeData,
} from "@/features/balances";
import { toActivityRow } from "@/features/balances/useActivityData";
import { FIXTURE_TAB } from "@/features/tabs/useTabData";
import { FIXTURE_YOU_SURFACE, useYouSurfaceData } from "@/features/you";
import { TelegramRuntimeProvider } from "@/features/telegram/TelegramRuntimeProvider";
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

describe("live-data seams — degrade to fixtures with no Convex client", () => {
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

  it("useTabsHomeData still returns the fixture — the balance seam is unwired", () => {
    const data = renderHook(() => useTabsHomeData());
    expect(data.status).toBe("ready");
    expect(data.content.balanceHero).toEqual(FIXTURE_BALANCE_HERO);
    expect(data.content.openTabs).toEqual(FIXTURE_OPEN_TABS);
  });

  it("useActivityData returns the fixture feed", () => {
    const data = renderHook(() => useActivityData());
    expect(data.status).toBe("ready");
    expect(data.events).toEqual(FIXTURE_ACTIVITY);
  });

  it("useYouSurfaceData returns the fixture You surface", () => {
    const data = renderHook(
      () => useYouSurfaceData(),
      (node) => <TelegramRuntimeProvider>{node}</TelegramRuntimeProvider>,
    );
    expect(data).toEqual(FIXTURE_YOU_SURFACE);
  });

  it("the deep-linked tab falls back to the fixture tab", () => {
    expect(FIXTURE_TAB).toMatchObject({ status: "ready", tabName: "Sukhumvit Dinner" });
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
