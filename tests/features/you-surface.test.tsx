import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ManageWalletSheet } from "@/features/you/ManageWalletSheet";
import { YOU_COPY } from "@/features/you/copy";
import {
  FIXTURE_YOU_LOADING,
  FIXTURE_YOU_PROVISIONING,
  FIXTURE_YOU_SURFACE,
  FIXTURE_YOU_VIEWER_ERROR,
  FIXTURE_YOU_WALLET_FAILED,
} from "@/features/you/fixture";
import { elideWalletKey } from "@/features/you/useCopyKey";
import { YouSurface } from "@/features/you/YouSurface";
import { MYTAB_COLORS } from "@/lib/theme/tokens";

/** Static markup with entities decoded, so assertions read as the copy does. */
function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

const READY = render(<YouSurface data={FIXTURE_YOU_SURFACE} />);

describe("POLISH-SPEC §3.2 — the You surface, row by row", () => {
  it("leads with a name and a face, never a key", () => {
    expect(READY.indexOf("Andre")).toBeGreaterThan(-1);
    expect(READY.indexOf("Andre")).toBeLessThan(READY.indexOf(YOU_COPY.walletRowLabel));
    expect(READY).toContain("@andre");
  });

  it("omits the username line entirely when there is none", () => {
    const html = render(
      <YouSurface
        data={{
          ...FIXTURE_YOU_SURFACE,
          viewer: { userId: "user-noi", firstName: "Noi" },
        }}
      />,
    );
    expect(html).toContain("Noi");
    expect(html).not.toContain(">@");
  });

  it("shows the key elided, as a value under its label", () => {
    expect(READY).toContain(YOU_COPY.walletRowLabel);
    expect(READY).toContain("7xKX…9mPq");
    expect(READY).not.toContain("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJos9mPq");
  });

  it("never says address", () => {
    expect(READY.toLowerCase()).not.toContain("address");
  });

  it("names the copy action for a screen reader, not the key", () => {
    expect(READY).toContain(`aria-label="${YOU_COPY.copyRowAriaLabel}"`);
    expect(READY).toContain('aria-live="polite"');
  });

  it("states the receiving fact in place instead of a dead-end screen", () => {
    expect(READY).toContain(YOU_COPY.receivingLabel);
    expect(READY).toContain(YOU_COPY.receivingValue);
    expect(READY).toContain(YOU_COPY.receivingExplainer);
    expect(READY).toContain('aria-controls="you-receiving-panel"');
  });

  it("offers export with its plain-language sub line", () => {
    expect(READY).toContain(YOU_COPY.exportLabel);
    expect(READY).toContain(YOU_COPY.exportSub);
  });

  it("puts Manage wallet inline as a secondary button, not pinned above the tab bar", () => {
    expect(READY).toContain(YOU_COPY.manageWallet);
    expect(READY).toContain('class="mytab-button-secondary"');
    expect(READY).not.toContain("position:fixed");
  });

  it("does the trust work in the About card", () => {
    expect(READY).toContain(YOU_COPY.aboutSection);
    expect(READY).toContain(YOU_COPY.splitsLabel);
    expect(READY).toContain(YOU_COPY.splitsExplainer);
    expect(READY).toContain(YOU_COPY.helpLabel);
  });

  it("closes with the holds-no-keys note and a build line", () => {
    expect(READY).toContain(YOU_COPY.footerNote);
    expect(READY).toContain("My Tab · build 2026.08.22");
  });

  it("offers no Disconnect, Sign out or Delete account", () => {
    const lower = READY.toLowerCase();
    expect(lower).not.toContain("disconnect");
    expect(lower).not.toContain("sign out");
    expect(lower).not.toContain("log out");
    expect(lower).not.toContain("delete account");
  });
});

describe("POLISH-SPEC §3.3 — what the artboard loses", () => {
  it("has no Notifications toggle — the bot posts to the group, never to a person", () => {
    expect(READY).not.toContain("Notifications");
    expect(READY).not.toContain('type="checkbox"');
    expect(READY).not.toContain('role="switch"');
  });
});

describe("POLISH-SPEC §3.4 — states", () => {
  it("first paint is static sunk geometry — no spinner, no shimmer", () => {
    const html = render(<YouSurface data={FIXTURE_YOU_LOADING} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(`aria-label="${YOU_COPY.loadingLabel}"`);
    expect(html.toLowerCase()).toContain(MYTAB_COLORS.sunk.toLowerCase());
    expect(html).not.toContain("animation");
    expect(html).not.toContain("Andre");
  });

  it("a failed viewer names its next action and leaves the cards standing", () => {
    const html = render(<YouSurface data={FIXTURE_YOU_VIEWER_ERROR} />);
    expect(html).toContain(YOU_COPY.viewerFailed);
    expect(html).toContain(YOU_COPY.retry);
    expect(html).toContain('class="mytab-link-button"');
    expect(html).toContain(YOU_COPY.walletRowLabel);
    expect(html).toContain(YOU_COPY.splitsLabel);
  });

  it("wallet provisioning is not an error and carries no warning colour", () => {
    const html = render(<YouSurface data={FIXTURE_YOU_PROVISIONING} />);
    expect(html).toContain(YOU_COPY.provisioning);
    expect(html.toLowerCase()).not.toContain(MYTAB_COLORS.owed.toLowerCase());
    expect(html.toLowerCase()).not.toContain(MYTAB_COLORS.warning.toLowerCase());
    // Export and Manage wallet are disabled, with the reason stated.
    expect(html.match(/disabled=""/g) ?? []).toHaveLength(2);
  });

  it("a failed wallet setup states the fix and offers no retry button", () => {
    const html = render(<YouSurface data={FIXTURE_YOU_WALLET_FAILED} />);
    expect(html).toContain(YOU_COPY.provisioningFailed);
    expect(html).toContain(MYTAB_COLORS.owed);
    expect(html).not.toContain(YOU_COPY.retry);
  });

  it("offline keeps the reads and disables the changes with a reason", () => {
    const html = render(<YouSurface data={FIXTURE_YOU_SURFACE} offline />);
    expect(html).toContain(YOU_COPY.offline);
    expect(html.match(new RegExp(YOU_COPY.needsConnection, "g")) ?? []).toHaveLength(2);
    expect(html).toContain("7xKX…9mPq");
    expect(html.match(/disabled=""/g) ?? []).toHaveLength(2);
  });

  it("outside Telegram keeps reads and repeats the sentence on the disabled row", () => {
    const html = render(
      <YouSurface data={FIXTURE_YOU_SURFACE} inTelegram={false} />,
    );
    // Once in the bar, once on each disabled control — never a silent grey.
    expect(html.match(new RegExp(YOU_COPY.outsideTelegram, "g")) ?? []).toHaveLength(3);
    expect(html).toContain("7xKX…9mPq");
    // Help becomes an ordinary external link.
    expect(html).toContain('target="_blank"');
  });

  it("has no empty state — a viewer always has a name and a wallet", () => {
    expect(Object.keys(YOU_COPY)).not.toContain("empty");
    expect(READY).not.toContain("Nothing yet");
    expect(READY).not.toContain("No tabs yet");
  });
});

describe("POLISH-SPEC §3.2 — Manage wallet sheet", () => {
  const sheet = render(
    <ManageWalletSheet
      open
      publicKey={FIXTURE_YOU_SURFACE.wallet.kind === "ready" ? FIXTURE_YOU_SURFACE.wallet.publicKey : ""}
      onDismiss={() => undefined}
    />,
  );

  /*
   * The sheet is now `components/settlement-sheet/SheetContainer` rather than a
   * second hand-rolled shell, so the scrim literal is that component's — the same
   * colour, written with the spaces it uses. The dialog role, the modal flag, the
   * scrim and the 36×4 grab handle are all still asserted; only the exact string
   * the scrim is written with moved.
   */
  it("is a dismissible dialog with a grab handle over a scrim", () => {
    expect(sheet).toContain('role="dialog"');
    expect(sheet).toContain('aria-modal="true"');
    expect(sheet).toContain("rgba(10, 32, 56, 0.38)");
    expect(sheet).toContain("width:36px;height:4px");
    expect(sheet).toContain('aria-label="Dismiss"');
  });

  it("shows the whole key, never elided", () => {
    expect(sheet).toContain("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJos9mPq");
    expect(sheet).toContain("word-break:break-all");
  });

  it("carries copy and export, and hides the external-wallet row behind its flag", () => {
    expect(sheet).toContain(YOU_COPY.sheet.copyKey);
    expect(sheet).toContain(YOU_COPY.sheet.exportLabel);
    expect(sheet).toContain(YOU_COPY.sheet.exportSub);
    expect(sheet).not.toContain(YOU_COPY.sheet.connectOther);
  });

  it("is closed until asked for", () => {
    const closed = render(
      <ManageWalletSheet open={false} publicKey="x" onDismiss={() => undefined} />,
    );
    expect(closed).toBe("");
  });
});

describe("elideWalletKey", () => {
  it("keeps four glyphs at each end", () => {
    expect(elideWalletKey("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJos9mPq")).toBe("7xKX…9mPq");
  });

  it("leaves a short value alone", () => {
    expect(elideWalletKey("7xKX9mPq")).toBe("7xKX9mPq");
  });
});

describe("PRODUCT.md — banned words never reach the eye", () => {
  const BANNED = [
    "execute",
    "swap",
    "route",
    "approve",
    "broadcast",
    "transaction",
    "signature",
    "mint",
    "ATA",
    "gas",
    "lamports",
    "slippage",
    "blockhash",
    "RPC",
    "wallet address",
    "AI",
    "powered by",
    "seamless",
  ];

  function flatten(value: unknown): string[] {
    if (typeof value === "string") {
      return [value];
    }
    if (value && typeof value === "object") {
      return Object.values(value).flatMap(flatten);
    }
    return [];
  }

  it("checks every string on the surface", () => {
    const strings = flatten(YOU_COPY);
    expect(strings.length).toBeGreaterThan(20);
    for (const copy of strings) {
      for (const word of BANNED) {
        expect(
          new RegExp(`\\b${word}\\b`, "i").test(copy),
          `"${copy}" contains the banned word "${word}"`,
        ).toBe(false);
      }
    }
  });
});
