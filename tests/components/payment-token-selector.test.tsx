import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  JUPITER_PICKER_FOOTER,
  PaymentTokenSelector,
  type PaymentTokenOption,
} from "@/components/settlement-sheet/PaymentTokenSelector";
import { YouSurface } from "@/features/you/YouSurface";
import { FIXTURE_YOU_SURFACE } from "@/tests/fixtures/you";
import { JUPITER_ATTRIBUTION } from "@/lib/tokens/jupiter";

function render(tokens: PaymentTokenOption[]) {
  return renderToStaticMarkup(
    <PaymentTokenSelector tokens={tokens} selectedId={tokens[0]?.id ?? ""} onSelect={() => undefined} />,
  );
}

const USDC: PaymentTokenOption = {
  id: "usdc",
  name: "USDC",
  balanceLabel: "12.40 USDC",
  affordable: true,
  logoUri: "https://example.test/usdc.png",
  isVerified: true,
};

const LOOKALIKE: PaymentTokenOption = {
  id: "fake",
  name: "USDC",
  balanceLabel: "4.00 USDC",
  affordable: true,
  logoUri: "https://example.test/fake.png",
  isVerified: false,
};

const OMITTED: PaymentTokenOption = {
  id: "bonk",
  name: "Bonk",
  balanceLabel: "1.00 Bonk",
  affordable: true,
  logoUri: "https://example.test/bonk.png",
};

describe("PaymentTokenSelector — D-22 / D-09 / U-1", () => {
  it("renders logos from metadata", () => {
    const html = render([USDC]);
    expect(html).toContain('src="https://example.test/usdc.png"');
  });

  it("shows the verified badge only when isVerified === true", () => {
    const verified = render([USDC]);
    expect(verified).toContain('aria-label="Verified"');

    const unverified = render([LOOKALIKE]);
    expect(unverified).not.toContain('aria-label="Verified"');

    const omitted = render([OMITTED]);
    expect(omitted).not.toContain('aria-label="Verified"');
  });

  it("prints Powered by Jupiter exactly, and only on this picker", () => {
    const picker = render([USDC]);
    expect(JUPITER_PICKER_FOOTER).toBe("Powered by Jupiter");
    expect(JUPITER_PICKER_FOOTER).toBe(JUPITER_ATTRIBUTION);
    expect(picker).toContain("Powered by Jupiter");

    const you = renderToStaticMarkup(<YouSurface data={FIXTURE_YOU_SURFACE} />);
    expect(you).not.toContain("Powered by Jupiter");
  });

  it("keeps banned settlement words off the picker", () => {
    const html = render([USDC, LOOKALIKE]);
    expect(html).not.toMatch(/execute|swap|broadcast|signature|mint|blockhash|\broute\b|slippage/i);
  });
});
