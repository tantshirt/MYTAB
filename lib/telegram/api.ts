/**
 * Telegram Bot API transport.
 *
 * Pure with respect to Convex: it takes a token and a fetch, and returns a
 * classified outcome. Every caller lives in a Convex action, because Convex
 * mutations cannot reach the network — which is the whole reason delivery is a
 * queue with a lease rather than a call inside the mutation that caused it.
 */

import { assertPreviewEgressAllowed, type RuntimeEnv } from "../env/preview-guard";

export const TELEGRAM_API_ORIGIN = "https://api.telegram.org";

/** Per-attempt network timeout. Must stay well below the delivery lease. */
export const TELEGRAM_CALL_TIMEOUT_MS = 10_000;

/** Hard attempt ceiling before a message is parked as failed. */
export const TELEGRAM_MAX_ATTEMPTS = 5;

/** Longest backoff we will wait between attempts. */
export const TELEGRAM_MAX_BACKOFF_MS = 30_000;

export type TelegramFailureKind =
  /** 429. Telegram told us exactly how long to wait. */
  | "rate_limited"
  /** The message we tried to edit is gone. This is the recovery trigger. */
  | "message_missing"
  /** Text and markup are already what we wanted. Success in disguise. */
  | "not_modified"
  /** Bot lacks rights / was removed. Retrying cannot help. */
  | "not_permitted"
  /** Any other 4xx. Retrying cannot help. */
  | "permanent"
  /** 5xx, timeout, or a socket that went away. Retrying can help. */
  | "transient";

export type TelegramCallResult<T> =
  | { ok: true; result: T }
  | {
      ok: false;
      kind: TelegramFailureKind;
      description: string;
      errorCode?: number;
      retryAfterMs?: number;
    };

export type TelegramMessage = {
  message_id: number;
  chat?: { id: number };
};

export type TelegramChatMember = {
  status: string;
  user?: { id: number; first_name?: string; last_name?: string; username?: string };
  is_member?: boolean;
};

type RawResponse = {
  ok?: boolean;
  result?: unknown;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
};

const MESSAGE_MISSING_PATTERNS = [
  /message to edit not found/i,
  /message to delete not found/i,
  /message identifier is not specified/i,
  /message_id_invalid/i,
  /message can'?t be edited/i,
  /MESSAGE_ID_INVALID/,
];

const NOT_PERMITTED_PATTERNS = [
  /not enough rights/i,
  /have no rights/i,
  /bot was blocked/i,
  /bot was kicked/i,
  /bot is not a member/i,
  /chat_write_forbidden/i,
  /need administrator rights/i,
];

/**
 * Maps an HTTP status plus a Bot API body onto a retry decision.
 *
 * Split out from the transport so the interesting half is testable without a
 * network: the classification is what decides whether a live group gets a
 * duplicate card or a quiet retry.
 */
export function classifyTelegramResponse(
  status: number,
  body: RawResponse | null,
): TelegramCallResult<unknown> {
  if (body?.ok === true) {
    return { ok: true, result: body.result };
  }

  const description = body?.description ?? `telegram_http_${status}`;
  const errorCode = body?.error_code ?? status;

  if (status === 429 || errorCode === 429) {
    const retryAfterSeconds = body?.parameters?.retry_after ?? 1;
    return {
      ok: false,
      kind: "rate_limited",
      description,
      errorCode,
      retryAfterMs: Math.max(1, Math.ceil(retryAfterSeconds)) * 1_000,
    };
  }

  if (status >= 500 || errorCode >= 500) {
    return { ok: false, kind: "transient", description, errorCode };
  }

  if (/message is not modified/i.test(description)) {
    return { ok: false, kind: "not_modified", description, errorCode };
  }

  if (MESSAGE_MISSING_PATTERNS.some((pattern) => pattern.test(description))) {
    return { ok: false, kind: "message_missing", description, errorCode };
  }

  if (NOT_PERMITTED_PATTERNS.some((pattern) => pattern.test(description))) {
    return { ok: false, kind: "not_permitted", description, errorCode };
  }

  return { ok: false, kind: "permanent", description, errorCode };
}

/**
 * Delay before the next attempt, or null when retrying is pointless.
 *
 * `attempt` is the number of attempts already made, including the one that just
 * failed. Deterministic on purpose — a random jitter would make the
 * concurrency tests non-reproducible, and the lease already serialises workers.
 */
export function nextRetryDelayMs(
  attempt: number,
  kind: TelegramFailureKind,
  retryAfterMs?: number,
): number | null {
  if (kind === "permanent" || kind === "not_permitted" || kind === "not_modified") {
    return null;
  }
  if (attempt >= TELEGRAM_MAX_ATTEMPTS) {
    return null;
  }
  if (kind === "rate_limited") {
    return Math.min(TELEGRAM_MAX_BACKOFF_MS, Math.max(1_000, retryAfterMs ?? 1_000));
  }
  const exponential = 1_000 * Math.pow(4, Math.max(0, attempt - 1));
  return Math.min(TELEGRAM_MAX_BACKOFF_MS, exponential);
}

export type TelegramCallOptions = {
  /** Injected only by tests. Production always uses the guarded global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected only by tests, so the egress guard stays unconditional. */
  env?: RuntimeEnv;
  timeoutMs?: number;
};

/** Calls one Bot API method and classifies the outcome. Never throws. */
export async function callTelegramApi<T>(
  botToken: string,
  method: string,
  params: Record<string, unknown>,
  options: TelegramCallOptions = {},
): Promise<TelegramCallResult<T>> {
  const url = `${TELEGRAM_API_ORIGIN}/bot${botToken}/${method}`;

  try {
    assertPreviewEgressAllowed(url, options.env);
  } catch (error) {
    // A blocked environment is not a Telegram failure and must never be
    // retried into a rate limit.
    return {
      ok: false,
      kind: "permanent",
      description: error instanceof Error ? error.message : "egress_blocked",
    };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? TELEGRAM_CALL_TIMEOUT_MS;

  let response: Response;
  try {
    response = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return {
      ok: false,
      kind: "transient",
      description: error instanceof Error ? error.message : "network_error",
    };
  }

  let body: RawResponse | null = null;
  try {
    body = (await response.json()) as RawResponse;
  } catch {
    body = null;
  }

  return classifyTelegramResponse(response.status, body) as TelegramCallResult<T>;
}

export type InlineKeyboardUrlButton = { text: string; url: string };
export type InlineKeyboardWebAppButton = { text: string; web_app: { url: string } };
export type InlineKeyboardButton = InlineKeyboardUrlButton | InlineKeyboardWebAppButton;

export type InlineKeyboardMarkup = {
  inline_keyboard: Array<Array<InlineKeyboardButton>>;
};

/** The one button this product ever renders in a group. URL only — groups cannot host web_app buttons. */
export function singleButtonKeyboard(label: string, url: string): InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: label, url }]] };
}

/** A private-chat web_app button. Telegram forbids these in groups. */
export function webAppButton(label: string, url: string): InlineKeyboardWebAppButton {
  return { text: label, web_app: { url } };
}

export function urlButton(label: string, url: string): InlineKeyboardUrlButton {
  return { text: label, url };
}

export type TelegramBotCommand = {
  command: string;
  description: string;
};

export type TelegramBotCommandScope =
  | { type: "default" }
  | { type: "all_private_chats" }
  | { type: "all_group_chats" };

export function setMyCommands(
  botToken: string,
  input: { commands: readonly TelegramBotCommand[]; scope?: TelegramBotCommandScope },
  options?: TelegramCallOptions,
): Promise<TelegramCallResult<boolean>> {
  return callTelegramApi<boolean>(
    botToken,
    "setMyCommands",
    {
      commands: input.commands,
      ...(input.scope ? { scope: input.scope } : {}),
    },
    options,
  );
}

export type TelegramMenuButton =
  | { type: "commands" }
  | { type: "default" }
  | { type: "web_app"; text: string; web_app: { url: string } };

export function setChatMenuButton(
  botToken: string,
  input: { menuButton: TelegramMenuButton },
  options?: TelegramCallOptions,
): Promise<TelegramCallResult<boolean>> {
  return callTelegramApi<boolean>(
    botToken,
    "setChatMenuButton",
    { menu_button: input.menuButton },
    options,
  );
}

export function sendMessage(
  botToken: string,
  input: {
    chatId: string;
    text: string;
    replyMarkup?: InlineKeyboardMarkup;
    disableNotification?: boolean;
  },
  options?: TelegramCallOptions,
): Promise<TelegramCallResult<TelegramMessage>> {
  return callTelegramApi<TelegramMessage>(
    botToken,
    "sendMessage",
    {
      chat_id: input.chatId,
      text: input.text,
      disable_web_page_preview: true,
      ...(input.disableNotification ? { disable_notification: true } : {}),
      ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
    },
    options,
  );
}

export function editMessageText(
  botToken: string,
  input: {
    chatId: string;
    messageId: number;
    text: string;
    replyMarkup?: InlineKeyboardMarkup;
  },
  options?: TelegramCallOptions,
): Promise<TelegramCallResult<TelegramMessage>> {
  return callTelegramApi<TelegramMessage>(
    botToken,
    "editMessageText",
    {
      chat_id: input.chatId,
      message_id: input.messageId,
      text: input.text,
      disable_web_page_preview: true,
      ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
    },
    options,
  );
}

/**
 * Photo header on the tab status card (D-31). `photo` is a Telegram `file_id`
 * already stored on the status row — this function never generates an image.
 * U-8 still blocks choosing what to generate.
 */
export function sendPhoto(
  botToken: string,
  input: {
    chatId: string;
    photoFileId: string;
    caption: string;
    replyMarkup?: InlineKeyboardMarkup;
    disableNotification?: boolean;
  },
  options?: TelegramCallOptions,
): Promise<TelegramCallResult<TelegramMessage>> {
  return callTelegramApi<TelegramMessage>(
    botToken,
    "sendPhoto",
    {
      chat_id: input.chatId,
      photo: input.photoFileId,
      caption: input.caption,
      ...(input.disableNotification ? { disable_notification: true } : {}),
      ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
    },
    options,
  );
}

export function editMessageCaption(
  botToken: string,
  input: {
    chatId: string;
    messageId: number;
    caption: string;
    replyMarkup?: InlineKeyboardMarkup;
  },
  options?: TelegramCallOptions,
): Promise<TelegramCallResult<TelegramMessage>> {
  return callTelegramApi<TelegramMessage>(
    botToken,
    "editMessageCaption",
    {
      chat_id: input.chatId,
      message_id: input.messageId,
      caption: input.caption,
      ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
    },
    options,
  );
}

export function deleteMessage(
  botToken: string,
  input: { chatId: string; messageId: number },
  options?: TelegramCallOptions,
): Promise<TelegramCallResult<boolean>> {
  return callTelegramApi<boolean>(
    botToken,
    "deleteMessage",
    { chat_id: input.chatId, message_id: input.messageId },
    options,
  );
}

export function getChatMember(
  botToken: string,
  input: { chatId: string; userId: string },
  options?: TelegramCallOptions,
): Promise<TelegramCallResult<TelegramChatMember>> {
  return callTelegramApi<TelegramChatMember>(
    botToken,
    "getChatMember",
    { chat_id: input.chatId, user_id: Number(input.userId) },
    options,
  );
}

export function getMe(
  botToken: string,
  options?: TelegramCallOptions,
): Promise<TelegramCallResult<{ id: number; username?: string }>> {
  return callTelegramApi<{ id: number; username?: string }>(botToken, "getMe", {}, options);
}

/**
 * `InlineQueryResultArticle` — the only inline result this product ever builds.
 *
 * Bot API: `type` must be `article`; `id` is 1–64 **bytes**; `title` and
 * `input_message_content` are required. `reply_markup` is required for the
 * invite share (INVITE-FLOW §5.1) so the sent message has an Open tab button.
 * The completion share still omits it — that message is a recap, not a door.
 */
export type InlineQueryResultArticle = {
  type: "article";
  id: string;
  title: string;
  description?: string;
  input_message_content: {
    message_text: string;
    /** Bot API 7.0 replacement for `disable_web_page_preview`. */
    link_preview_options?: { is_disabled: true };
  };
  reply_markup?: InlineKeyboardMarkup;
};

/** The `PreparedInlineMessage` returned by `savePreparedInlineMessage`. */
export type PreparedInlineMessage = {
  /** Unique identifier of the prepared message — what `WebApp.shareMessage` takes. */
  id: string;
  /** Unix seconds. Expired prepared messages can no longer be used. */
  expiration_date: number;
};

/** Bot API caps an inline result id at 64 bytes. */
export const PREPARED_INLINE_RESULT_ID_MAX_BYTES = 64;

/** Truncates an inline result id to the Bot API's 64-byte ceiling. */
export function clampInlineResultId(id: string): string {
  const encoded = new TextEncoder().encode(id);
  if (encoded.length <= PREPARED_INLINE_RESULT_ID_MAX_BYTES) {
    return id;
  }
  return new TextDecoder().decode(
    encoded.slice(0, PREPARED_INLINE_RESULT_ID_MAX_BYTES),
  );
}

/**
 * Bot API 8.0 `savePreparedInlineMessage`.
 *
 * Mints a message the *person* may then send from Telegram's own share sheet
 * via `WebApp.shareMessage`. The bot never picks the chat and never posts, so
 * this is not one of the five sanctioned bot events.
 *
 * The four `allow_*` flags are the whole security surface of the call: they
 * decide which chat types the share sheet will even offer. Channels and bots
 * are off — a tab is a conversation between people, not a broadcast.
 */
export function savePreparedInlineMessage(
  botToken: string,
  input: {
    /** Telegram user id of the ONE person allowed to send this message. */
    userId: string;
    result: InlineQueryResultArticle;
    allowUserChats?: boolean;
    allowBotChats?: boolean;
    allowGroupChats?: boolean;
    allowChannelChats?: boolean;
  },
  options?: TelegramCallOptions,
): Promise<TelegramCallResult<PreparedInlineMessage>> {
  return callTelegramApi<PreparedInlineMessage>(
    botToken,
    "savePreparedInlineMessage",
    {
      user_id: Number(input.userId),
      result: input.result,
      allow_user_chats: input.allowUserChats ?? false,
      allow_bot_chats: input.allowBotChats ?? false,
      allow_group_chats: input.allowGroupChats ?? false,
      allow_channel_chats: input.allowChannelChats ?? false,
    },
    options,
  );
}
