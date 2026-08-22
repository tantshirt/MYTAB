/**
 * Bug 3 — `useTabData` swallowed every `TOKEN_*` error.
 *
 * Every string in INVITE-FLOW §6 and §7 was unreachable code: the hook caught
 * each rejection and quietly reused the start parameter as a raw tab id, so a
 * dead link painted an ordinary empty board. These tests hold the copy to the
 * document, and hold the mapping to the rule that a refusal can never resolve
 * to a readable tab.
 */

import { describe, expect, it } from "vitest";
import { TAB_ADMISSION_FAILURE } from "../../convex/lib/sessionTokenOps";
import {
  TAB_REFUSAL_ACTION_LABEL,
  refusalFor,
  refusedTab,
  type TabRefusalCode,
} from "@/features/tabs/useTabData";

const MAYA = { tabName: "Sukhumvit Dinner", peopleCount: 5, organizerName: "Maya" };

describe("§7 — the failure matrix, word for word", () => {
  it("row 6 — token expired, not on the roster", () => {
    expect(refusalFor("LINK_EXPIRED", MAYA).message).toBe(
      "This link is no longer active. Ask Maya for a new one.",
    );
  });

  it("row 7 — revoked says the same words under a distinct code", () => {
    const expired = refusalFor("LINK_EXPIRED", MAYA);
    const revoked = refusalFor("LINK_REVOKED", MAYA);

    expect(revoked.message).toBe(expired.message);
    expect(revoked.code).not.toBe(expired.code);
  });

  it("row 9 — the tab is full, and the next action is a seat, not a new link", () => {
    const full = refusalFor("TAB_FULL", MAYA);
    expect(full.message).toBe("This tab is full. Ask Maya to add you.");
    // The whole point of surfacing distinct causes: different next action.
    expect(full.message).not.toBe(refusalFor("LINK_EXPIRED", MAYA).message);
  });

  it("row 10 — locked before they ever claimed", () => {
    expect(refusalFor("TAB_LOCKED_NO_ENTRY", MAYA).message).toBe(
      "Maya already locked this bill. There's nothing left to claim.",
    );
  });

  it("row 18 — the tab is gone", () => {
    expect(refusalFor("TAB_CLOSED", MAYA).message).toBe("This tab is closed.");
  });

  it("§6.2 — live getChatMember said no", () => {
    expect(refusalFor("NOT_GROUP_MEMBER", MAYA).message).toBe(
      "Only people in this chat can open this tab.",
    );
  });

  it("row 21 — the chat check could not be completed, and never silently admits", () => {
    const unproven = refusalFor("MEMBERSHIP_UNPROVEN");
    expect(unproven.message).toBe("Can't check the chat right now. Try again in a moment.");
    expect(unproven.action).toBe("retry");
  });

  it("row 12 — opened outside Telegram", () => {
    expect(refusalFor("OPEN_IN_TELEGRAM").message).toBe(
      "Open this in Telegram to make changes.",
    );
  });

  it("row 19 — the retries are spent", () => {
    expect(refusalFor("UNAVAILABLE").message).toBe(
      "Can't get you in right now. Try the link again in a moment.",
    );
  });

  it("names the organizer where the design names her, and never leaves a blank", () => {
    expect(refusalFor("TAB_FULL", null).message).toBe(
      "This tab is full. Ask the organizer to add you.",
    );
    expect(refusalFor("TAB_FULL", { ...MAYA, organizerName: null }).message).not.toContain(
      "undefined",
    );
  });

  it("offers only the two designed actions", () => {
    expect(TAB_REFUSAL_ACTION_LABEL).toEqual({
      back: "Back to my tabs",
      retry: "Try again",
    });
  });
});

describe("every server refusal reaches the person as its own cause", () => {
  const serverCodes = Object.values(TAB_ADMISSION_FAILURE) as TabRefusalCode[];

  it("covers every code the server can return", () => {
    for (const code of serverCodes) {
      const refusal = refusalFor(code, MAYA);
      expect(refusal.message.length).toBeGreaterThan(0);
      // No raw codes on screen (§7 preamble).
      expect(refusal.message).not.toContain(code);
      expect(refusal.message).not.toMatch(/error|failed|undefined|null/i);
    }
  });

  it("keeps the four causes a person must be able to tell apart distinct", () => {
    const messages = new Set(
      (
        [
          "LINK_EXPIRED",
          "TAB_FULL",
          "TAB_LOCKED_NO_ENTRY",
          "TAB_CLOSED",
          "NOT_GROUP_MEMBER",
        ] as TabRefusalCode[]
      ).map((code) => refusalFor(code, MAYA).message),
    );
    expect(messages.size).toBe(5);
  });

  it("preserves the distinct code alongside the shared copy", () => {
    for (const code of serverCodes) {
      expect(refusalFor(code, MAYA).code).toBe(code);
    }
  });

  it("REGRESSION: no refusal can resolve to a readable tab", () => {
    // The swallow bug in one assertion. Every code — including the ones that
    // used to fall through to `{ status: "ready", tabId: publicToken }` —
    // produces an invalid state carrying its own words.
    for (const code of [...serverCodes, "UNAVAILABLE" as TabRefusalCode]) {
      const resolved = refusedTab(refusalFor(code, MAYA));
      expect(resolved.status).toBe("invalid");
      if (resolved.status !== "invalid") {
        continue;
      }
      expect(resolved.message).toBe(refusalFor(code, MAYA).message);
      expect(resolved.code).toBe(code);
    }
  });

  it("carries group facts only — tab name and people count, no amounts", () => {
    const refusal = refusalFor("TAB_FULL", MAYA);
    expect(refusal.facts).toEqual(MAYA);
    expect(Object.keys(refusal.facts ?? {})).not.toContain("total");
  });
});
