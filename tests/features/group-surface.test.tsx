import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The trailing "Start a tab" action is a bottom sheet, so the surface reaches
// for useRouter(); renderToStaticMarkup has no App Router mounted.
vi.mock("next/navigation", () => ({
  usePathname: () => "/groups/g1",
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));

import { FIXTURE_GROUP_SURFACE, GroupSurface } from "@/features/groups/GroupSurface";
import { avatarTintForUserId } from "@/lib/theme/tokens";

describe("Story 2.7 — Group surface fixture", () => {
  it("AC1 — exposes group currency defaults in plain language", () => {
    expect(FIXTURE_GROUP_SURFACE.defaultCurrency).toBe("THB");
    expect(FIXTURE_GROUP_SURFACE.recipientAsset).toBe("USDC");
  });

  it("AC2 — includes members with wallet readiness flags", () => {
    expect(FIXTURE_GROUP_SURFACE.members.some((m) => m.walletReady)).toBe(true);
    expect(FIXTURE_GROUP_SURFACE.members.some((m) => !m.walletReady)).toBe(true);
  });

  it("AC2 — deterministic avatar tint from user id", () => {
    const member = FIXTURE_GROUP_SURFACE.members[0]!;
    expect(avatarTintForUserId(member.telegramUserId)).toBeTruthy();
  });

  it("AC3 — lists at least one open tab in fixture", () => {
    expect(FIXTURE_GROUP_SURFACE.openTabs.length).toBeGreaterThan(0);
    expect(FIXTURE_GROUP_SURFACE.openTabs[0]?.name).toBe("Sukhumvit Dinner");
  });
});

describe("POLISH-SPEC §1.3 — Group", () => {
  it("leads with the balance card and a Settle up action", () => {
    const html = renderToStaticMarkup(<GroupSurface {...FIXTURE_GROUP_SURFACE} />);
    expect(html).toContain("฿291.74");
    expect(html).toContain('aria-label="291 baht 74"');
    expect(html).toContain("You owe Maya");
    expect(html).toContain("Settle up");
  });

  it("carries an activity feed and a Start a tab action", () => {
    const html = renderToStaticMarkup(<GroupSurface {...FIXTURE_GROUP_SURFACE} />);
    expect(html).toContain("Activity");
    expect(html).toContain("Start a tab");
  });

  it("drops the mechanism copy and the shadow hierarchy marker", () => {
    const html = renderToStaticMarkup(<GroupSurface {...FIXTURE_GROUP_SURFACE} />);
    // "Wallet ready" is mechanism on a social surface; the shadow ring on the
    // most recent tab breaks DESIGN.md's rule that shadow marks floating
    // sheets and nothing else; the caption explained the UI to itself.
    expect(html).not.toContain("Wallet ready");
    expect(html).not.toContain("Wallet not set up");
    expect(html).not.toContain("Most recent tab highlighted");
  });

  it("renders a relative timestamp, never toLocaleDateString", () => {
    const html = renderToStaticMarkup(<GroupSurface {...FIXTURE_GROUP_SURFACE} />);
    expect(html).toContain("Updated just now");
  });

  it("§4.2 — empty tabs and empty members have designed copy", () => {
    const html = renderToStaticMarkup(
      <GroupSurface {...FIXTURE_GROUP_SURFACE} openTabs={[]} members={[]} />,
    );
    expect(html).toContain("No tabs yet. Start one from any Telegram group.");
    expect(html).toContain("No one else has opened this tab yet.");
  });

  it("§4.3 — two distinct failures, each naming its next action", () => {
    const notMember = renderToStaticMarkup(
      <GroupSurface {...FIXTURE_GROUP_SURFACE} error="not-a-member" />,
    );
    expect(notMember).toContain("You&#x27;re not in this group any more.");
    expect(notMember).toContain("Back to your tabs");

    const queryError = renderToStaticMarkup(
      <GroupSurface {...FIXTURE_GROUP_SURFACE} error="query" />,
    );
    expect(queryError).toContain("Couldn&#x27;t load this group.");
    expect(queryError).toContain("Try again");
  });

  it("§4.4 / §4.5 — the write lock states its reason rather than going silent", () => {
    const offline = renderToStaticMarkup(
      <GroupSurface {...FIXTURE_GROUP_SURFACE} offline />,
    );
    expect(offline).toContain("You&#x27;re offline. We&#x27;ll catch up.");
    expect(offline).toContain("Needs a connection.");

    const browser = renderToStaticMarkup(
      <GroupSurface {...FIXTURE_GROUP_SURFACE} inTelegram={false} />,
    );
    expect(browser).toContain("Open this in Telegram to make changes.");
  });

  it("§4.1 — the skeleton reserves the amount column and only paints once", () => {
    const first = renderToStaticMarkup(<GroupSurface {...FIXTURE_GROUP_SURFACE} loading />);
    expect(first).toContain('aria-busy="true"');
    expect(first).toContain("7ch");
    expect(first).not.toContain("animation");

    const subsequent = renderToStaticMarkup(
      <GroupSurface {...FIXTURE_GROUP_SURFACE} loading hasCachedData />,
    );
    expect(subsequent).not.toContain('aria-busy="true"');
  });
});
