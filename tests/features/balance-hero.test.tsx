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

  it("AC4 — aria-label carries semantic words", () => {
    const html = renderToStaticMarkup(
      <BalanceHero state={{ kind: "all_square" }} />,
    );
    expect(html).toContain('aria-label="All square"');
  });
});
