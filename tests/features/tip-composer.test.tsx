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
