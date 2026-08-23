import { describe, expect, it } from "vitest";
import { needsUniversalLinkWallet } from "@/lib/wallet/platform";

describe("needsUniversalLinkWallet — U-10 device path", () => {
  it("uses universal links in a Telegram WebView when nothing is injected", () => {
    expect(
      needsUniversalLinkWallet(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Telegram-Android",
        true,
      ),
    ).toBe(true);
    expect(
      needsUniversalLinkWallet(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Telegram",
        true,
      ),
    ).toBe(true);
  });

  it("does not force UL on desktop Chrome outside Telegram", () => {
    expect(
      needsUniversalLinkWallet(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
        false,
      ),
    ).toBe(false);
  });

  it("still uses UL on iPhone even without a Telegram flag", () => {
    expect(
      needsUniversalLinkWallet(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        false,
      ),
    ).toBe(true);
  });
});
