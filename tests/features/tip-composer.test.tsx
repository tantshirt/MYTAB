import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TipComposer } from "@/features/tips/TipComposer";

const MEMBERS = [
  {
    userId: "users:viewer",
    displayName: "Andre",
    membershipStatus: "active" as const,
    walletReady: true,
  },
  {
    userId: "users:maya",
    displayName: "Maya",
    membershipStatus: "active" as const,
    walletReady: true,
  },
  {
    userId: "users:no-wallet",
    displayName: "Noi",
    membershipStatus: "active" as const,
    walletReady: false,
  },
];

describe("Story 3.1 — Tip Composer", () => {
  it("lists verified members as people without wallet addresses", () => {
    const html = renderToStaticMarkup(
      <TipComposer members={MEMBERS} viewerUserId="users:viewer" preselectedRecipientUserId="users:maya" />,
    );

    expect(html).toContain("Send a tip");
    expect(html).toContain("Maya");
    expect(html).not.toContain("users:maya");
    expect(html).not.toContain("wallet");
    expect(html).not.toContain("Noi");
  });

  it("renders preset amounts and optional note field", () => {
    const html = renderToStaticMarkup(
      <TipComposer members={MEMBERS} viewerUserId="users:viewer" />,
    );

    expect(html).toContain("฿20");
    expect(html).toContain("฿100");
    expect(html).toContain("Say something nice");
    expect(html).toContain("🙏");
    expect(html).toContain("Send tip");
  });
});

describe("POLISH-SPEC §4 — Tip Composer states", () => {
  it("§4.2 — no eligible recipients", () => {
    const html = renderToStaticMarkup(
      <TipComposer members={[MEMBERS[0]!]} viewerUserId="users:viewer" />,
    );
    expect(html).toContain("Nobody here has opened My Tab yet. Once they do, you can tip them.");
  });

  it("§4.3 — a failed send names its next action", () => {
    const html = renderToStaticMarkup(
      <TipComposer members={MEMBERS} viewerUserId="users:viewer" sendFailed />,
    );
    expect(html).toContain("Couldn&#x27;t send the tip. Try again.");
  });

  it("§4.4 / §4.5 — money never moves offline or outside Telegram, and the reason is stated", () => {
    const offline = renderToStaticMarkup(
      <TipComposer members={MEMBERS} viewerUserId="users:viewer" offline />,
    );
    expect(offline).toContain("You&#x27;re offline. We&#x27;ll catch up.");
    expect(offline).toContain("Needs a connection.");
    expect(offline).toContain("disabled");

    const browser = renderToStaticMarkup(
      <TipComposer members={MEMBERS} viewerUserId="users:viewer" inTelegram={false} />,
    );
    expect(browser).toContain("Open this in Telegram to make changes.");
  });

  it("the hero amount reads as money, not digits", () => {
    const html = renderToStaticMarkup(
      <TipComposer members={MEMBERS} viewerUserId="users:viewer" />,
    );
    expect(html).toContain('aria-label="100 baht"');
  });
});
