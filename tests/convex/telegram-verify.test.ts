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
  getTelegramBotToken,
  isTelegramFixtureMode,
} from "../../convex/lib/telegramVerify";
import { FixtureModeNotPermittedError } from "../../lib/solana/runtimeGuard";

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

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    (process.env as Record<string, string>)[key] = value;
  }
}

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

  it("fixture mode activates only under the test runner, never on a deployment", () => {
    const original = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    try {
      // Under vitest the guard permits fixtures, so this is the local answer.
      expect(isTelegramFixtureMode()).toBe(true);
      expect(getTelegramBotToken()).toBe(FIXTURE_TELEGRAM_BOT_TOKEN);
    } finally {
      if (original !== undefined) {
        process.env.TELEGRAM_BOT_TOKEN = original;
      }
    }
  });

  it("a real bot token always wins over the fixture token", () => {
    const original = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = "110201543:AAHdqTcvCH1vGWJxfSeofS0kBmgHdeDZ8mQ";
    try {
      expect(isTelegramFixtureMode()).toBe(false);
      expect(getTelegramBotToken()).not.toBe(FIXTURE_TELEGRAM_BOT_TOKEN);
    } finally {
      if (original === undefined) {
        delete process.env.TELEGRAM_BOT_TOKEN;
      } else {
        process.env.TELEGRAM_BOT_TOKEN = original;
      }
    }
  });

  it("forged initData signed with the fixture token cannot authenticate anyone", () => {
    // The fixture token is published in this repository. If a deployment ever
    // fell back to it, this payload would be a valid login as user 42.
    const forged = signTestInitData(
      { auth_date: freshAuthDate(), user: TEST_USER },
      FIXTURE_TELEGRAM_BOT_TOKEN,
    );
    expect(
      verifyInitData(forged, "110201543:AAHdqTcvCH1vGWJxfSeofS0kBmgHdeDZ8mQ"),
    ).toEqual({ ok: false, code: "INVALID_INIT_DATA" });
  });

  it("refuses the fixture token on a real deployment rather than substituting it", () => {
    // The guard reads process.env directly, so simulate a deployed runtime.
    const originalToken = process.env.TELEGRAM_BOT_TOKEN;
    const originalCloud = process.env.CONVEX_CLOUD_URL;
    const originalVitest = process.env.VITEST;
    const originalWorker = process.env.VITEST_WORKER_ID;
    const originalNodeEnv = process.env.NODE_ENV;
    delete process.env.TELEGRAM_BOT_TOKEN;
    process.env.CONVEX_CLOUD_URL = "https://example-deployment.convex.cloud";
    delete process.env.VITEST;
    delete process.env.VITEST_WORKER_ID;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      expect(isTelegramFixtureMode()).toBe(false);
      expect(() => getTelegramBotToken()).toThrow(FixtureModeNotPermittedError);
    } finally {
      restoreEnv("TELEGRAM_BOT_TOKEN", originalToken);
      restoreEnv("CONVEX_CLOUD_URL", originalCloud);
      restoreEnv("VITEST", originalVitest);
      restoreEnv("VITEST_WORKER_ID", originalWorker);
      restoreEnv("NODE_ENV", originalNodeEnv);
    }
  });
});
