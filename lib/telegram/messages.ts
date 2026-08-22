/**
 * Every word this product says in a Telegram group.
 *
 * Two rules make this file worth having in one place:
 *
 * 1. **Five events post, and no others** (EXPERIENCE, *The Telegram Surface*).
 *    Four of them are the same card, edited in place; the fifth is the tip
 *    confirmation, which is a separate message because it is a separate social
 *    act.
 * 2. **NFR-7.** A group message carries totals and counts, never who owes what,
 *    never an individual amount, never an address or a link to one. The tip
 *    confirmation is the single deliberate exception and it names both people
 *    on purpose.
 */

import { formatFiatMinorThb } from "../domain/format";
import type { FiatMinor } from "../domain/money";

/** The four events that render as the one status card for a tab. */
export const TELEGRAM_STATUS_EVENTS = [
  "tab_opened",
  "bill_ready",
  "payment_confirmed",
  "bill_completed",
] as const;

export type TelegramStatusEvent = (typeof TELEGRAM_STATUS_EVENTS)[number];

/** Every event that is allowed to reach a group chat. Exactly five. */
export const TELEGRAM_POSTING_EVENTS = [
  ...TELEGRAM_STATUS_EVENTS,
  "tip_confirmed",
] as const;

export type TelegramPostingEvent = (typeof TELEGRAM_POSTING_EVENTS)[number];

const POSTING_EVENT_SET: ReadonlySet<string> = new Set(TELEGRAM_POSTING_EVENTS);
const STATUS_EVENT_SET: ReadonlySet<string> = new Set(TELEGRAM_STATUS_EVENTS);

export class UnsanctionedTelegramEventError extends Error {
  readonly code = "UNSUPPORTED_TELEGRAM_EVENT";

  constructor(readonly event: string) {
    super(`UNSUPPORTED_TELEGRAM_EVENT: ${event}`);
    this.name = "UnsanctionedTelegramEventError";
  }
}

export function isPostingEvent(event: string): event is TelegramPostingEvent {
  return POSTING_EVENT_SET.has(event);
}

export function assertStatusEvent(event: string): asserts event is TelegramStatusEvent {
  if (!STATUS_EVENT_SET.has(event)) {
    throw new UnsanctionedTelegramEventError(event);
  }
}

/** The button label. It is always this, and it always lands on the Claim Board. */
export const OPEN_TAB_BUTTON_LABEL = "Open tab";

/**
 * Words that must never reach a person (EXPERIENCE, *Voice and Tone*).
 * Exported so a test can assert every rendered string against the real list
 * rather than a copy of it that drifts.
 */
export const BANNED_COPY_WORDS = [
  "execute",
  "swap",
  "route",
  "approve",
  "broadcast",
  "transaction",
  "signature",
  "mint",
  "ATA",
  "gas",
  "lamports",
  "slippage",
  "blockhash",
  "RPC",
  "wallet address",
  "AI",
  "powered by",
  "seamless",
] as const;

/** Returns the banned words present in a string, matched on word boundaries. */
export function findBannedCopyWords(text: string): string[] {
  return BANNED_COPY_WORDS.filter((word) => {
    const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return pattern.test(text);
  });
}

function peopleLine(peopleCount: number): string {
  const safe = Math.max(1, Math.trunc(peopleCount));
  return safe === 1 ? "1 person" : `${safe} people`;
}

export type TabStatusFacts = {
  tabName: string;
  event: TelegramStatusEvent;
  /** People on the tab. Never who they are. */
  peopleCount: number;
  /** The bill total in THB minor units, or null before there is one. */
  billTotalMinor: number | null;
  claimedItemCount: number;
  totalItemCount: number;
  settledShareCount: number;
  totalShareCount: number;
};

function headline(facts: TabStatusFacts): string {
  switch (facts.event) {
    case "tab_opened":
      return `🍜 ${facts.tabName} is open`;
    case "bill_ready":
    case "payment_confirmed":
      // The headline deliberately does not change when a payment lands. The
      // group learns that progress happened, not who made it (NFR-7).
      return `🍜 ${facts.tabName} is ready`;
    case "bill_completed":
      return `🍜 ${facts.tabName} is all square`;
  }
}

function progressLine(facts: TabStatusFacts): string | null {
  switch (facts.event) {
    case "tab_opened":
      if (facts.totalItemCount <= 0) {
        return "Nothing to claim yet.";
      }
      return `${facts.claimedItemCount} of ${facts.totalItemCount} items claimed`;
    case "bill_ready":
    case "payment_confirmed":
      if (facts.totalShareCount <= 0) {
        return null;
      }
      return `${facts.settledShareCount} of ${facts.totalShareCount} shares settled`;
    case "bill_completed":
      if (facts.totalShareCount <= 0) {
        return "Everyone paid.";
      }
      return `All ${facts.totalShareCount} shares settled.`;
  }
}

/**
 * The one card the group sees, in its current state.
 *
 * ```
 * 🍜 Sukhumvit Dinner is ready
 * 5 people · ฿1,840.00 total
 * 4 of 5 shares settled
 * ```
 *
 * Amounts are never rounded: if the bill is ฿1,840.00 the card says ฿1,840.00.
 */
export function renderTabStatusCard(facts: TabStatusFacts): string {
  assertStatusEvent(facts.event);

  const lines: string[] = [headline(facts)];

  const totalText =
    facts.billTotalMinor === null || facts.billTotalMinor === undefined
      ? null
      : `${formatFiatMinorThb(facts.billTotalMinor as FiatMinor)} total`;

  lines.push(totalText ? `${peopleLine(facts.peopleCount)} · ${totalText}` : peopleLine(facts.peopleCount));

  const progress = progressLine(facts);
  if (progress) {
    lines.push(progress);
  }

  return lines.join("\n");
}

export type TipConfirmationFacts = {
  senderDisplayName: string;
  recipientDisplayName: string;
  displayAmountThbMinor: number;
};

/**
 * The one warm message. It names both people and the amount because that is
 * the social act the tip was for — the deliberate exception to NFR-7.
 */
export function renderTipConfirmation(facts: TipConfirmationFacts): string {
  const amount = formatFiatMinorThb(facts.displayAmountThbMinor as FiatMinor);
  return `${facts.senderDisplayName} tipped ${facts.recipientDisplayName} ${amount}`;
}

/**
 * Shown in the group when the bot cannot act — bot demoted, or removed.
 * Names the repair, not the failure, and never blames the person who typed.
 */
export function renderBotAdminRepairMessage(): string {
  return "I need to be an admin here to start a tab. Add me back as an admin and try again — open tabs stay readable in the meantime.";
}

/** Shown when someone who is not in this group tries to act on it. */
export function renderNotAMemberMessage(): string {
  return "Only people in this chat can start a tab here.";
}

/** Shown when a group has hit its tab limits. */
export function renderRateLimitedMessage(): string {
  return "That's a lot of tabs. Finish one of the open ones first.";
}

/**
 * The completion moment, prepared for Telegram's OWN share sheet.
 *
 * This is not a sixth event. The five sanctioned events are what the *bot*
 * posts; `WebApp.shareMessage` posts nothing — it hands a prepared message to
 * the person, who chooses the chat. The bot's `bill_completed` card has already
 * gone out on its own by the time this can be tapped.
 *
 * The words are the `bill_completed` card verbatim, taken from
 * `renderTabStatusCard` rather than written again here: one copy vocabulary,
 * one place it can drift. Which also means NFR-7 is inherited rather than
 * re-argued — group facts only, no individual amounts, no names, no addresses,
 * no links.
 *
 * `title` and `description` are what Telegram's share sheet shows in its own
 * preview row before a chat is picked; they are the first two lines of the same
 * card, so the preview and the sent message never say different things.
 */
export type CompletionShareCopy = {
  /** The share sheet's preview title. */
  title: string;
  /** The share sheet's preview subtitle. */
  description: string;
  /** The message text that actually lands in the chosen chat. */
  messageText: string;
};

/**
 * The invite Maya sends. No amounts, ever (INVITE-FLOW §5.3, NFR-7).
 * Title and description match the sent message so the share-sheet preview
 * never disagrees with what lands.
 */
export function renderTabInvite(facts: {
  tabName: string;
  organizerName: string;
}): CompletionShareCopy {
  const description = `${facts.organizerName} started a tab. Tap to claim what you ordered.`;
  return {
    title: facts.tabName,
    description,
    messageText: `🍜 ${facts.tabName}\n\n${description}`,
  };
}

export function renderCompletionShare(
  facts: Omit<TabStatusFacts, "event">,
): CompletionShareCopy {
  const messageText = renderTabStatusCard({ ...facts, event: "bill_completed" });
  const [headlineLine = "", factsLine = ""] = messageText.split("\n");

  return {
    // The emoji is the card's, not the sheet's — Telegram draws its own row.
    title: headlineLine.replace(/^\p{Extended_Pictographic}\s*/u, ""),
    description: factsLine,
    messageText,
  };
}
