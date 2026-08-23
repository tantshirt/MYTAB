import { describe, expect, it } from "vitest";
import {
  buildNamedWalletOpenUrls,
  buildWalletOpenHopUrl,
  isAllowedNamedWalletHttps,
  parseWalletOpenSearch,
} from "@/lib/wallet/openNamedWallet";

const PHANTOM =
  "https://phantom.app/ul/v1/connect?app_url=https%3A%2F%2Fexample.com&dapp_encryption_public_key=abc&redirect_link=https%3A%2F%2Fexample.com%2Fwallet%2Fcallback";
const SOLFLARE =
  "https://solflare.com/ul/v1/connect?app_url=https%3A%2F%2Fexample.com";
const BACKPACK =
  "https://backpack.app/ul/v1/signMessage?dapp_encryption_public_key=abc";

describe("openNamedWallet", () => {
  it("builds scheme and Android intent for the three named hosts", () => {
    const phantom = buildNamedWalletOpenUrls(PHANTOM);
    expect(phantom?.provider).toBe("phantom");
    expect(phantom?.scheme.startsWith("phantom://v1/connect?")).toBe(true);
    expect(phantom?.androidIntent).toContain("package=app.phantom");
    expect(phantom?.androidIntent).toContain("host=phantom.app");

    const solflare = buildNamedWalletOpenUrls(SOLFLARE);
    expect(solflare?.scheme.startsWith("solflare://ul/v1/connect?")).toBe(true);
    expect(solflare?.androidIntent).toContain("package=com.solflare.mobile");

    const backpack = buildNamedWalletOpenUrls(BACKPACK);
    expect(backpack?.scheme.startsWith("backpack://ul/v1/signMessage?")).toBe(true);
    expect(backpack?.androidIntent).toContain("package=app.backpack.mobile");
  });

  it("refuses anything except the three named hosts", () => {
    expect(isAllowedNamedWalletHttps("https://evil.example/ul/v1/connect")).toBe(false);
    expect(buildNamedWalletOpenUrls("https://phantom.app.evil/ul/v1/connect")).toBeNull();
    expect(parseWalletOpenSearch("?provider=phantom&u=https%3A%2F%2Fevil.example%2Fx")).toBeNull();
  });

  it("rebuilds hop search only when provider matches the host", () => {
    const hop = buildWalletOpenHopUrl(PHANTOM, "https://app.example");
    expect(hop).toBe(
      `https://app.example/wallet/open?provider=phantom&u=${encodeURIComponent(PHANTOM)}`,
    );
    const parsed = parseWalletOpenSearch(new URL(hop!).search);
    expect(parsed?.https).toBe(PHANTOM);
    expect(
      parseWalletOpenSearch(`?provider=solflare&u=${encodeURIComponent(PHANTOM)}`),
    ).toBeNull();
  });
});
