import {
  hmacSha256Hex,
  sha256Hex,
  timingSafeEqualHex,
  utf8ToBytes,
} from "../crypto/convexCrypto";
import { assertFixturePathAllowed } from "../solana/runtimeGuard";

/**
 * Bot token used to sign initData in tests.
 *
 * This value is published in this repository, so anything that verifies against
 * it is unauthenticated. It is never substituted for a missing
 * `TELEGRAM_BOT_TOKEN` — see `convex/lib/telegramVerify.getTelegramBotToken`,
 * which throws instead.
 */
export const FIXTURE_TELEGRAM_BOT_TOKEN = "fixture-telegram-bot-token";

/** Maximum age for Telegram initData auth_date (5 minutes). */
export const TELEGRAM_INIT_DATA_MAX_AGE_MS = 5 * 60 * 1000;

/** Server-side Telegram context TTL (5 minutes). */
export const TELEGRAM_CONTEXT_TTL_MS = 5 * 60 * 1000;

/**
 * How long a bound Telegram session may be renewed for before a fresh launch
 * is required (12 hours).
 *
 * `initData` is fixed for the life of a Mini App launch — its `auth_date` never
 * advances — so renewing the context by re-presenting it can only work for
 * TELEGRAM_INIT_DATA_MAX_AGE_MS after that launch. Past that every renewal
 * failed EXPIRED_AUTH_DATE forever, the context lapsed, and every mutation
 * refused with TELEGRAM_CONTEXT_REQUIRED until the app was fully relaunched.
 * Five minutes into a meal, on a bill-splitting app.
 *
 * Renewal therefore no longer re-verifies initData. It cannot: the payload
 * cannot be refreshed. Binding still demands a fresh, HMAC-verified payload —
 * that is the act that decides which Telegram user a Privy identity is — and
 * this bounds how long the resulting session may be carried on the Privy
 * credential alone.
 */
export const TELEGRAM_SESSION_MAX_MS = 12 * 60 * 60 * 1000;

export type TelegramInitDataUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

export type TelegramInitDataChat = {
  id: number;
  type: string;
  title?: string;
};

export type ParsedTelegramInitData = {
  authDate: number;
  chatInstance: string | null;
  user: TelegramInitDataUser;
  chat: TelegramInitDataChat | null;
};

export type VerifyInitDataResult =
  | { ok: true; parsed: ParsedTelegramInitData }
  | { ok: false; code: "INVALID_INIT_DATA" | "EXPIRED_AUTH_DATE" | "MISSING_USER" };

function buildDataCheckString(initData: string): { hash: string | null; dataCheckString: string } {
  const pairs = initData
    .split("&")
    .filter((chunk) => chunk.length > 0 && !chunk.startsWith("hash="));

  let hash: string | null = null;
  const hashPair = initData
    .split("&")
    .find((chunk) => chunk.startsWith("hash="));
  if (hashPair) {
    hash = hashPair.slice("hash=".length);
  }

  const dataCheckString = pairs
    .map((chunk) => {
      const separator = chunk.indexOf("=");
      if (separator === -1) {
        return { key: chunk, entry: chunk };
      }
      const key = chunk.slice(0, separator);
      const value = chunk.slice(separator + 1);
      return { key, entry: `${key}=${decodeURIComponent(value)}` };
    })
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((item) => item.entry)
    .join("\n");

  return { hash, dataCheckString };
}

/** Computes the Telegram initData HMAC hex digest for a bot token. */
export function computeInitDataHmac(dataCheckString: string, botToken: string): string {
  const secretKey = hmacSha256Hex(utf8ToBytes("WebAppData"), botToken);
  return hmacSha256Hex(hexToHmacKey(secretKey), dataCheckString);
}

function hexToHmacKey(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function safeEqualHex(a: string, b: string): boolean {
  return timingSafeEqualHex(a, b);
}

/** SHA-256 of raw initData for replay tracking. */
export function hashInitData(initData: string): string {
  return sha256Hex(initData);
}

export function isAuthDateFresh(
  authDateSeconds: number,
  nowMs: number = Date.now(),
  maxAgeMs: number = TELEGRAM_INIT_DATA_MAX_AGE_MS,
): boolean {
  const authDateMs = authDateSeconds * 1000;
  return authDateMs <= nowMs && nowMs - authDateMs <= maxAgeMs;
}

function parseUser(raw: string | null): TelegramInitDataUser | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as TelegramInitDataUser;
    if (typeof parsed.id !== "number" || typeof parsed.first_name !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseChat(raw: string | null): TelegramInitDataChat | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as TelegramInitDataChat;
    if (typeof parsed.id !== "number" || typeof parsed.type !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Parses verified initData fields — call only after HMAC validation succeeds. */
export function parseVerifiedInitData(initData: string): ParsedTelegramInitData | null {
  const params = new URLSearchParams(initData);
  const authDateRaw = params.get("auth_date");
  if (!authDateRaw) {
    return null;
  }

  const authDate = Number.parseInt(authDateRaw, 10);
  if (!Number.isFinite(authDate)) {
    return null;
  }

  const user = parseUser(params.get("user"));
  if (!user) {
    return null;
  }

  return {
    authDate,
    chatInstance: params.get("chat_instance"),
    user,
    chat: parseChat(params.get("chat")),
  };
}

/**
 * Validates raw Telegram initData HMAC and freshness before extracting any field.
 * Pure function — pass bot token explicitly (fixture or production).
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  options?: { nowMs?: number; maxAgeMs?: number },
): VerifyInitDataResult {
  const trimmed = initData.trim();
  if (!trimmed) {
    return { ok: false, code: "INVALID_INIT_DATA" };
  }

  const { hash, dataCheckString } = buildDataCheckString(trimmed);
  if (!hash) {
    return { ok: false, code: "INVALID_INIT_DATA" };
  }

  const expectedHash = computeInitDataHmac(dataCheckString, botToken);
  if (!safeEqualHex(expectedHash, hash)) {
    return { ok: false, code: "INVALID_INIT_DATA" };
  }

  const parsed = parseVerifiedInitData(trimmed);
  if (!parsed) {
    return { ok: false, code: "MISSING_USER" };
  }

  const nowMs = options?.nowMs ?? Date.now();
  const maxAgeMs = options?.maxAgeMs ?? TELEGRAM_INIT_DATA_MAX_AGE_MS;
  if (!isAuthDateFresh(parsed.authDate, nowMs, maxAgeMs)) {
    return { ok: false, code: "EXPIRED_AUTH_DATE" };
  }

  return { ok: true, parsed };
}

export function buildDisplayName(user: TelegramInitDataUser): string {
  const parts = [user.first_name, user.last_name].filter(Boolean);
  return parts.join(" ").trim() || "Telegram User";
}

export function resolveChatIds(chat: TelegramInitDataChat | null): {
  chatId: string;
  groupId: string;
} {
  if (!chat) {
    return { chatId: "", groupId: "" };
  }
  const id = String(chat.id);
  const isGroup = chat.type === "group" || chat.type === "supergroup";
  return {
    chatId: id,
    groupId: isGroup ? id : "",
  };
}

/**
 * Builds a signed initData query string for tests.
 *
 * This function forges a credential: whatever `user` id it is handed comes back
 * as a payload `verifyInitData` accepts. It is guarded rather than merely
 * "test-only by convention" — on a deployment it throws.
 */
export function signTestInitData(
  fields: Record<string, string>,
  botToken: string = FIXTURE_TELEGRAM_BOT_TOKEN,
): string {
  assertFixturePathAllowed("telegram.signTestInitData");
  const sortedKeys = Object.keys(fields).sort((a, b) => a.localeCompare(b));
  const dataCheckString = sortedKeys.map((key) => `${key}=${fields[key]}`).join("\n");
  const hash = computeInitDataHmac(dataCheckString, botToken);
  const query = sortedKeys
    .map((key) => `${key}=${encodeURIComponent(fields[key])}`)
    .join("&");
  return `${query}&hash=${hash}`;
}
