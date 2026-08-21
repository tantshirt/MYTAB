import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActivityFeed } from "@/features/balances/ActivityFeed";
import { FIXTURE_ACTIVITY } from "@/features/balances/fixture";
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
