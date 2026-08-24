import { describe, expect, it } from "vitest";
import { findBannedCopyWords } from "@/lib/telegram/messages";
import { GROUP_BOT_COMMANDS, PRIVATE_BOT_COMMANDS } from "@/lib/telegram/botSurface";
import {
  FALLBACK_MESSAGE,
  HELP_MESSAGE,
  PRIVATE_FALLBACK_WINDOW_MS,
  START_TAB_REPLY,
  WELCOME_MESSAGE,
  planPrivateReply,
  renderStartTokenCard,
} from "@/lib/telegram/privateMessages";

describe("private chat copy", () => {
  it("answers /start with the welcome card and three doors", () => {
    const plan = planPrivateReply({
      command: "start",
      commandArg: null,
      now: 1_000,
    });
    expect(plan).toEqual({
      kind: "reply",
      text: WELCOME_MESSAGE,
      buttons: ["start_tab", "what_i_owe", "add_to_group"],
      photo: true,
    });
  });

  it("hands a recovered token a working Open tab button", () => {
    const plan = planPrivateReply({
      command: "start",
      commandArg: "tok",
      now: 1_000,
      startTokenCard: { tabName: "Sukhumvit Dinner", organizerDisplayName: "Maya" },
    });
    expect(plan.kind).toBe("reply");
    if (plan.kind === "reply") {
      expect(plan.text).toBe(
        renderStartTokenCard({
          tabName: "Sukhumvit Dinner",
          organizerDisplayName: "Maya",
        }),
      );
      expect(plan.buttons).toEqual(["open_tab"]);
    }
  });

  it("rate-limits unrecognised private text to one reply per 60s", () => {
    const first = planPrivateReply({
      command: null,
      commandArg: null,
      now: 10_000,
      lastFallbackAt: null,
    });
    expect(first.kind).toBe("reply");
    if (first.kind === "reply") {
      expect(first.text).toBe(FALLBACK_MESSAGE);
    }

    const second = planPrivateReply({
      command: null,
      commandArg: null,
      now: 10_000 + PRIVATE_FALLBACK_WINDOW_MS - 1,
      lastFallbackAt: 10_000,
    });
    expect(second).toEqual({ kind: "silent" });
  });

  it("routes /tab to Start a tab and /help to the help card", () => {
    expect(planPrivateReply({ command: "tab", commandArg: null, now: 1 })).toMatchObject({
      text: START_TAB_REPLY,
      buttons: ["start_tab"],
    });
    expect(planPrivateReply({ command: "help", commandArg: null, now: 1 })).toMatchObject({
      text: HELP_MESSAGE,
      buttons: ["start_tab"],
    });
  });

  it("keeps every private string off the banned-copy list", () => {
    const texts = [
      WELCOME_MESSAGE,
      HELP_MESSAGE,
      FALLBACK_MESSAGE,
      START_TAB_REPLY,
      renderStartTokenCard({ tabName: "Sukhumvit Dinner", organizerDisplayName: "Maya" }),
    ];
    for (const text of texts) {
      expect(findBannedCopyWords(text)).toEqual([]);
    }
  });
});

describe("scoped command menus", () => {
  it("lists help only in private chats and never lists splitbill", () => {
    expect(PRIVATE_BOT_COMMANDS.map((row) => row.command)).toEqual([
      "tab",
      "balance",
      "help",
    ]);
    expect(GROUP_BOT_COMMANDS.map((row) => row.command)).toEqual(["tab", "balance"]);
    expect(PRIVATE_BOT_COMMANDS.some((row) => row.command === "splitbill")).toBe(false);
    expect(GROUP_BOT_COMMANDS.some((row) => row.command === "splitbill")).toBe(false);
  });
});

/*
 * The welcome is a photo caption now, not a message body. Telegram caps a
 * caption at 1024 characters and does NOT truncate past it — the whole send
 * fails — so the cap is a correctness bound, not a style note.
 */
describe("the welcome leads with the house still", () => {
  it("keeps the welcome inside Telegram's photo-caption cap", () => {
    expect(WELCOME_MESSAGE.length).toBeLessThanOrEqual(1024);
  });

  it("asks for the photo on a bare /start and on nothing else", () => {
    const welcome = planPrivateReply({ command: "start", commandArg: null, now: 0 });
    expect(welcome).toMatchObject({ kind: "reply", photo: true });

    for (const command of ["tab", "tip", "balance", "help", null]) {
      const plan = planPrivateReply({ command, commandArg: null, now: 0 });
      expect(plan.kind === "reply" && plan.photo).toBeFalsy();
    }
  });

  it("tells one story: the welcome and /help share their steps and commands", () => {
    for (const line of ["/tab — start a tab", "/balance — where you stand"]) {
      expect(WELCOME_MESSAGE).toContain(line);
      expect(HELP_MESSAGE).toContain(line);
    }
    expect(WELCOME_MESSAGE).toContain("How it works");
    expect(HELP_MESSAGE).toContain("How it works");
    // Routed but deliberately unlisted (INVITE-FLOW §2.2).
    expect(WELCOME_MESSAGE).not.toContain("/splitbill");
    expect(HELP_MESSAGE).not.toContain("/splitbill");
  });

  it("says nothing from the banned vocabulary", () => {
    // The project's own list, not a second one written here — a private copy
    // of the ban list would drift away from the one that matters.
    for (const copy of [WELCOME_MESSAGE, HELP_MESSAGE, FALLBACK_MESSAGE]) {
      expect(findBannedCopyWords(copy)).toEqual([]);
    }
  });
});
