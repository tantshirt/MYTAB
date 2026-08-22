"use client";

import { useCallback } from "react";
import {
  useOptionalTelegramRuntime,
  type TelegramRuntimeContextValue,
  type TelegramWebApp,
} from "./TelegramRuntimeProvider";
import { BOT_API_VERSION, safeInvoke } from "./telegramChrome";

/**
 * `WebApp.shareMessage` — Telegram's own share sheet (Bot API 8.0).
 *
 * The bot posts nothing here. It mints a message with
 * `savePreparedInlineMessage` server-side, hands the id to this method, and
 * Telegram opens a chat picker owned by Telegram. The *person* chooses where it
 * goes. That is the whole reason "Share to group" does not become a sixth
 * sanctioned bot event (EXPERIENCE, *The Telegram Surface*).
 *
 * Two outcomes arrive, and they are not the same kind of thing:
 *
 *   - `shareMessageSent` — it went.
 *   - `shareMessageFailed` with `{ error }`, one of `UNSUPPORTED`,
 *     `MESSAGE_EXPIRED`, `MESSAGE_SEND_FAILED`, `USER_DECLINED`,
 *     `UNKNOWN_ERROR`.
 *
 * `USER_DECLINED` is a person closing a sheet. It is not a failure and it gets
 * no copy — the same principle as EXPERIENCE's "a cancelled wallet prompt is
 * not a failure", which is why it is modelled as its own `declined` status
 * rather than as a `failed` reason the UI then has to remember to special-case.
 */

export const SHARE_MESSAGE_FAILURE_REASONS = [
  "UNSUPPORTED",
  "MESSAGE_EXPIRED",
  "MESSAGE_SEND_FAILED",
  "USER_DECLINED",
  "UNKNOWN_ERROR",
] as const;

export type ShareMessageFailureReason = (typeof SHARE_MESSAGE_FAILURE_REASONS)[number];

/** Every reason except the one that is not a failure. */
export type ShareMessageErrorReason = Exclude<ShareMessageFailureReason, "USER_DECLINED">;

export type ShareMessageOutcome =
  | { status: "sent" }
  /** The person closed the share sheet. Silent, always. */
  | { status: "declined" }
  | { status: "failed"; reason: ShareMessageErrorReason };

const FAILURE_REASON_SET: ReadonlySet<string> = new Set(SHARE_MESSAGE_FAILURE_REASONS);

/**
 * Maps a `shareMessageFailed` payload onto an outcome.
 *
 * Anything unrecognised — a reason Telegram adds after this was written, or a
 * malformed payload — becomes `UNKNOWN_ERROR` rather than being silently
 * treated as a decline. Guessing "they cancelled" over a real failure would
 * make the product lie about what happened.
 */
export function shareOutcomeForError(error: unknown): ShareMessageOutcome {
  if (error === "USER_DECLINED") {
    return { status: "declined" };
  }
  if (typeof error === "string" && FAILURE_REASON_SET.has(error)) {
    return { status: "failed", reason: error as ShareMessageErrorReason };
  }
  return { status: "failed", reason: "UNKNOWN_ERROR" };
}

/**
 * How long a `false` from the optional callback waits for `shareMessageFailed`
 * to explain itself.
 *
 * The callback says only "not sent"; the event says why. On every client that
 * emits both, the event lands in the same tick. If it never arrives, the
 * quietest true-enough reading of a `false` is that the person closed the
 * sheet — so the wait ends in silence rather than in an error line nobody
 * earned.
 */
export const SHARE_MESSAGE_CALLBACK_GRACE_MS = 400;

/**
 * The gate, as one predicate.
 *
 * Three conditions, all of them necessary: inside Telegram at all, Bot API 8.0
 * or better, and a client that actually exposes the method — a version string
 * is a claim, `typeof` is the fact. Anything less is *absent*, never disabled:
 * POLISH-SPEC — "a visible button that does nothing is worse than an absent
 * one."
 */
export function shareMessageAvailable(
  runtime: Pick<TelegramRuntimeContextValue, "isTelegramWebApp" | "isVersionAtLeast"> | null,
  webApp: Pick<TelegramWebApp, "shareMessage"> | null | undefined,
): boolean {
  return Boolean(
    runtime?.isTelegramWebApp &&
      // The one version comparator in the product — never a second one.
      runtime.isVersionAtLeast(BOT_API_VERSION.shareMessage) &&
      typeof webApp?.shareMessage === "function",
  );
}

/**
 * Opens the share sheet and resolves once Telegram says what happened.
 *
 * Pure with respect to React so the interesting half — which outcome each
 * signal produces — can be exercised without a renderer.
 *
 * Both channels are listened to, because clients disagree about which they
 * emit. The events carry the reason; the callback carries only a boolean, so a
 * `false` waits `SHARE_MESSAGE_CALLBACK_GRACE_MS` for `shareMessageFailed` to
 * explain itself before falling back to the quietest reading.
 */
export function runShareMessage(
  app: TelegramWebApp | null | undefined,
  preparedMessageId: string,
): Promise<ShareMessageOutcome> {
  return new Promise<ShareMessageOutcome>((resolve) => {
    if (!app || typeof app.shareMessage !== "function") {
      resolve({ status: "failed", reason: "UNSUPPORTED" });
      return;
    }

    let settled = false;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (outcome: ShareMessageOutcome) => {
      if (settled) {
        return;
      }
      settled = true;
      if (graceTimer !== undefined) {
        clearTimeout(graceTimer);
      }
      app.offEvent?.("shareMessageSent", onSent);
      app.offEvent?.("shareMessageFailed", onFailed);
      resolve(outcome);
    };

    const onSent = () => finish({ status: "sent" });
    const onFailed = (payload?: unknown) =>
      finish(shareOutcomeForError((payload as { error?: unknown } | undefined)?.error));

    app.onEvent?.("shareMessageSent", onSent);
    app.onEvent?.("shareMessageFailed", onFailed);

    // `safeInvoke` swallows WebAppMethodUnsupported, which an 8.0 check cannot
    // catch on a client that overstates its version.
    const invoked = safeInvoke("shareMessage", () =>
      app.shareMessage!(preparedMessageId, (sent) => {
        if (sent) {
          finish({ status: "sent" });
          return;
        }
        graceTimer = setTimeout(
          () => finish({ status: "declined" }),
          SHARE_MESSAGE_CALLBACK_GRACE_MS,
        );
      }),
    );

    if (!invoked) {
      finish({ status: "failed", reason: "UNSUPPORTED" });
    }
  });
}

export type ShareMessageApi = {
  /**
   * True only inside Telegram, on Bot API 8.0+, on a client that actually
   * exposes the method. Callers render the control on this and nothing else,
   * so below 8.0 the button is absent rather than dead.
   */
  available: boolean;
  share: (preparedMessageId: string) => Promise<ShareMessageOutcome>;
};

export function useShareMessage(): ShareMessageApi {
  // No provider (server render, tests, a standalone browser) is a legitimate
  // "not here", and resolves to absent rather than to a throw.
  const runtime = useOptionalTelegramRuntime();
  const webApp = typeof window === "undefined" ? undefined : window.Telegram?.WebApp;

  const available = shareMessageAvailable(runtime, webApp);

  const share = useCallback(
    (preparedMessageId: string): Promise<ShareMessageOutcome> =>
      runShareMessage(
        typeof window === "undefined" ? undefined : window.Telegram?.WebApp,
        preparedMessageId,
      ),
    [],
  );

  return { available, share };
}
