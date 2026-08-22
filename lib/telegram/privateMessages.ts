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
export const SEND_TIP_BUTTON_LABEL = "Send a tip";
export const OPEN_MY_TAB_BUTTON_LABEL = "Open My Tab";

export const WELCOME_MESSAGE = [
  "Hi — I'm My Tab.",
  "",
  "I split a restaurant bill so everyone pays their own part. You photograph the receipt, your friends tap what they ordered, and each share comes out exact.",
  "",
  "Start a tab and I'll give you a link to send them.",
].join("\n");

export const HELP_MESSAGE = [
  "My Tab splits a restaurant bill.",
  "",
  "Start a tab, photograph the receipt, and send the link to whoever was there. Everyone taps what they ordered on their own phone. Each share comes out exact — items, service, tax, tip, to the satang — and everyone pays their part back to whoever fronted it.",
  "",
  "/tab — start a tab",
  "/balance — where you stand",
  "/tip — send someone a tip",
].join("\n");

export const FALLBACK_MESSAGE = [
  "I only do one thing, and it's bills.",
  "",
  "Start a tab and I'll give you a link to send your friends.",
].join("\n");

export const START_TAB_REPLY = "Let's do it.";
export const TIP_REPLY = "Who are you tipping?";
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
  | "send_tip"
  | "open_my_tab";

export type PrivateReplyPlan =
  | { kind: "silent" }
  | { kind: "reply"; text: string; buttons: PrivateButtonKind[] };

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
    };
  }

  if (command === "tab" || command === "splitbill") {
    return { kind: "reply", text: START_TAB_REPLY, buttons: ["start_tab"] };
  }

  if (command === "tip") {
    return { kind: "reply", text: TIP_REPLY, buttons: ["send_tip"] };
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
