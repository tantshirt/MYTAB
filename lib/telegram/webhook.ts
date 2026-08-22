import { timingSafeEqual, utf8ToBytes } from "../crypto/convexCrypto";
import { buildDisplayName } from "./verify";

/** Fixture webhook secret when TELEGRAM_WEBHOOK_SECRET is absent (local/tests). */
export const FIXTURE_TELEGRAM_WEBHOOK_SECRET = "fixture-telegram-webhook-secret";

export type TelegramWebhookUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  is_bot?: boolean;
};

export type TelegramWebhookChat = {
  id: number;
  type: string;
  title?: string;
};

export type TelegramChatMemberStatus =
  | "creator"
  | "administrator"
  | "member"
  | "restricted"
  | "left"
  | "kicked"
  | "unknown";

export type NormalizedTelegramUpdate =
  | {
      kind: "message";
      updateId: number;
      chatId: string;
      fromId: string;
      messageId: number;
      command: string | null;
      chatTitle?: string;
      fromDisplayName: string;
      fromUsername?: string;
      fromAvatarUrl?: string;
    }
  | {
      kind: "chat_member";
      updateId: number;
      chatId: string;
      userId: string;
      chatTitle?: string;
      displayName: string;
      username?: string;
      avatarUrl?: string;
      role: TelegramChatMemberStatus;
      membershipStatus: "active" | "left" | "kicked" | "restricted";
    }
  | {
      kind: "my_chat_member";
      updateId: number;
      chatId: string;
      chatTitle?: string;
      botIsAdmin: boolean;
    }
  | {
      kind: "unsupported";
      updateId: number;
    };

export type NormalizeUpdateResult =
  | { ok: true; update: NormalizedTelegramUpdate }
  | { ok: false; code: "INVALID_BODY" | "MISSING_UPDATE_ID" };

function safeEqualUtf8(a: string, b: string): boolean {
  return timingSafeEqual(utf8ToBytes(a), utf8ToBytes(b));
}

/** Constant-time comparison for X-Telegram-Bot-Api-Secret-Token. */
export function verifyWebhookSecret(
  headerValue: string | null | undefined,
  expectedSecret: string,
): boolean {
  if (!headerValue || !expectedSecret) {
    return false;
  }
  return safeEqualUtf8(headerValue.trim(), expectedSecret.trim());
}

/** Extracts the numeric bot id prefix from a Telegram bot token. */
export function extractBotIdFromToken(botToken: string): string {
  const trimmed = botToken.trim();
  const colon = trimmed.indexOf(":");
  if (colon > 0) {
    return trimmed.slice(0, colon);
  }
  return "fixture-bot";
}

function parseUser(raw: unknown): TelegramWebhookUser | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const user = raw as TelegramWebhookUser;
  if (typeof user.id !== "number" || typeof user.first_name !== "string") {
    return null;
  }
  return user;
}

function parseChat(raw: unknown): TelegramWebhookChat | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const chat = raw as TelegramWebhookChat;
  if (typeof chat.id !== "number" || typeof chat.type !== "string") {
    return null;
  }
  return chat;
}

function isGroupChat(chat: TelegramWebhookChat): boolean {
  return chat.type === "group" || chat.type === "supergroup";
}

function parseCommand(text: string | undefined): string | null {
  if (!text) {
    return null;
  }
  const match = text.trim().match(/^\/([a-zA-Z0-9_]+)(?:@\w+)?(?:\s|$)/);
  return match?.[1]?.toLowerCase() ?? null;
}

function mapMembershipStatus(
  status: string,
  restrictedIsMember?: boolean,
): {
  role: TelegramChatMemberStatus;
  membershipStatus: "active" | "left" | "kicked" | "restricted";
} {
  switch (status) {
    case "creator":
      return { role: "creator", membershipStatus: "active" };
    case "administrator":
      return { role: "administrator", membershipStatus: "active" };
    case "member":
      return { role: "member", membershipStatus: "active" };
    case "restricted":
      return restrictedIsMember
        ? { role: "restricted", membershipStatus: "active" }
        : { role: "restricted", membershipStatus: "restricted" };
    case "left":
      return { role: "left", membershipStatus: "left" };
    case "kicked":
      return { role: "kicked", membershipStatus: "kicked" };
    default:
      return { role: "unknown", membershipStatus: "left" };
  }
}

function normalizeMessageUpdate(
  updateId: number,
  message: Record<string, unknown>,
): NormalizedTelegramUpdate | null {
  const chat = parseChat(message.chat);
  const from = parseUser(message.from);
  if (!chat || !from || from.is_bot) {
    return null;
  }
  if (!isGroupChat(chat)) {
    return null;
  }

  const text = typeof message.message_id === "number" ? (message.text as string | undefined) : undefined;
  if (typeof message.message_id !== "number") {
    return null;
  }

  return {
    kind: "message",
    updateId,
    chatId: String(chat.id),
    fromId: String(from.id),
    messageId: message.message_id,
    command: parseCommand(text),
    chatTitle: chat.title,
    fromDisplayName: buildDisplayName(from),
    fromUsername: from.username,
    fromAvatarUrl: from.photo_url,
  };
}

function normalizeChatMemberUpdate(
  updateId: number,
  payload: Record<string, unknown>,
): NormalizedTelegramUpdate | null {
  const chat = parseChat(payload.chat);
  const newMember = payload.new_chat_member as Record<string, unknown> | undefined;
  const user = parseUser(newMember?.user);
  if (!chat || !user || !isGroupChat(chat)) {
    return null;
  }

  const status = typeof newMember?.status === "string" ? newMember.status : "unknown";
  const restrictedIsMember =
    status === "restricted" &&
    (newMember as { is_member?: boolean }).is_member === true;
  const mapped = mapMembershipStatus(status, restrictedIsMember);

  return {
    kind: "chat_member",
    updateId,
    chatId: String(chat.id),
    userId: String(user.id),
    chatTitle: chat.title,
    displayName: buildDisplayName(user),
    username: user.username,
    avatarUrl: user.photo_url,
    role: mapped.role,
    membershipStatus: mapped.membershipStatus,
  };
}

function normalizeMyChatMemberUpdate(
  updateId: number,
  payload: Record<string, unknown>,
): NormalizedTelegramUpdate | null {
  const chat = parseChat(payload.chat);
  const newMember = payload.new_chat_member as Record<string, unknown> | undefined;
  if (!chat || !isGroupChat(chat)) {
    return null;
  }

  const status = typeof newMember?.status === "string" ? newMember.status : "";
  const botIsAdmin = status === "administrator" || status === "creator";

  return {
    kind: "my_chat_member",
    updateId,
    chatId: String(chat.id),
    chatTitle: chat.title,
    botIsAdmin,
  };
}

/** Validates update shape and normalizes supported Telegram webhook payloads. */
export function normalizeTelegramUpdate(body: unknown): NormalizeUpdateResult {
  if (!body || typeof body !== "object") {
    return { ok: false, code: "INVALID_BODY" };
  }

  const record = body as Record<string, unknown>;
  if (typeof record.update_id !== "number") {
    return { ok: false, code: "MISSING_UPDATE_ID" };
  }

  const updateId = record.update_id;

  if (record.message && typeof record.message === "object") {
    const normalized = normalizeMessageUpdate(updateId, record.message as Record<string, unknown>);
    if (normalized) {
      return { ok: true, update: normalized };
    }
  }

  if (record.chat_member && typeof record.chat_member === "object") {
    const normalized = normalizeChatMemberUpdate(
      updateId,
      record.chat_member as Record<string, unknown>,
    );
    if (normalized) {
      return { ok: true, update: normalized };
    }
  }

  if (record.my_chat_member && typeof record.my_chat_member === "object") {
    const normalized = normalizeMyChatMemberUpdate(
      updateId,
      record.my_chat_member as Record<string, unknown>,
    );
    if (normalized) {
      return { ok: true, update: normalized };
    }
  }

  return { ok: true, update: { kind: "unsupported", updateId } };
}
