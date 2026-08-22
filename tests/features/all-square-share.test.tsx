import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AllSquareCard, ALL_SQUARE_COPY } from "@/features/balances/AllSquareCard";
import { BOT_API_VERSION, versionAtLeast } from "@/features/telegram/telegramChrome";
import {
  runShareMessage,
  shareMessageAvailable,
  shareOutcomeForError,
  SHARE_MESSAGE_CALLBACK_GRACE_MS,
  SHARE_MESSAGE_FAILURE_REASONS,
} from "@/features/telegram/useShareMessage";
import { findBannedCopyWords } from "@/lib/telegram/messages";

const CAST = [
  { userId: "users:maya", displayName: "Maya" },
  { userId: "users:andre", displayName: "Andre" },
];

function render(props: Partial<React.ComponentProps<typeof AllSquareCard>> = {}) {
  return renderToStaticMarkup(
    <AllSquareCard
      billName="Sukhumvit Dinner"
      amountLabel="฿1,840.00"
      settledCount={5}
      totalCount={5}
      members={CAST}
      onDismiss={() => undefined}
      {...props}
    />,
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Handler = (payload?: unknown) => void;

/**
 * A Telegram client with a `shareMessage` that does exactly what the test asks
 * and nothing else — no auto-callback, no auto-event.
 */
function fakeWebApp(
  options: {
    shareMessage?: (msgId: string, callback?: (sent: boolean) => void) => void;
  } = {},
) {
  const listeners = new Map<string, Set<Handler>>();
  const calls: string[] = [];

  const app = {
    calls,
    emit(event: string, payload?: unknown) {
      for (const handler of listeners.get(event) ?? []) {
        handler(payload);
      }
    },
    listenerCount(event: string) {
      return listeners.get(event)?.size ?? 0;
    },
    onEvent(event: string, handler: Handler) {
      const set = listeners.get(event) ?? new Set<Handler>();
      set.add(handler);
      listeners.set(event, set);
    },
    offEvent(event: string, handler: Handler) {
      listeners.get(event)?.delete(handler);
    },
    shareMessage:
      options.shareMessage ??
      ((msgId: string) => {
        calls.push(msgId);
      }),
  };

  return app as typeof app & Record<string, unknown>;
}

describe("Share to group — the version gate (Bot API 8.0)", () => {
  const inTelegram = (version: string) => ({
    isTelegramWebApp: true,
    isVersionAtLeast: (target: string) => versionAtLeast({ version }, target),
  });

  it("names 8.0, the release shareMessage landed in", () => {
    expect(BOT_API_VERSION.shareMessage).toBe("8.0");
  });

  it("is available on 8.0 and above", () => {
    expect(shareMessageAvailable(inTelegram("8.0"), fakeWebApp())).toBe(true);
    expect(shareMessageAvailable(inTelegram("8.3"), fakeWebApp())).toBe(true);
    expect(shareMessageAvailable(inTelegram("9.0"), fakeWebApp())).toBe(true);
  });

  it("is unavailable below 8.0 — the button is absent, never disabled", () => {
    expect(shareMessageAvailable(inTelegram("7.10"), fakeWebApp())).toBe(false);
    expect(shareMessageAvailable(inTelegram("7.7"), fakeWebApp())).toBe(false);
    expect(shareMessageAvailable(inTelegram("6.0"), fakeWebApp())).toBe(false);
  });

  it("is unavailable outside Telegram, however new the browser is", () => {
    expect(
      shareMessageAvailable(
        { isTelegramWebApp: false, isVersionAtLeast: () => true },
        fakeWebApp(),
      ),
    ).toBe(false);
  });

  it("is unavailable with no runtime at all — server render, standalone browser", () => {
    expect(shareMessageAvailable(null, fakeWebApp())).toBe(false);
  });

  it("believes `typeof`, not the version string, about the method existing", () => {
    expect(shareMessageAvailable(inTelegram("8.5"), {})).toBe(false);
    expect(shareMessageAvailable(inTelegram("8.5"), undefined)).toBe(false);
  });
});

describe("Share to group — every shareMessageFailed reason", () => {
  it("covers exactly the five reasons Telegram documents", () => {
    expect([...SHARE_MESSAGE_FAILURE_REASONS]).toEqual([
      "UNSUPPORTED",
      "MESSAGE_EXPIRED",
      "MESSAGE_SEND_FAILED",
      "USER_DECLINED",
      "UNKNOWN_ERROR",
    ]);
  });

  it("USER_DECLINED is not a failure — it is a person changing their mind", () => {
    expect(shareOutcomeForError("USER_DECLINED")).toEqual({ status: "declined" });
  });

  it("the other four are failures, each kept as itself", () => {
    for (const reason of ["UNSUPPORTED", "MESSAGE_EXPIRED", "MESSAGE_SEND_FAILED", "UNKNOWN_ERROR"] as const) {
      expect(shareOutcomeForError(reason)).toEqual({ status: "failed", reason });
    }
  });

  it("never guesses `declined` over something it does not recognise", () => {
    for (const odd of ["SOMETHING_NEW", "", undefined, null, 7, {}]) {
      expect(shareOutcomeForError(odd)).toEqual({
        status: "failed",
        reason: "UNKNOWN_ERROR",
      });
    }
  });
});

describe("Share to group — driving Telegram's share sheet", () => {
  it("hands the prepared message id straight to shareMessage", async () => {
    const app = fakeWebApp();
    const pending = runShareMessage(app as any, "prepared-abc");
    app.emit("shareMessageSent");
    await expect(pending).resolves.toEqual({ status: "sent" });
    expect(app.calls).toEqual(["prepared-abc"]);
  });

  it("resolves declined on USER_DECLINED, with no error to show", async () => {
    const app = fakeWebApp();
    const pending = runShareMessage(app as any, "prepared-abc");
    app.emit("shareMessageFailed", { error: "USER_DECLINED" });
    await expect(pending).resolves.toEqual({ status: "declined" });
  });

  it("resolves failed on a real failure, carrying the reason", async () => {
    const app = fakeWebApp();
    const pending = runShareMessage(app as any, "prepared-abc");
    app.emit("shareMessageFailed", { error: "MESSAGE_SEND_FAILED" });
    await expect(pending).resolves.toEqual({
      status: "failed",
      reason: "MESSAGE_SEND_FAILED",
    });
  });

  it("unsubscribes both listeners once it has an answer", async () => {
    const app = fakeWebApp();
    const pending = runShareMessage(app as any, "prepared-abc");
    expect(app.listenerCount("shareMessageSent")).toBe(1);
    expect(app.listenerCount("shareMessageFailed")).toBe(1);

    app.emit("shareMessageSent");
    await pending;

    expect(app.listenerCount("shareMessageSent")).toBe(0);
    expect(app.listenerCount("shareMessageFailed")).toBe(0);
  });

  it("settles once — a late event cannot change the answer", async () => {
    const app = fakeWebApp();
    const pending = runShareMessage(app as any, "prepared-abc");
    app.emit("shareMessageSent");
    app.emit("shareMessageFailed", { error: "MESSAGE_SEND_FAILED" });
    await expect(pending).resolves.toEqual({ status: "sent" });
  });

  it("takes the callback's `true` as sent", async () => {
    const app = fakeWebApp({
      shareMessage: (_msgId, callback) => callback?.(true),
    });
    await expect(runShareMessage(app as any, "prepared-abc")).resolves.toEqual({
      status: "sent",
    });
  });

  it("lets a bare callback `false` be explained by the event", async () => {
    let deferred: (() => void) | null = null;
    const app = fakeWebApp({
      shareMessage: (_msgId, callback) => {
        deferred = () => callback?.(false);
      },
    });

    const pending = runShareMessage(app as any, "prepared-abc");
    deferred!();
    app.emit("shareMessageFailed", { error: "MESSAGE_EXPIRED" });

    await expect(pending).resolves.toEqual({
      status: "failed",
      reason: "MESSAGE_EXPIRED",
    });
  });

  it("reads an unexplained callback `false` as a decline, and says nothing", async () => {
    vi.useFakeTimers();
    try {
      const app = fakeWebApp({
        shareMessage: (_msgId, callback) => callback?.(false),
      });
      const pending = runShareMessage(app as any, "prepared-abc");
      await vi.advanceTimersByTimeAsync(SHARE_MESSAGE_CALLBACK_GRACE_MS + 1);
      await expect(pending).resolves.toEqual({ status: "declined" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats a client that throws WebAppMethodUnsupported as UNSUPPORTED", async () => {
    const app = fakeWebApp({
      shareMessage: () => {
        throw new Error("WebAppMethodUnsupported");
      },
    });
    await expect(runShareMessage(app as any, "prepared-abc")).resolves.toEqual({
      status: "failed",
      reason: "UNSUPPORTED",
    });
  });

  it("treats a client with no method at all as UNSUPPORTED", async () => {
    await expect(runShareMessage(undefined, "prepared-abc")).resolves.toEqual({
      status: "failed",
      reason: "UNSUPPORTED",
    });
    await expect(runShareMessage({} as any, "prepared-abc")).resolves.toEqual({
      status: "failed",
      reason: "UNSUPPORTED",
    });
  });
});

/** React escapes the apostrophe on the way out; assert what the DOM will hold. */
const SHARE_FAILED_HTML = ALL_SQUARE_COPY.shareFailed.replace(/'/g, "&#x27;");

describe("Share to group — what the card renders", () => {
  it("shows the button only when a handler exists, and promotes Done otherwise", () => {
    expect(render()).not.toContain(ALL_SQUARE_COPY.share);
    expect(render({ onShare: () => undefined })).toContain(ALL_SQUARE_COPY.share);
  });

  it("says nothing at all when a share simply did not happen", () => {
    const html = render({ onShare: () => undefined, shareError: null });
    expect(html).not.toContain(SHARE_FAILED_HTML);
    expect(html).not.toMatch(/couldn|failed|error/i);
  });

  it("shows one plain line, in a polite live region, for a real failure", () => {
    const html = render({
      onShare: () => undefined,
      shareError: ALL_SQUARE_COPY.shareFailed,
    });
    expect(html).toContain(SHARE_FAILED_HTML);
    // Once, not twice — the moment is already announced above it.
    expect(html.split(SHARE_FAILED_HTML)).toHaveLength(2);
    expect(html).toContain('role="status"');
  });

  it("never shows an error next to an absent button", () => {
    const html = render({ shareError: ALL_SQUARE_COPY.shareFailed });
    expect(html).not.toContain(SHARE_FAILED_HTML);
  });

  it("keeps the failure line in the product's voice", () => {
    expect(ALL_SQUARE_COPY.shareFailed).toBe("Couldn't share that. Try again.");
    expect(findBannedCopyWords(ALL_SQUARE_COPY.shareFailed)).toEqual([]);
    // §4.0 — never apologise, never explain the mechanism.
    expect(ALL_SQUARE_COPY.shareFailed).not.toMatch(/sorry|apolog/i);
    expect(ALL_SQUARE_COPY.shareFailed).not.toMatch(/telegram|api|server/i);
  });
});
