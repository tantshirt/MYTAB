import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DisclosureRow } from "@/components/primitives/disclosure-row";
import { ListCard } from "@/components/primitives/list-card";
import { ListRow } from "@/components/primitives/list-row";
import { NoticeBar } from "@/components/primitives/notice-bar";
import { MYTAB_COLORS } from "@/lib/theme/tokens";

describe("POLISH-SPEC §3.1 — list row primitives", () => {
  it("rows are 56px tall, comfortably over the 44px floor", () => {
    const html = renderToStaticMarkup(<ListRow label="Export wallet" />);
    expect(html).toContain("min-height:56px");
  });

  it("the label truncates and the trailing slot never shrinks", () => {
    const html = renderToStaticMarkup(
      <ListRow label="A very long label that must ellipse" trailing={<span>x</span>} />,
    );
    expect(html).toContain("text-overflow:ellipsis");
    expect(html).toContain("min-width:0");
    expect(html).toContain("flex:none");
  });

  it("renders an anchor for href and a button for onPress", () => {
    const link = renderToStaticMarkup(<ListRow label="Help" href="https://t.me/x" external />);
    expect(link).toContain("<a ");
    expect(link).toContain('target="_blank"');

    const button = renderToStaticMarkup(<ListRow label="Help" ariaExpanded={false} />);
    expect(button).toContain("<button");
  });

  it("a disabled row states its reason on the sub line rather than going silent", () => {
    const html = renderToStaticMarkup(
      <ListRow label="Export wallet" sub="Needs a connection." disabled />,
    );
    expect(html).toContain("disabled");
    expect(html).toContain("Needs a connection.");
    expect(html).toContain(MYTAB_COLORS.inkMuted);
  });

  it("a card holds many rows with hairlines between them, not one card per row", () => {
    const html = renderToStaticMarkup(
      <ListCard label="WALLET">
        <ListRow label="One" />
        <ListRow label="Two" />
        <ListRow label="Three" />
      </ListCard>,
    );
    // One rounded card.
    expect(html.match(/border-radius:12px/g) ?? []).toHaveLength(1);
    // Two hairlines for three rows — the last row carries none.
    expect(html.match(/border-bottom:1px solid #DFE7EF/gi) ?? []).toHaveLength(2);
    expect(html).toContain("WALLET");
  });
});

describe("POLISH-SPEC §3.2 / DESIGN.md — disclosure-row", () => {
  const html = renderToStaticMarkup(
    <DisclosureRow id="panel-1" label="Receiving" value="You always receive USDC">
      Explainer copy.
    </DisclosureRow>,
  );

  it("is collapsed on every open and never remembers", () => {
    expect(html).toContain('aria-expanded="false"');
  });

  it("controls a panel that is hidden, not removed from the DOM", () => {
    expect(html).toContain('aria-controls="panel-1"');
    expect(html).toContain('id="panel-1"');
    expect(html).toContain("hidden");
    expect(html).toContain("Explainer copy.");
  });

  it("puts the contents on colors/paper, not in a second card", () => {
    expect(html.toLowerCase()).toContain(MYTAB_COLORS.paper.toLowerCase());
  });

  it("rotates its chevron over 140ms — the one sanctioned row transition", () => {
    expect(html).toContain("transform 140ms ease");
  });
});

describe("POLISH-SPEC §4.4 / §4.5 — notice bar", () => {
  it("is a polite status region, never a modal or a toast", () => {
    const html = renderToStaticMarkup(<NoticeBar>You&apos;re offline. We&apos;ll catch up.</NoticeBar>);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html.toLowerCase()).toContain(MYTAB_COLORS.warningSoft.toLowerCase());
  });

  it("has a quiet tone for the outside-Telegram case", () => {
    const html = renderToStaticMarkup(<NoticeBar tone="quiet">Open this in Telegram to make changes.</NoticeBar>);
    expect(html.toLowerCase()).toContain(MYTAB_COLORS.sunk.toLowerCase());
  });
});
