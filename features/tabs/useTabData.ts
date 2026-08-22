"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useIsLive, useLiveAction } from "@/features/convex/useConvexData";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";

/** Fallback for a param that never reached the server as a token. */
export const INVALID_LINK_MESSAGE = "This link is no longer valid.";

/**
 * Every refusal in INVITE-FLOW §7, and the words it renders.
 *
 * These strings are the design, not paraphrases of it. They exist because the
 * next action differs per cause and the person has to be told which kind of
 * dead the link is: expired means ask for a new link, full means ask the
 * organizer for a seat, revoked means the tab moved on without them.
 *
 * They were unreachable code until now — `useResolvedTab` caught every
 * `TOKEN_*` rejection and silently reused the start parameter as a raw tab id,
 * so a dead link rendered as an ordinary empty board.
 */
export const TAB_REFUSAL_ACTION = {
  BACK: "back",
  RETRY: "retry",
} as const;

export type TabRefusalAction = (typeof TAB_REFUSAL_ACTION)[keyof typeof TAB_REFUSAL_ACTION];

/** Labels from §7 — every "Back to my tabs" lands on Tabs or the First Screen. */
export const TAB_REFUSAL_ACTION_LABEL: Record<TabRefusalAction, string> = {
  back: "Back to my tabs",
  retry: "Try again",
};

export type TabRefusalCode =
  | "LINK_NOT_FOUND"
  | "LINK_EXPIRED"
  | "LINK_REVOKED"
  | "TAB_CLOSED"
  | "TAB_LOCKED_NO_ENTRY"
  | "TAB_FULL"
  | "NOT_GROUP_MEMBER"
  | "BOT_NOT_ADMIN"
  | "MEMBERSHIP_UNPROVEN"
  | "OPEN_IN_TELEGRAM"
  | "UNAVAILABLE";

export type TabGroupFacts = {
  tabName: string;
  peopleCount: number;
  organizerName: string | null;
};

/** The organizer by name where the design names her, and never a blank. */
function organizer(facts: TabGroupFacts | null): string {
  return facts?.organizerName ?? "the organizer";
}

export type TabRefusal = {
  code: TabRefusalCode;
  message: string;
  action: TabRefusalAction;
  /** §7 — "group facts only": tab name and people count. Never amounts. */
  facts: TabGroupFacts | null;
};

export function refusalFor(
  code: TabRefusalCode,
  facts: TabGroupFacts | null = null,
): TabRefusal {
  const back = TAB_REFUSAL_ACTION.BACK;
  const retry = TAB_REFUSAL_ACTION.RETRY;

  switch (code) {
    // §7 rows 6 and 7 — same words, distinct internal codes on purpose.
    case "LINK_NOT_FOUND":
    case "LINK_EXPIRED":
    case "LINK_REVOKED":
      return {
        code,
        facts,
        action: back,
        message: `This link is no longer active. Ask ${organizer(facts)} for a new one.`,
      };

    // §7 row 9, and row 20's simultaneous-last-seat loser.
    case "TAB_FULL":
      return {
        code,
        facts,
        action: back,
        message: `This tab is full. Ask ${organizer(facts)} to add you.`,
      };

    // §7 row 10.
    case "TAB_LOCKED_NO_ENTRY":
      return {
        code,
        facts,
        action: back,
        message: `${organizer(facts)} already locked this bill. There's nothing left to claim.`,
      };

    // §7 row 18.
    case "TAB_CLOSED":
      return { code, facts, action: back, message: "This tab is closed." };

    // §6.2 — live getChatMember said no.
    case "NOT_GROUP_MEMBER":
      return {
        code,
        facts,
        action: back,
        message: "Only people in this chat can open this tab.",
      };

    // §7 row 21 — the membership check could not be completed. Never a silent
    // admit. `BOT_NOT_ADMIN` shares this string: INVITE-FLOW has no
    // tapper-facing copy for it (row 1 addresses the group chat), and "try
    // again" is the correct next action once the bot is an admin again.
    case "MEMBERSHIP_UNPROVEN":
    case "BOT_NOT_ADMIN":
      return {
        code,
        facts,
        action: retry,
        message: "Can't check the chat right now. Try again in a moment.",
      };

    // §6.2 last row / §7 row 12.
    case "OPEN_IN_TELEGRAM":
      return {
        code,
        facts,
        action: retry,
        message: "Open this in Telegram to make changes.",
      };

    // §7 row 19 — the silent retries are spent.
    case "UNAVAILABLE":
    default:
      return {
        code: "UNAVAILABLE",
        facts,
        action: retry,
        message: "Can't get you in right now. Try the link again in a moment.",
      };
  }
}

export type ResolvedTab =
  | { status: "loading" }
  | { status: "ready"; tabId: string; tabName: string | null }
  | ({ status: "invalid"; message: string } & TabRefusal);

/**
 * A refusal is a refusal.
 *
 * There is deliberately no branch in here that can produce `status: "ready"`.
 * The bug this replaces was exactly that branch: every `TOKEN_*` rejection fell
 * through to `{ status: "ready", tabId: publicToken }`, so a dead link opened an
 * ordinary-looking board and no designed string could ever render.
 */
export function refusedTab(refusal: TabRefusal): ResolvedTab {
  return { status: "invalid", ...refusal };
}

/**
 * The Mini App's bootstrap posts `initData` after Privy authenticates, so a tap
 * can reach the join before the Telegram context row exists. That is a race,
 * not a verdict — §7 row 19's "silent retry, then say so".
 */
const CONTEXT_RETRY_LIMIT = 3;
const CONTEXT_RETRY_DELAY_MS = 800;

/**
 * Turns the `/tabs/[publicToken]` route param into a Convex `tabs` id.
 *
 * The param is the opaque `startapp` token from the invite or the group card —
 * a `sessionTokens` row of type `tab_session`, never a tab id (`convex/schema.ts`
 * has no `publicToken` field on `tabs`).
 *
 * Inside Telegram it goes through `api.sessionTokens.joinTabSession`, an
 * **action**: it refreshes `getChatMember` when the cached check has aged past
 * five minutes and then runs the §5.6 resolution order in one transaction.
 * Outside Telegram every mutation is disabled (§4.5), so the param is used as a
 * tab id directly — which is what in-app links carry — and the board query
 * decides whether it is real.
 *
 * A refusal is now a refusal. It is never quietly re-read as a tab id, because
 * doing that is what made every string in §7 dead code.
 */
export function useResolvedTab(publicToken: string, retryNonce = 0): ResolvedTab {
  const live = useIsLive();
  const { isTelegramWebApp } = useTelegramRuntime();
  const joinTabSession = useLiveAction(api.sessionTokens.joinTabSession);
  const [resolved, setResolved] = useState<ResolvedTab>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const contextRetriesRef = useRef(0);

  // A different link, or an explicit "Try again", gets its own retry budget.
  useEffect(() => {
    contextRetriesRef.current = 0;
  }, [publicToken, retryNonce]);

  useEffect(() => {
    /*
     * No deployment to ask. There is no tab behind this link that anyone can
     * read, and a board invented to fill the gap would be a screen of money
     * that does not exist — so this resolves to §7 row 19's refusal, which is
     * the honest answer and already has designed words and a retry.
     */
    if (!live) {
      setResolved(
        refusedTab(
          publicToken === "invalid"
            ? { ...refusalFor("LINK_NOT_FOUND"), message: INVALID_LINK_MESSAGE }
            : refusalFor("UNAVAILABLE"),
        ),
      );
      return;
    }

    if (!publicToken || publicToken.length < 8) {
      setResolved(refusedTab(refusalFor("LINK_NOT_FOUND")));
      return;
    }

    // Outside Telegram the param is an in-app link's tab id, and reads still
    // work — §6.2's last row is a read-only surface, not a refusal.
    if (!isTelegramWebApp || !joinTabSession) {
      setResolved({ status: "ready", tabId: publicToken, tabName: null });
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setResolved({ status: "loading" });

    joinTabSession({ token: publicToken })
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (result.ok) {
          contextRetriesRef.current = 0;
          setResolved({ status: "ready", tabId: result.tabId, tabName: result.tabName });
          return;
        }

        // The bootstrap has not landed yet. Retry quietly before saying
        // anything — a person who tapped a good link is not looking at an
        // error while the launch is still finishing.
        if (
          result.code === "OPEN_IN_TELEGRAM" &&
          contextRetriesRef.current < CONTEXT_RETRY_LIMIT
        ) {
          contextRetriesRef.current += 1;
          timer = setTimeout(() => {
            if (!cancelled) {
              setAttempt((value) => value + 1);
            }
          }, CONTEXT_RETRY_DELAY_MS);
          return;
        }

        setResolved(
          refusedTab(
            refusalFor(
              result.code === "OPEN_IN_TELEGRAM" ? "UNAVAILABLE" : result.code,
              result.facts,
            ),
          ),
        );
      })
      .catch(() => {
        // A transport or auth failure, not a verdict about the link (§7 row 19).
        if (!cancelled) {
          setResolved(refusedTab(refusalFor("UNAVAILABLE")));
        }
      });

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [live, publicToken, isTelegramWebApp, joinTabSession, attempt, retryNonce]);

  return resolved;
}
