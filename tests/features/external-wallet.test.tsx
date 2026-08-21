import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExternalWalletConnect } from "@/features/auth/ExternalWalletConnect";

describe("Story 1.10 — External wallet stub", () => {
  it("renders nothing when the feature flag is off", () => {
    const html = renderToStaticMarkup(<ExternalWalletConnect />);
    expect(html).toBe("");
  });

  it("renders the connect stub when the feature flag is enabled", () => {
    const previous = process.env.NEXT_PUBLIC_FEATURE_EXTERNAL_WALLET;
    process.env.NEXT_PUBLIC_FEATURE_EXTERNAL_WALLET = "true";

    try {
      const html = renderToStaticMarkup(<ExternalWalletConnect />);
      expect(html).toContain("Connect external wallet");
      expect(html).toContain("Use your own wallet");
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_FEATURE_EXTERNAL_WALLET;
      } else {
        process.env.NEXT_PUBLIC_FEATURE_EXTERNAL_WALLET = previous;
      }
    }
  });
});
