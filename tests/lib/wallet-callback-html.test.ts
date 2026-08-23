import { describe, expect, it } from "vitest";
import { renderWalletCallbackHtml } from "@/lib/telegram/walletResumeLinks";

describe("wallet callback HTML", () => {
  it("always offers Open Telegram when site or bot creds are missing", () => {
    const html = renderWalletCallbackHtml({ resumeHttps: null, resumeTg: null });
    expect(html).toContain("Open Telegram");
    expect(html).toContain("href=\"https://t.me\"");
  });

  it("offers both https and tg links when a resume URL exists", () => {
    const html = renderWalletCallbackHtml({
      resumeHttps: "https://t.me/mytab_bot/app?startapp=ulcb_k57abc",
      resumeTg: "tg://resolve?domain=mytab_bot&appname=app&startapp=ulcb_k57abc",
    });
    expect(html).toContain("Open Telegram");
    expect(html).toContain("https://t.me/mytab_bot/app?startapp=ulcb_k57abc");
    expect(html).toContain("tg://resolve?domain=mytab_bot");
  });
});
