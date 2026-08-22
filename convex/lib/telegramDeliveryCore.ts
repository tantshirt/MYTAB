/**
 * The delivery decision loop, with the Convex runtime factored out.
 *
 * The interesting behaviour — recover a deleted card exactly once, never
 * commit on a claim you no longer hold, delete what you orphaned — is not
 * about Convex. Keeping it here means a test can drive the real code with a
 * stub Telegram rather than re-implementing the control flow and proving
 * nothing.
 */

import type { Id } from "../_generated/dataModel";
import {
  nextRetryDelayMs,
  type TelegramCallResult,
  type TelegramMessage,
} from "../../lib/telegram/api";
import type {
  ClaimStatusDeliveryResult,
  CommitStatusDeliveryResult,
  FailStatusDeliveryResult,
  ReserveReplacementResult,
} from "./telegramStatusManager";
import type {
  ClaimOutboundResult,
  CommitOutboundResult,
  FailOutboundResult,
} from "./telegramOutbox";

export type TelegramPort = {
  send(input: {
    chatId: string;
    text: string;
    buttonUrl?: string;
  }): Promise<TelegramCallResult<TelegramMessage>>;
  edit(input: {
    chatId: string;
    messageId: number;
    text: string;
    buttonUrl?: string;
  }): Promise<TelegramCallResult<TelegramMessage>>;
  remove(input: { chatId: string; messageId: number }): Promise<unknown>;
  /** Message id to use when there is no bot token — tests and local dev. */
  fixtureMessageId?: () => number;
};

export type StatusDeliveryOutcome =
  | { delivered: true; fixture?: boolean; unchanged?: boolean; recovered?: boolean }
  | { delivered: false; reason: string };

export type StatusDeliveryDeps = {
  claim: () => Promise<ClaimStatusDeliveryResult>;
  reserveReplacement: (claimId: string) => Promise<ReserveReplacementResult>;
  commit: (input: {
    claimId: string;
    messageId: number;
    deliveredVersion: number;
  }) => Promise<CommitStatusDeliveryResult>;
  fail: (input: {
    claimId: string;
    description: string;
    retryDelayMs: number | null;
  }) => Promise<FailStatusDeliveryResult>;
  reschedule: (delayMs: number) => Promise<void>;
  port: TelegramPort;
  fixture: boolean;
};

/** Brings a tab's group card up to date. One claim, at most one replacement. */
export async function deliverTabStatus(
  deps: StatusDeliveryDeps,
): Promise<StatusDeliveryOutcome> {
  const claim = await deps.claim();
  if (!claim.claimed) {
    return { delivered: false, reason: claim.reason };
  }

  const work = claim.work;

  if (deps.fixture) {
    const messageId = work.messageId ?? deps.port.fixtureMessageId?.() ?? 1;
    await deps.commit({
      claimId: work.claimId,
      messageId,
      deliveredVersion: work.targetVersion,
    });
    return { delivered: true, fixture: true };
  }

  let outcome: TelegramCallResult<TelegramMessage>;
  let postedMessageId: number | null = null;
  let recovered = false;

  if (work.mode === "edit" && work.messageId !== undefined) {
    outcome = await deps.port.edit({
      chatId: work.chatId,
      messageId: work.messageId,
      text: work.text,
      buttonUrl: work.buttonUrl,
    });

    if (!outcome.ok && outcome.kind === "not_modified") {
      // The card already reads the way we wanted it to. That is delivery.
      await deps.commit({
        claimId: work.claimId,
        messageId: work.messageId,
        deliveredVersion: work.targetVersion,
      });
      return { delivered: true, unchanged: true };
    }

    if (!outcome.ok && outcome.kind === "message_missing") {
      // Someone deleted the card. Reserve first — a reservation is refused if
      // this worker no longer holds the claim, and refused a second time
      // within the same claim, so a retry loop cannot post twice.
      const reservation = await deps.reserveReplacement(work.claimId);
      if (!reservation.reserved) {
        await deps.fail({
          claimId: work.claimId,
          description: `replacement_refused:${reservation.reason}`,
          retryDelayMs: null,
        });
        return { delivered: false, reason: reservation.reason };
      }

      recovered = true;
      outcome = await deps.port.send({
        chatId: work.chatId,
        text: work.text,
        buttonUrl: work.buttonUrl,
      });
      if (outcome.ok) {
        postedMessageId = outcome.result.message_id;
      }
    } else if (outcome.ok) {
      postedMessageId = work.messageId;
    }
  } else {
    outcome = await deps.port.send({
      chatId: work.chatId,
      text: work.text,
      buttonUrl: work.buttonUrl,
    });
    if (outcome.ok) {
      postedMessageId = outcome.result.message_id;
    }
  }

  if (!outcome.ok) {
    const retryDelayMs = nextRetryDelayMs(work.attempt, outcome.kind, outcome.retryAfterMs);
    await deps.fail({
      claimId: work.claimId,
      description: `${outcome.kind}:${outcome.description}`,
      retryDelayMs,
    });
    if (retryDelayMs !== null) {
      await deps.reschedule(retryDelayMs);
    }
    return { delivered: false, reason: outcome.kind };
  }

  const messageId = postedMessageId ?? work.messageId ?? null;
  if (messageId === null) {
    return { delivered: false, reason: "NO_MESSAGE_ID" };
  }

  const commit = await deps.commit({
    claimId: work.claimId,
    messageId,
    deliveredVersion: work.targetVersion,
  });

  if (!commit.committed) {
    // The claim moved on while we were in flight. Anything we created is an
    // orphan, and a group must never be left holding two cards.
    if (recovered || work.mode === "post") {
      await deps.port.remove({ chatId: work.chatId, messageId });
    }
    return { delivered: false, reason: commit.reason };
  }

  if (commit.staleVersion) {
    // A newer event landed mid-flight; one more pass folds it into this card.
    await deps.reschedule(0);
  }

  return { delivered: true, recovered };
}

export type OutboundDeliveryOutcome =
  | { delivered: true; fixture?: boolean }
  | { delivered: false; reason: string };

export type OutboundDeliveryDeps = {
  claim: () => Promise<ClaimOutboundResult>;
  commit: (input: {
    claimId: string;
    telegramMessageId: number;
  }) => Promise<CommitOutboundResult>;
  fail: (input: {
    claimId: string;
    description: string;
    retryDelayMs: number | null;
  }) => Promise<FailOutboundResult>;
  reschedule: (delayMs: number) => Promise<void>;
  port: TelegramPort;
  fixture: boolean;
};

/** Posts one one-shot message — today, only the tip confirmation. */
export async function deliverOutboundMessage(
  deps: OutboundDeliveryDeps,
): Promise<OutboundDeliveryOutcome> {
  const claim = await deps.claim();
  if (!claim.claimed) {
    return { delivered: false, reason: claim.reason };
  }

  const work = claim.work;

  if (deps.fixture) {
    await deps.commit({
      claimId: work.claimId,
      telegramMessageId: deps.port.fixtureMessageId?.() ?? 1,
    });
    return { delivered: true, fixture: true };
  }

  const outcome = await deps.port.send({ chatId: work.chatId, text: work.messageText });

  if (!outcome.ok) {
    const retryDelayMs = nextRetryDelayMs(work.attempt, outcome.kind, outcome.retryAfterMs);
    await deps.fail({
      claimId: work.claimId,
      description: `${outcome.kind}:${outcome.description}`,
      retryDelayMs,
    });
    if (retryDelayMs !== null) {
      await deps.reschedule(retryDelayMs);
    }
    return { delivered: false, reason: outcome.kind };
  }

  const commit = await deps.commit({
    claimId: work.claimId,
    telegramMessageId: outcome.result.message_id,
  });

  if (!commit.committed) {
    await deps.port.remove({ chatId: work.chatId, messageId: outcome.result.message_id });
    return { delivered: false, reason: commit.reason };
  }

  return { delivered: true };
}

/** Narrow re-export so callers do not import the transport for one symbol. */
export type { Id };
