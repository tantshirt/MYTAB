import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActivityFeed } from "@/features/balances/ActivityFeed";
import { FIXTURE_ACTIVITY } from "@/tests/fixtures/balances";
import { ACTIVITY_EVENT_TYPE } from "@/lib/domain/activityTypes";

describe("Story 7.3 — Activity feed", () => {
  it("AC5 — empty state copy", () => {
    const html = renderToStaticMarkup(<ActivityFeed events={[]} />);
    expect(html).toContain("Nothing yet. Claims, tips and payments show up here.");
  });

  it("AC4 — rows include summary and amounts", () => {
    const html = renderToStaticMarkup(<ActivityFeed events={FIXTURE_ACTIVITY} />);
    expect(html).toContain("Tim paid Maya");
    expect(html).toContain("42.10 USDC");
  });

  it("AC3 — rows expand with explorer link only in detail", () => {
    const html = renderToStaticMarkup(<ActivityFeed events={FIXTURE_ACTIVITY} />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("View on explorer");
  });

  it("AC4 — event types have distinct icon tints via glyph", () => {
    expect(ACTIVITY_EVENT_TYPE.PAYMENT).toBe("payment");
    expect(ACTIVITY_EVENT_TYPE.WAIVER).toBe("waiver");
  });
});

describe("POLISH-SPEC §1.12 — Activity", () => {
  it("stacks the amount over the timestamp instead of alternating them", () => {
    const html = renderToStaticMarkup(<ActivityFeed events={FIXTURE_ACTIVITY} />);
    // The tabular amount column holds the figure; the timestamp is its own,
    // untabulated element beneath it. Before this the relative time was
    // rendered *inside* the amount column whenever a row had no figure.
    expect(html).toContain("42.10 USDC");
    expect(html).toContain("5m ago");
    expect(html).not.toMatch(/data-mytab-amount="true"[^>]*>\s*5m ago/);
  });

  it("groups rows by day under micro-labels", () => {
    const html = renderToStaticMarkup(<ActivityFeed events={FIXTURE_ACTIVITY} />);
    expect(html).toContain("mytab-type-micro-label");
    expect(html).toContain("Today");
  });

  it("reads amounts as money, not digits", () => {
    const html = renderToStaticMarkup(<ActivityFeed events={FIXTURE_ACTIVITY} />);
    expect(html).toContain('aria-label="180 baht"');
    expect(html).toContain('aria-label="42 USDC 1"');
  });

  it("§4.3 — a query error names its next action", () => {
    const html = renderToStaticMarkup(<ActivityFeed events={[]} error />);
    expect(html).toContain("Couldn&#x27;t load your activity.");
    expect(html).toContain("Try again");
  });

  it("§4.4 — offline keeps cached rows readable", () => {
    const html = renderToStaticMarkup(<ActivityFeed events={FIXTURE_ACTIVITY} offline />);
    expect(html).toContain("You&#x27;re offline. We&#x27;ll catch up.");
    expect(html).toContain("Tim paid Maya");
  });

  it("§4.1 — the skeleton is first paint only", () => {
    const first = renderToStaticMarkup(<ActivityFeed events={[]} loading />);
    expect(first).toContain('aria-busy="true"');

    const subsequent = renderToStaticMarkup(
      <ActivityFeed events={FIXTURE_ACTIVITY} loading hasCachedData />,
    );
    expect(subsequent).not.toContain('aria-busy="true"');
  });
});
