import { describe, expect, it } from "vitest";
import {
  FIXTURE_TELEGRAM_BOT_TOKEN,
  TELEGRAM_INIT_DATA_MAX_AGE_MS,
  hashInitData,
  isAuthDateFresh,
  signTestInitData,
  verifyInitData,
} from "@/lib/telegram/verify";
import {
  FIXTURE_TELEGRAM_BOT_TOKEN as CONVEX_FIXTURE_TOKEN,
  isTelegramFixtureMode,
} from "../../convex/lib/telegramVerify";

const TEST_USER = JSON.stringify({
  id: 42,
  first_name: "Ada",
  username: "ada_test",
  photo_url: "https://example.com/avatar.jpg",
});

const TEST_CHAT = JSON.stringify({
  id: -1001234567890,
  type: "supergroup",
  title: "Test Group",
});

function freshAuthDate(nowMs = Date.now()): string {
  return String(Math.floor(nowMs / 1000));
}

function buildValidInitData(nowMs = Date.now()): string {
  return signTestInitData(
    {
      auth_date: freshAuthDate(nowMs),
      chat: TEST_CHAT,
      chat_instance: "session-fixture-token",
      user: TEST_USER,
    },
    FIXTURE_TELEGRAM_BOT_TOKEN,
  );
}

describe("Story 1.7 — Telegram initData verification (AC1)", () => {
  it("accepts HMAC-valid initData signed with the fixture bot token", () => {
    const initData = buildValidInitData();
    const result = verifyInitData(initData, FIXTURE_TELEGRAM_BOT_TOKEN);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsed.user.id).toBe(42);
      expect(result.parsed.user.username).toBe("ada_test");
      expect(result.parsed.chatInstance).toBe("session-fixture-token");
    }
  });

  it("rejects tampered initData", () => {
    const initData = buildValidInitData().replace("Ada", "Eve");
    const result = verifyInitData(initData, FIXTURE_TELEGRAM_BOT_TOKEN);
    expect(result).toEqual({ ok: false, code: "INVALID_INIT_DATA" });
  });

  it("rejects initData older than five minutes", () => {
    const staleMs = Date.now() - TELEGRAM_INIT_DATA_MAX_AGE_MS - 1_000;
    const initData = buildValidInitData(staleMs);
    const result = verifyInitData(initData, FIXTURE_TELEGRAM_BOT_TOKEN, {
      nowMs: Date.now(),
    });
    expect(result).toEqual({ ok: false, code: "EXPIRED_AUTH_DATE" });
  });

  it("isAuthDateFresh enforces the five-minute window", () => {
    const now = 1_700_000_000_000;
    expect(isAuthDateFresh(now / 1000 - 60, now)).toBe(true);
    expect(isAuthDateFresh(now / 1000 - 301, now)).toBe(false);
  });

  it("hashInitData is stable for replay tracking", () => {
    const initData = buildValidInitData();
    expect(hashInitData(initData)).toBe(hashInitData(initData));
    expect(hashInitData(initData)).not.toBe(hashInitData(`${initData}&x=1`));
  });

  it("fixture mode activates when TELEGRAM_BOT_TOKEN is absent", () => {
    const original = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(isTelegramFixtureMode()).toBe(true);
    expect(CONVEX_FIXTURE_TOKEN).toBe(FIXTURE_TELEGRAM_BOT_TOKEN);
    if (original !== undefined) {
      process.env.TELEGRAM_BOT_TOKEN = original;
    }
  });
});
