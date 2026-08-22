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
} from "@/tests/fixtures/balances";

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
    // The section micro-label is "RECENT" on the artboard (POLISH-SPEC §1.2).
    expect(html.indexOf("Open tabs")).toBeLessThan(html.indexOf("Groups"));
    expect(html.indexOf("Groups")).toBeLessThan(html.indexOf("Recent"));
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

  /*
   * POLISH-SPEC §4.5 separates two states the surface used to conflate.
   *
   *   - No verified group: there is nowhere to start a tab, so the surface
   *     explains the bot path. This is the *no group context* case and it is
   *     independent of where the app is running.
   *   - Outside Telegram: reads work and every mutation is locked, with the
   *     write-lock sentence repeated on the disabled controls' own sub-line.
   */
  it("AC6 — no group context explains the bot path", () => {
    const html = renderToStaticMarkup(
      <TabsHomeSurface {...baseProps} groups={[]} openTabs={[]} />,
    );
    expect(html).toContain("Open My Tab from a Telegram group to start a tab");
  });

  /*
   * The bot handle is deployment configuration, read at build time. It used to
   * be a hardcoded `mytab_fixture_bot` — a link at a bot nobody registered,
   * which is a dead end dressed as an action.
   */
  it("AC6 — the bot link is absent when no bot handle is configured", () => {
    const html = renderToStaticMarkup(
      <TabsHomeSurface {...baseProps} groups={[]} openTabs={[]} />,
    );
    expect(html).not.toContain("Open bot");
    expect(html).not.toContain("t.me/");
  });

  it("§4.5 — outside Telegram locks writes and says so", () => {
    const html = renderToStaticMarkup(
      <TabsHomeSurface {...baseProps} inTelegram={false} />,
    );
    expect(html).toContain("Open this in Telegram to make changes.");
    expect(html).toContain('aria-disabled="true"');
    // Reads stay fully available.
    expect(html).toContain("Sukhumvit Dinner");
  });

  it("§4.2 — the recent section is omitted entirely when there is no activity", () => {
    const html = renderToStaticMarkup(
      <TabsHomeSurface {...baseProps} recentActivity={[]} />,
    );
    expect(html).not.toContain("Recent");
  });

  it("§4.3 — a query error names its next action", () => {
    const html = renderToStaticMarkup(<TabsHomeSurface {...baseProps} error />);
    expect(html).toContain("Couldn&#x27;t load your tabs.");
    expect(html).toContain("Try again");
  });
});

describe("POLISH-SPEC §2.2, §2.9 — skeletons are first-paint only", () => {
  const baseProps = {
    balanceHero: FIXTURE_BALANCE_HERO,
    openTabs: FIXTURE_OPEN_TABS,
    groups: [{ id: "g1", name: "Sukhumvit Dinner", memberCount: 5 }],
    recentActivity: FIXTURE_ACTIVITY,
    inTelegram: true,
  };

  it("reserves the amount column at its tabular width on first paint", () => {
    const html = renderToStaticMarkup(<TabsHomeSurface {...baseProps} loading />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("5.5ch");
    expect(html).toContain("7ch");
  });

  it("never shimmers", () => {
    const html = renderToStaticMarkup(<TabsHomeSurface {...baseProps} loading />);
    expect(html).not.toContain("animation");
    expect(html).not.toContain("shimmer");
  });

  it("shows content, not a skeleton, when the surface already has data", () => {
    const html = renderToStaticMarkup(
      <TabsHomeSurface {...baseProps} loading hasCachedData />,
    );
    expect(html).not.toContain('aria-busy="true"');
    expect(html).toContain("Sukhumvit Dinner");
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
