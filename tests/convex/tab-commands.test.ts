import { describe, expect, it } from "vitest";
import { buildTelegramDeepLink, FIXTURE_TELEGRAM_BOT_USERNAME } from "../../convex/lib/telegramDeepLink";
import { normalizeBotCommand, BOT_COMMANDS } from "../../convex/lib/tabCommandSync";

describe("Story 2.3 — deep link format (AC2)", () => {
  it("builds t.me deep links with only an opaque token", () => {
    const token = "abc123opaque";
    const url = buildTelegramDeepLink(token);
    expect(url).toBe(
      `https://t.me/${FIXTURE_TELEGRAM_BOT_USERNAME}/app?startapp=${encodeURIComponent(token)}`,
    );
    expect(url).not.toMatch(/group|wallet|amount|-100/);
  });
});

describe("Story 2.5 — command routing (AC1)", () => {
  it("registers all four bot commands", () => {
    expect(BOT_COMMANDS).toEqual(["tab", "splitbill", "tip", "balance"]);
  });

  it("routes /splitbill to the same handler key as /tab", () => {
    expect(normalizeBotCommand("splitbill")).toBe("splitbill");
    expect(normalizeBotCommand("tab")).toBe("tab");
  });

  it("returns null for unsupported commands", () => {
    expect(normalizeBotCommand("help")).toBeNull();
    expect(normalizeBotCommand(null)).toBeNull();
  });
});
