import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// "Start a tab" is a bottom sheet, not a route, so the surface now calls
// useRouter(). renderToStaticMarkup has no App Router mounted.
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));

import { TabsHomeSurface } from "@/features/balances/TabsHomeSurface";
import {
  FIXTURE_ACTIVITY,
  FIXTURE_BALANCE_HERO,
  FIXTURE_OPEN_TABS,
} from "@/features/balances/fixture";

describe("Story 7.2 — Tabs home", () => {
  const baseProps = {
    balanceHero: FIXTURE_BALANCE_HERO,
    openTabs: FIXTURE_OPEN_TABS,
    groups: [{ id: "g1", name: "Sukhumvit Dinner", memberCount: 5 }],
    recentActivity: FIXTURE_ACTIVITY,
    inTelegram: true,
  };

  it("AC1 — fixed hierarchy with hero first", () => {
    const html = renderToStaticMarkup(<TabsHomeSurface {...baseProps} />);
    expect(html.indexOf("You owe")).toBeLessThan(html.indexOf("Start a tab"));
    expect(html.indexOf("Start a tab")).toBeLessThan(html.indexOf("Open tabs"));
    expect(html.indexOf("Open tabs")).toBeLessThan(html.indexOf("Recent activity"));
  });

  it("AC2 — two primary actions", () => {
    const html = renderToStaticMarkup(<TabsHomeSurface {...baseProps} />);
    expect(html).toContain("Start a tab");
    expect(html).toContain("Send a tip");
  });

  it("AC5 — empty state copy", () => {
    const html = renderToStaticMarkup(
      <TabsHomeSurface
        {...baseProps}
        openTabs={[]}
        groups={[]}
      />,
    );
    expect(html).toContain("No tabs yet. Start one from any Telegram group.");
  });

  it("AC6 — outside Telegram explains bot path", () => {
    const html = renderToStaticMarkup(
      <TabsHomeSurface {...baseProps} inTelegram={false} />,
    );
    expect(html).toContain("Open My Tab from a Telegram group to start a tab");
    expect(html).toContain("Open bot");
  });
});

describe("Story 7.9 — offline bar", () => {
  it("AC4 — offline copy", () => {
    const html = renderToStaticMarkup(
      <TabsHomeSurface
        balanceHero={{ kind: "all_square" }}
        openTabs={[]}
        groups={[]}
        recentActivity={[]}
        offline
      />,
    );
    expect(html).toContain("offline");
    expect(html).toContain("catch up");
  });
});
