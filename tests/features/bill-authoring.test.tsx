import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Authoring renders inside AppShell *with* the tab bar (POLISH-SPEC §1.0 — only
// the deep-linked Claim Board hides it). The tab bar itself now lives in
// `app/(miniapp)/layout.tsx` and is absent here; the router mock stays for the
// surface's own useRouter/useSearchParams calls.
vi.mock("next/navigation", () => ({
  usePathname: () => "/tabs/new",
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
import { BillAuthoringSurface } from "@/features/bills";
import { FIXTURE_BILL_AUTHORING, FIXTURE_EMPTY_BILL } from "@/tests/fixtures/bills";
import { BillEmptyState } from "@/features/bills/BillEmptyState";
import { BillSkeleton } from "@/features/bills/BillSkeleton";
import { OfflineBar } from "@/features/bills/OfflineBar";
import { ItemEditor } from "@/features/bills/ItemEditor";
import { NewTabForm } from "@/features/bills/NewTabForm";
import { TelegramRuntimeProvider } from "@/features/telegram/TelegramRuntimeProvider";

function renderBill(ui: React.ReactElement) {
  return renderToStaticMarkup(<TelegramRuntimeProvider>{ui}</TelegramRuntimeProvider>);
}

describe("Story 4.1 — New Tab surface", () => {
  it("AC2 — pre-fills the currency chip pair from group defaults", () => {
    const html = renderToStaticMarkup(
      <NewTabForm
        title="Dinner"
        merchantName=""
        displayCurrency={FIXTURE_BILL_AUTHORING.displayCurrency}
        payerUserId={FIXTURE_BILL_AUTHORING.payerUserId}
        members={FIXTURE_BILL_AUTHORING.members}
        captureMethod="manual"
        fxFixtureBadge={FIXTURE_BILL_AUTHORING.fxFixtureBadge}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain("THB");
    expect(html).toContain("USDC");
    expect(html).toContain("Fixture rate");
    // Selection is a radio, not a native select (POLISH-SPEC §1.4, §6.1).
    expect(html).toContain('role="radiogroup"');
    expect(html).not.toContain("<select");
  });

  it("AC5 — primary action reads Add items", () => {
    const html = renderBill(
      <BillAuthoringSurface tabId="tabs:fixture" viewerUserId="users:andre" data={FIXTURE_EMPTY_BILL} />,
    );
    expect(html).toContain("Add items");
  });

  it("AC3 — states no mechanism on setup", () => {
    const html = renderToStaticMarkup(
      <NewTabForm
        title="Dinner"
        merchantName=""
        displayCurrency="THB"
        payerUserId="users:andre"
        members={FIXTURE_BILL_AUTHORING.members}
        captureMethod="manual"
        onChange={() => undefined}
      />,
    );
    expect(html).not.toMatch(/solana|wallet address/i);
    // §1.4 deletes the recipient controls and the receiving-wallet sentence:
    // the recipient is the payer, and the receiving asset lives on You.
    expect(html).not.toMatch(/recipient/i);
    expect(html).not.toContain("resolved when the tab is locked");
  });

  it("§1.4 — offers a capture method, and hides Scan receipt when it is unwired", () => {
    const html = renderToStaticMarkup(
      <NewTabForm
        title="Dinner"
        merchantName=""
        displayCurrency="THB"
        payerUserId="users:andre"
        members={FIXTURE_BILL_AUTHORING.members}
        captureMethod="manual"
        onChange={() => undefined}
      />,
    );
    expect(html).toContain("Add the items");
    expect(html).toContain("Add manually");
    // Never shown disabled — absent (§1.4).
    expect(html).not.toContain("Scan receipt");
  });

  it("INVITE-FLOW §4 — a personal tab asks how many people, not how to capture", () => {
    const html = renderToStaticMarkup(
      <NewTabForm
        title="Dinner"
        merchantName=""
        displayCurrency="THB"
        payerUserId="users:andre"
        members={[FIXTURE_BILL_AUTHORING.members[0]!]}
        captureMethod="manual"
        seats={4}
        showCapture={false}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain("How many people");
    expect(html).toContain("aria-label=\"Fewer people\"");
    expect(html).toContain("aria-label=\"More people\"");
    expect(html).not.toContain("Add the items");
    expect(html).not.toContain("Scan receipt");
  });

  it("§1.4 — shows Scan receipt when the Convex capability is wired", () => {
    const html = renderToStaticMarkup(
      <NewTabForm
        title="Dinner"
        merchantName=""
        displayCurrency="THB"
        payerUserId="users:andre"
        members={FIXTURE_BILL_AUTHORING.members}
        captureMethod="scan"
        scanAvailable
        onChange={() => undefined}
      />,
    );
    expect(html).toContain("Scan receipt");
    expect(html).not.toMatch(/\b(AI|magic|sparkle)\b/);
  });
});

describe("Story 4.2 — item list and empty states", () => {
  it("AC4 — renders Thai item names", () => {
    const html = renderBill(
      <BillAuthoringSurface tabId="tabs:fixture" viewerUserId="users:andre" data={FIXTURE_BILL_AUTHORING} />,
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

  // The organizer check used to resolve `true` on every path, so this branch was
  // unreachable in the running app (POLISH-SPEC §1.4).
  it("§1.4 — a viewer who is not the organizer gets the read-only branch", () => {
    const html = renderBill(
      <BillAuthoringSurface
        tabId="tabs:fixture"
        viewerUserId="users:maya"
        data={FIXTURE_EMPTY_BILL}
      />,
    );
    expect(html).toContain("Andre is adding the bill");
    expect(html).not.toContain("new-tab-form");
  });

  it("§1.4 — Save item is unavailable until the item has a name and a price", () => {
    const html = renderToStaticMarkup(
      <ItemEditor
        name=""
        quantity={1}
        unitPriceBaht={0}
        onChange={() => undefined}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(html).toContain("disabled");
    expect(html).not.toContain("(minor)");
  });
});

describe("Story 4.3 — adjustments and totals", () => {
  it("AC3 — shows labelled adjustment lines", () => {
    const html = renderBill(
      <BillAuthoringSurface tabId="tabs:fixture" viewerUserId="users:andre" data={FIXTURE_BILL_AUTHORING} />,
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
    // Tabular-width numeral placeholders inside the reserved amount column, so
    // nothing shifts when the real figure arrives (§4.1).
    expect(html).toContain("5.5ch");
    expect(html).toContain("mytab-row__amount");
  });

  it("AC4 — offline bar copy", () => {
    const html = renderToStaticMarkup(<OfflineBar visible />);
    expect(html).toMatch(/offline/i);
    expect(html).toMatch(/catch up/i);
  });
});

/*
 * The dead-end that shipped: the setup footer could be disabled with nothing on
 * screen explaining it, and the draft froze the first (empty) Convex read so the
 * roster never arrived. Both are §4.4 failures — a control that goes silent.
 */
describe("New Tab — the primary action always states its reason", () => {
  it("names the write lock rather than sitting mute on a personal draft", () => {
    const html = renderBill(
      <BillAuthoringSurface
        tabId="tabs:new"
        viewerUserId="users:andre"
        data={{ ...FIXTURE_EMPTY_BILL, origin: "personal", seats: 4 }}
      />,
    );

    // No Convex client in this environment, so the create mutation is absent.
    expect(html).toContain("Open this in Telegram to make changes.");
    expect(html).toContain("disabled");
  });

  it("names an empty title rather than sitting mute", () => {
    const html = renderBill(
      <BillAuthoringSurface
        tabId="tabs:new:groups:fixture"
        viewerUserId="users:andre"
        data={{ ...FIXTURE_EMPTY_BILL, origin: "chat", title: "   " }}
      />,
    );

    expect(html).toContain("Give this tab a name first.");
  });

  it("reads the roster through from data rather than from a frozen first paint", () => {
    // `members` arriving late is the normal case: `viewerIdentity` and
    // `listTabMemberOptions` both resolve after first paint. The surface must
    // render whatever `data` currently says, never a copy taken at mount.
    //
    // Asserted on the *group* door, because that is the only one with a roster
    // to read: the personal form asks for a name and a head count and nothing
    // else, so "Who paid?" is not on it to be frozen.
    const html = renderBill(
      <BillAuthoringSurface
        tabId="tabs:new:groups:fixture"
        viewerUserId="users:andre"
        data={{ ...FIXTURE_EMPTY_BILL, origin: "chat" }}
      />,
    );

    expect(html).not.toContain("Nobody in this group has opened My Tab yet");
    for (const member of FIXTURE_EMPTY_BILL.members) {
      expect(html).toContain(member.displayName.trim().charAt(0).toUpperCase());
    }
  });

  /*
   * The personal door asks two questions, not five.
   *
   * "Where" and "Who paid?" were answerable but pointless — the merchant is on
   * the receipt, and the roster on a personal tab is the viewer alone. The
   * currency pair was worse than pointless: THB and USDC are not alternatives
   * to one another. The bill is denominated in local fiat and the token is the
   * payer's own choice at settlement, so offering them as one radio group made
   * the create screen state something untrue about how the product works.
   */
  it("the personal door asks for a name and a head count, and nothing else", () => {
    const html = renderBill(
      <BillAuthoringSurface
        tabId="tabs:new"
        viewerUserId="users:andre"
        data={{ ...FIXTURE_EMPTY_BILL, origin: "personal", seats: 4 }}
      />,
    );

    expect(html).toContain("What&#x27;s this tab for?");
    expect(html).toContain("How many people");
    expect(html).toContain("Start tab");

    expect(html).not.toContain("Where");
    expect(html).not.toContain("Currency");
    expect(html).not.toContain("Who paid?");
    // The settlement token never appears on a screen about a restaurant bill.
    expect(html).not.toContain("USDC");
  });
});
