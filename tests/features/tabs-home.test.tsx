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
  FIXTURE_BALANCE_COMPONENTS,
  FIXTURE_BALANCE_HERO,
  FIXTURE_OPEN_TABS,
} from "@/tests/fixtures/balances";

const baseProps = {
  balanceHero: FIXTURE_BALANCE_HERO,
  openTabs: FIXTURE_OPEN_TABS,
  groups: [{ id: "g1", name: "Sukhumvit Dinner", memberCount: 5 }],
  recentActivity: FIXTURE_ACTIVITY,
  balanceComponents: FIXTURE_BALANCE_COMPONENTS,
  inTelegram: true,
};

/*
 * Story 7.2 AC1 asked for a fixed hierarchy: hero → two actions → tabs →
 * groups → recent. That hierarchy is deliberately gone, and this is the file
 * that records why.
 *
 * Every section was the same weight, so the one tab five people were claiming
 * on at that moment rendered identically to a group roster. The surface now
 * ranks by what is HAPPENING: the live tab takes the screen, everything merely
 * open drops below it, and Groups moved to You (a group is picked inside the
 * start-a-tab flow, so a roster on the home screen bought nothing).
 *
 * What did NOT change is the part AC1 existed to protect: the order is still
 * fixed, and it is still asserted here.
 */
describe("Tabs home — a live tab owns the screen", () => {
  it("ranks live tab, then merely open, then people, then what just happened", () => {
    const html = renderToStaticMarkup(<TabsHomeSurface {...baseProps} />);

    // The live tab's own name and hero come before anything else.
    expect(html.indexOf("Your share")).toBeLessThan(html.indexOf("Also open"));
    expect(html.indexOf("Also open")).toBeLessThan(html.indexOf("People"));
    expect(html.indexOf("People")).toBeLessThan(html.indexOf("Just happened"));
  });

  it("puts the whole position in the top bar without rounding it", () => {
    const html = renderToStaticMarkup(<TabsHomeSurface {...baseProps} />);
    // ฿211.74 — the net, in full, above the live card.
    expect(html).toContain("211.74");
    expect(html).not.toContain("About ");
    expect(html).not.toContain("~");
  });

  it("renders the live tab's room, progress and unclaimed pool", () => {
    const html = renderToStaticMarkup(<TabsHomeSurface {...baseProps} />);

    expect(html).toContain("Live");
    // Two of five have claimed nothing... plus Tim and Ploy. Three still choosing.
    expect(html).toContain("3 still choosing");
    expect(html).toContain("8 of 12 claimed");
    expect(html).toContain("Left to claim");
    expect(html).toContain("Pad Thai");
    // Four unclaimed, three named: the remainder is shown, never swallowed.
    expect(html).toContain("+1");
  });

  it("keeps the locked tab out of the live slot and in the list below", () => {
    const html = renderToStaticMarkup(<TabsHomeSurface {...baseProps} />);

    // The live card is the open tab; the locked one is a plain card under it.
    expect(html.indexOf("Sukhumvit Dinner")).toBeLessThan(
      html.indexOf("After-dinner drinks"),
    );
    expect(html.indexOf("Also open")).toBeLessThan(html.indexOf("After-dinner drinks"));
  });

  it("offers review rather than claim once the viewer has taken something", () => {
    const html = renderToStaticMarkup(<TabsHomeSurface {...baseProps} />);
    // The fixture viewer has claimed two items.
    expect(html).toContain("Review your items");
    expect(html).not.toContain("Claim your items");
  });

  it("falls back to the position card when nothing is live", () => {
    const html = renderToStaticMarkup(
      <TabsHomeSurface
        {...baseProps}
        openTabs={FIXTURE_OPEN_TABS.filter((tab) => tab.status === "locked")}
      />,
    );

    expect(html).not.toContain("Your share");
    expect(html).toContain("Open tabs");
    // The net position is now the 42px figure rather than a pill.
    expect(html).toContain("You owe");
  });
});

describe("Tabs home — people carry their own colour", () => {
  it("says the direction in words, never in colour alone", () => {
    const html = renderToStaticMarkup(<TabsHomeSurface {...baseProps} />);
    expect(html).toContain("you owe");
    expect(html).toContain("owes you");
  });
});

describe("Tabs home — empty and blocked states", () => {
  it("§4.2 — first run is one sentence and one button", () => {
    const html = renderToStaticMarkup(
      <TabsHomeSurface
        {...baseProps}
        balanceHero={undefined}
        openTabs={[]}
        balanceComponents={[]}
        recentActivity={[]}
      />,
    );

    expect(html).toContain("Start a tab.");
    expect(html).toContain("Everyone taps what they had");
    // No empty section headers over nothing.
    expect(html).not.toContain("Also open");
    expect(html).not.toContain("People");
  });

  /*
   * POLISH-SPEC §4.5 separates two states the surface used to conflate — but
   * only one of them is a reason to withhold the control.
   *
   *   - No verified group: NOT a blocker. `tabs.createPersonalTab` is the
   *     second door (D-06) and the invite code admits everyone else, so the
   *     surface starts a personal tab. It used to render a disabled `<span>`
   *     and the sentence "Open My Tab from a Telegram group to start a tab",
   *     which made the single control on the home screen inert for every
   *     first-time user while the backend to serve them sat there ready.
   *   - Outside Telegram: reads work and every mutation is locked, with the
   *     write-lock sentence repeated on the disabled control's own sub-line.
   */
  it("AC6 — no group context still offers a tab, through the personal door", () => {
    const html = renderToStaticMarkup(
      <TabsHomeSurface
        {...baseProps}
        balanceHero={undefined}
        groups={[]}
        openTabs={[]}
        balanceComponents={[]}
      />,
    );
    expect(html).toContain("Start a tab");
    expect(html).not.toContain("Open My Tab from a Telegram group to start a tab");
    // The control is a real button, not the disabled stand-in.
    expect(html).not.toContain("aria-disabled");
  });

  /*
   * The bot handle is deployment configuration, read at build time. It used to
   * be a hardcoded `mytab_fixture_bot` — a link at a bot nobody registered,
   * which is a dead end dressed as an action.
   */
  it("AC6 — the bot link is absent when no bot handle is configured", () => {
    const html = renderToStaticMarkup(
      <TabsHomeSurface
        {...baseProps}
        balanceHero={undefined}
        groups={[]}
        openTabs={[]}
        balanceComponents={[]}
      />,
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

  it("§4.2 — the activity section is omitted entirely when there is nothing", () => {
    const html = renderToStaticMarkup(
      <TabsHomeSurface {...baseProps} recentActivity={[]} />,
    );
    expect(html).not.toContain("Just happened");
    expect(html).not.toContain("Tim paid Maya");
  });

  it("§4.3 — a query error names its next action", () => {
    const html = renderToStaticMarkup(<TabsHomeSurface {...baseProps} error />);
    expect(html).toContain("Couldn&#x27;t load your tabs.");
    expect(html).toContain("Try again");
  });
});

describe("POLISH-SPEC §2.2, §2.9 — skeletons are first-paint only", () => {
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
