import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BalanceHero } from "@/features/balances/BalanceHero";
import { FIXTURE_BALANCE_HERO } from "@/features/balances/fixture";

describe("Story 7.1 — Balance hero", () => {
  it("AC1 — renders plain-language owed copy", () => {
    const html = renderToStaticMarkup(
      <BalanceHero state={{ kind: "owed", amountMinor: 29_174 }} />,
    );
    expect(html).toContain("You owe");
    expect(html).toContain("฿291.74");
  });

  it("AC2 — is not a button or link", () => {
    const html = renderToStaticMarkup(<BalanceHero state={FIXTURE_BALANCE_HERO} />);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a ");
  });

  // POLISH-SPEC §2.3 / DESIGN.md: amounts are never truncated, anywhere.
  it("never clips the figure and keeps the label on its own line", () => {
    const html = renderToStaticMarkup(
      <BalanceHero state={{ kind: "owed", amountMinor: 184_000 as never }} />,
    );
    expect(html).not.toContain("text-overflow");
    expect(html).not.toContain("clip");
    expect(html).not.toContain("overflow:hidden");
    // Label and figure are separate elements, so the figure alone owns the column.
    expect(html).toContain("฿1,840.00");
    expect(html).toMatch(/You owe<\/p>/);
  });

  it("AC4 — aria-label carries semantic words", () => {
    const html = renderToStaticMarkup(
      <BalanceHero state={{ kind: "all_square" }} />,
    );
    expect(html).toContain('aria-label="All square"');
  });
});
