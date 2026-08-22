import { afterEach, describe, expect, it } from "vitest";
import { buildTelegramDeepLink } from "../../convex/lib/telegramDeepLink";
import { RuntimeGuardError } from "../../lib/solana/runtimeGuard";
import { normalizeBotCommand, BOT_COMMANDS } from "../../convex/lib/tabCommandSync";

describe("Story 2.3 — deep link format (AC2)", () => {
  const previousBot = process.env.TELEGRAM_BOT_USERNAME;
  const previousApp = process.env.TELEGRAM_MINIAPP_NAME;

  afterEach(() => {
    restore("TELEGRAM_BOT_USERNAME", previousBot);
    restore("TELEGRAM_MINIAPP_NAME", previousApp);
  });

  function restore(key: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  it("builds t.me deep links with only an opaque token", () => {
    process.env.TELEGRAM_BOT_USERNAME = "mytab_live_bot";
    process.env.TELEGRAM_MINIAPP_NAME = "app";
    const token = "abc123opaque";
    const url = buildTelegramDeepLink(token);
    expect(url).toBe(
      `https://t.me/mytab_live_bot/app?startapp=${encodeURIComponent(token)}`,
    );
    expect(url).not.toMatch(/group|wallet|amount|-100/);
  });

  it("accepts a configured username written with a leading @", () => {
    process.env.TELEGRAM_BOT_USERNAME = "@mytab_live_bot";
    process.env.TELEGRAM_MINIAPP_NAME = "app";
    expect(buildTelegramDeepLink("t")).toBe("https://t.me/mytab_live_bot/app?startapp=t");
  });

  it("throws rather than minting a link to a bot that does not exist", () => {
    // A fallback username here produces a link that looks valid, opens
    // Telegram, and lands nowhere. Failing at mint time is the only outcome a
    // person can act on.
    delete process.env.TELEGRAM_BOT_USERNAME;
    process.env.TELEGRAM_MINIAPP_NAME = "app";
    expect(() => buildTelegramDeepLink("t")).toThrow(RuntimeGuardError);
    expect(() => buildTelegramDeepLink("t")).toThrow(
      /LIVE_CREDENTIAL_MISSING.*TELEGRAM_BOT_USERNAME/,
    );

    process.env.TELEGRAM_BOT_USERNAME = "mytab_live_bot";
    delete process.env.TELEGRAM_MINIAPP_NAME;
    expect(() => buildTelegramDeepLink("t")).toThrow(
      /LIVE_CREDENTIAL_MISSING.*TELEGRAM_MINIAPP_NAME/,
    );
  });

  it("rejects a malformed bot username instead of building a dead link", () => {
    process.env.TELEGRAM_MINIAPP_NAME = "app";
    for (const bad of ["ab", "has space", "has-dash", "a".repeat(33)]) {
      process.env.TELEGRAM_BOT_USERNAME = bad;
      expect(() => buildTelegramDeepLink("t")).toThrow(RuntimeGuardError);
    }
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
