import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Authoring now renders inside AppShell *with* the tab bar (POLISH-SPEC §1.0 —
// only the deep-linked Claim Board hides it), and the tab bar reads usePathname().
vi.mock("next/navigation", () => ({
  usePathname: () => "/tabs/new",
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
import {
  BillAuthoringSurface,
  FIXTURE_BILL_AUTHORING,
  FIXTURE_EMPTY_BILL,
} from "@/features/bills";
import { BillEmptyState } from "@/features/bills/BillEmptyState";
import { BillSkeleton } from "@/features/bills/BillSkeleton";
import { OfflineBar } from "@/features/bills/OfflineBar";
import { NewTabForm } from "@/features/bills/NewTabForm";
import { TelegramRuntimeProvider } from "@/features/telegram/TelegramRuntimeProvider";

function renderBill(ui: React.ReactElement) {
  return renderToStaticMarkup(<TelegramRuntimeProvider>{ui}</TelegramRuntimeProvider>);
}

describe("Story 4.1 — New Tab surface", () => {
  it("AC2 — pre-fills currency and recipient asset from group defaults", () => {
    const html = renderToStaticMarkup(
      <NewTabForm
        title="Dinner"
        merchantName=""
        displayCurrency={FIXTURE_BILL_AUTHORING.displayCurrency}
        recipientAsset={FIXTURE_BILL_AUTHORING.recipientAsset}
        payerUserId={FIXTURE_BILL_AUTHORING.payerUserId}
        recipientUserId={FIXTURE_BILL_AUTHORING.recipientUserId}
        members={FIXTURE_BILL_AUTHORING.members}
        fxFixtureBadge={FIXTURE_BILL_AUTHORING.fxFixtureBadge}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain("THB");
    expect(html).toContain("USDC");
    expect(html).toContain("Fixture rate");
  });

  it("AC5 — primary action reads Add items", () => {
    const html = renderBill(
      <BillAuthoringSurface tabId="tabs:fixture" viewerUserId="users:andre" fixture={FIXTURE_EMPTY_BILL} />,
    );
    expect(html).toContain("Add items");
  });

  it("AC3 — does not show wallet addresses on setup", () => {
    const html = renderToStaticMarkup(
      <NewTabForm
        title="Dinner"
        merchantName=""
        displayCurrency="THB"
        recipientAsset="USDC"
        payerUserId="users:andre"
        recipientUserId="users:maya"
        members={FIXTURE_BILL_AUTHORING.members}
        onChange={() => undefined}
      />,
    );
    expect(html).not.toMatch(/solana|wallet address/i);
    expect(html).toContain("resolved when the tab is locked");
  });
});

describe("Story 4.2 — item list and empty states", () => {
  it("AC4 — renders Thai item names", () => {
    const html = renderBill(
      <BillAuthoringSurface tabId="tabs:fixture" viewerUserId="users:andre" fixture={FIXTURE_BILL_AUTHORING} />,
    );
    expect(html).toContain("ส้มตำ");
    expect(html).toContain("Pad Thai");
  });

  it("AC5 — organizer empty state copy", () => {
    const html = renderToStaticMarkup(
      <BillEmptyState isOrganizer organizerDisplayName="Maya" onAddManual={() => undefined} />,
    );
    expect(html).toContain("Add what you ordered.");
    expect(html).toContain("Type an item");
  });

  it("AC5 — participant waiting copy", () => {
    const html = renderToStaticMarkup(
      <BillEmptyState isOrganizer={false} organizerDisplayName="Maya" />,
    );
    expect(html).toContain("Maya is adding the bill");
  });
});

describe("Story 4.3 — adjustments and totals", () => {
  it("AC3 — shows labelled adjustment lines", () => {
    const html = renderBill(
      <BillAuthoringSurface tabId="tabs:fixture" viewerUserId="users:andre" fixture={FIXTURE_BILL_AUTHORING} />,
    );
    expect(html).toContain("Service charge");
    expect(html).toContain("Tax");
    expect(html).toContain("Total");
  });
});

describe("Story 4.4 — loading and offline", () => {
  it("AC1 — skeleton uses tabular placeholder geometry", () => {
    const html = renderToStaticMarkup(<BillSkeleton />);
    expect(html).toContain('aria-busy="true"');
  });

  it("AC4 — offline bar copy", () => {
    const html = renderToStaticMarkup(<OfflineBar visible />);
    expect(html).toMatch(/offline/i);
    expect(html).toMatch(/catch up/i);
  });
});
