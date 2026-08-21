import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LaunchSurface, launchSurfaceCopy } from "@/features/auth/LaunchSurface";

describe("Story 1.4 — Launch surface (UX-DR24)", () => {
  it("renders the wordmark, indeterminate indicator, and launch copy", () => {
    const html = renderToStaticMarkup(<LaunchSurface />);

    expect(html).toContain("My Tab");
    expect(html).toContain(launchSurfaceCopy);
    expect(html).toContain('role="progressbar"');
    expect(html).not.toContain("button");
    expect(html).not.toContain("Sign in");
    expect(html).not.toContain("Connect wallet");
  });
});
