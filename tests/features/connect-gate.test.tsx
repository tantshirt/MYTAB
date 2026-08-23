import React, { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectGateView, shouldShowConnectGate } from "@/features/auth/ConnectGateView";
import { CONNECT_COPY } from "@/features/auth/connectCopy";
import { LaunchSurface } from "@/features/auth/LaunchSurface";

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

describe("D-25 / D-27 — connect gate", () => {
  it("does not prompt a returning person with a linked wallet", () => {
    expect(shouldShowConnectGate({ linked: true, skipped: false })).toBe(false);
    const html = render(
      <ConnectGateView linked skipped={false}>
        <p>Claim Board</p>
      </ConnectGateView>,
    );
    expect(html).toContain("Claim Board");
    expect(html).not.toContain(CONNECT_COPY.phantom);
  });

  it("skip still reaches the board", () => {
    expect(shouldShowConnectGate({ linked: false, skipped: true })).toBe(false);
    const html = render(
      <ConnectGateView linked={false} skipped>
        <p>Claim Board</p>
      </ConnectGateView>,
    );
    expect(html).toContain("Claim Board");
    expect(html).not.toContain(CONNECT_COPY.title);
  });

  it("first-timers see named wallets, My Tab wallet, and skip", () => {
    const html = render(
      <ConnectGateView linked={false} skipped={false}>
        <p>Claim Board</p>
      </ConnectGateView>,
    );
    expect(html).toContain(CONNECT_COPY.title);
    expect(html).toContain(CONNECT_COPY.phantom);
    expect(html).toContain(CONNECT_COPY.solflare);
    expect(html).toContain(CONNECT_COPY.backpack);
    expect(html).toContain(CONNECT_COPY.embedded);
    expect(html).toContain(CONNECT_COPY.skip);
    expect(html).not.toContain("Claim Board");
    expect(html.toLowerCase()).not.toContain("connect wallet");
    expect(html).toContain("font-size:28px");
    expect(html).toContain("Bring the wallet you already use.");
    expect(html).toContain("-webkit-text-fill-color:#FFFFFF");
  });

  it("skip from the sheet reveals the board (D-27)", () => {
    function Harness() {
      const [skipped, setSkipped] = useState(false);
      return (
        <ConnectGateView linked={false} skipped={skipped} onSkip={() => setSkipped(true)}>
          <p>Claim Board</p>
        </ConnectGateView>
      );
    }

    const first = render(<Harness />);
    expect(first).toContain(CONNECT_COPY.skip);
    expect(first).not.toContain("Claim Board");

    const skipped = render(
      <ConnectGateView linked={false} skipped>
        <p>Claim Board</p>
      </ConnectGateView>,
    );
    expect(skipped).toContain("Claim Board");
  });

  it("Launch loading beat still has no buttons", () => {
    const html = render(<LaunchSurface />);
    expect(html).not.toContain("button");
    expect(html).not.toContain("Connect wallet");
  });
});
