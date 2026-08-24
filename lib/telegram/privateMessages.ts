/**
 * Every word the bot says in a private chat.
 *
 * Private replies are not one of the five sanctioned group events. They answer
 * what a person typed and then go quiet (INVITE-FLOW §3.1). Copy lives here so
 * a test can pin it without Convex.
 */

import { OPEN_TAB_BUTTON_LABEL } from "./messages";

export const PRIVATE_FALLBACK_WINDOW_MS = 60_000;

export const START_TAB_BUTTON_LABEL = "Start a tab";
export const WHAT_I_OWE_BUTTON_LABEL = "What I owe";
export const ADD_TO_GROUP_BUTTON_LABEL = "Add me to a group";
export const OPEN_MY_TAB_BUTTON_LABEL = "Open My Tab";

/**
 * The three steps, in the order they happen at a table.
 *
 * Shared by the welcome and by `/help` so the two can never drift into telling
 * a person two different stories about the same product.
 *
 * Telegram sends these as plain text — this bot registers no `parse_mode` — so
 * the shape has to come from line breaks and a separator that survives a
 * proportional font. Space-padded columns would not align; " — " does.
 */
const HOW_IT_WORKS = [
  "How it works",
  "1 · Start a tab and photograph the receipt.",
  "2 · Show everyone the code at the table, or send them the link.",
  "3 · Everyone taps what they ordered, on their own phone, at the same time.",
];

/**
 * `/splitbill` is routed but deliberately unlisted (INVITE-FLOW §2.2), so it is
 * absent here too. Registered is not the same as listed.
 */
const COMMAND_LIST = [
  "/tab — start a tab",
  "/balance — where you stand",
  "/help — how this works",
];

/**
 * The welcome, sent as the caption on the house still.
 *
 * Telegram caps a photo caption at 1024 characters; `tests/lib/private-messages`
 * pins that, because a caption one character over does not truncate — the whole
 * send fails.
 */
export const WELCOME_MESSAGE = [
  "Hey — this is My Tab. I split restaurant bills.",
  "",
  "One dinner, five people, everyone ordered something different. Each share comes out exact — items, service, tax, tip, to the satang — and everyone pays their own part back to whoever fronted it.",
  "",
  ...HOW_IT_WORKS,
  "",
  ...COMMAND_LIST,
].join("\n");

export const HELP_MESSAGE = [
  "My Tab splits a restaurant bill so nobody has to do arithmetic at the table.",
  "",
  ...HOW_IT_WORKS,
  "4 · Each share comes out exact — items, service, tax, tip, to the satang.",
  "5 · Everyone pays their own part back to whoever fronted it.",
  "",
  "Commands",
  ...COMMAND_LIST,
  "",
  "In a group",
  "Add me to a group chat and type /tab when the bill lands. Make me an admin and I'll keep one live card in the chat as people settle.",
].join("\n");

export const FALLBACK_MESSAGE = [
  "I only do one thing, and it's bills.",
  "",
  "Start a tab and I'll give you a code to show the table. /help if you want the longer version.",
].join("\n");

export const START_TAB_REPLY = "Let's do it.";
export const BALANCE_REPLY = "Open My Tab to see where you stand.";

export const GROUP_WELCOME_ADMIN =
  "Thanks for the add. Type /tab when the bill lands and I'll set it up.";

export const GROUP_WELCOME_MEMBER = [
  "Thanks for the add. Type /tab when the bill lands.",
  "",
  "One thing: make me an admin here and I can keep one live card in the chat as people settle. Without it, tabs still work — I just can't post.",
].join("\n");

export type PrivateButtonKind =
  | "start_tab"
  | "what_i_owe"
  | "add_to_group"
  | "open_tab"
  | "open_my_tab";

export type PrivateReplyPlan =
  | { kind: "silent" }
  | {
      kind: "reply";
      text: string;
      buttons: PrivateButtonKind[];
      /**
       * Lead with the house still.
       *
       * True for a bare `/start` and nothing else — that is the one reply
       * that is a person meeting this product for the first time. A photograph
       * above "Who are you tipping?" is noise, and above a refusal it is worse.
       * `text` becomes the photo caption, so it must stay inside Telegram's
       * 1024-character cap.
       */
      photo?: true;
    };

export function renderStartTokenCard(input: {
  tabName: string;
  organizerDisplayName: string;
}): string {
  return [`🍜 ${input.tabName}`, `${input.organizerDisplayName} started a tab. Tap to claim what you ordered.`].join(
    "\n",
  );
}

export function renderStartTokenUnknown(): string {
  return "This link doesn't work — ask for a new one.";
}

/**
 * Decides what a private-chat update deserves.
 *
 * `/start` and `/start <token>` are the front door. Unrecognised text is
 * answered once per 60 seconds and never in a group (the caller must not
 * invoke this for a group chat).
 */
export function planPrivateReply(input: {
  command: string | null;
  commandArg: string | null;
  now: number;
  lastFallbackAt?: number | null;
  startTokenCard?: { tabName: string; organizerDisplayName: string } | null;
}): PrivateReplyPlan {
  const command = input.command;

  if (command === "start" && input.commandArg) {
    if (input.startTokenCard) {
      return {
        kind: "reply",
        text: renderStartTokenCard(input.startTokenCard),
        buttons: ["open_tab"],
      };
    }
    return {
      kind: "reply",
      text: renderStartTokenUnknown(),
      buttons: ["start_tab"],
    };
  }

  if (command === "start" || command === null) {
    if (command === null) {
      if (
        input.lastFallbackAt != null &&
        input.now - input.lastFallbackAt < PRIVATE_FALLBACK_WINDOW_MS
      ) {
        return { kind: "silent" };
      }
      return {
        kind: "reply",
        text: FALLBACK_MESSAGE,
        buttons: ["start_tab"],
      };
    }
    return {
      kind: "reply",
      text: WELCOME_MESSAGE,
      buttons: ["start_tab", "what_i_owe", "add_to_group"],
      photo: true,
    };
  }

  if (command === "tab" || command === "splitbill") {
    return { kind: "reply", text: START_TAB_REPLY, buttons: ["start_tab"] };
  }

  if (command === "balance") {
    return { kind: "reply", text: BALANCE_REPLY, buttons: ["open_my_tab"] };
  }

  if (command === "help") {
    return { kind: "reply", text: HELP_MESSAGE, buttons: ["start_tab"] };
  }

  if (
    input.lastFallbackAt != null &&
    input.now - input.lastFallbackAt < PRIVATE_FALLBACK_WINDOW_MS
  ) {
    return { kind: "silent" };
  }
  return {
    kind: "reply",
    text: FALLBACK_MESSAGE,
    buttons: ["start_tab"],
  };
}

export { OPEN_TAB_BUTTON_LABEL };
