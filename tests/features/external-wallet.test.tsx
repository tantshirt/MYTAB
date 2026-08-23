import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExternalWalletConnect } from "@/features/auth/ExternalWalletConnect";
import { CONNECT_COPY } from "@/features/auth/connectCopy";

describe("External wallet connect — D-21 / D-28", () => {
  it("names Phantom, Solflare and Backpack and no fourth wallet", () => {
    const html = renderToStaticMarkup(<ExternalWalletConnect />);
    expect(html).toContain(CONNECT_COPY.phantom);
    expect(html).toContain(CONNECT_COPY.solflare);
    expect(html).toContain(CONNECT_COPY.backpack);
    expect(html).not.toContain("Rainbow");
    expect(html).not.toContain("Connect external wallet");
    expect(html).not.toContain("Preview only");
  });
});
