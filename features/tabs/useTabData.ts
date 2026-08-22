"use client";

import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useIsLive, useLiveMutation } from "@/features/convex/useConvexData";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";

export const INVALID_LINK_MESSAGE = "This link is no longer valid.";

export type ResolvedTab =
  | { status: "loading" }
  | { status: "ready"; tabId: string; tabName: string | null }
  | { status: "invalid"; message: string };

/** Fixture tab for every environment without a Convex deployment. */
export const FIXTURE_TAB: ResolvedTab = {
  status: "ready",
  tabId: "tabs:fixture",
  tabName: "Sukhumvit Dinner",
};

/**
 * Turns the `/tabs/[publicToken]` route param into a Convex `tabs` id.
 *
 * The param is the opaque `startapp` token from the group message — a
 * `sessionTokens` row of type `tab_session`, never a tab id (`convex/schema.ts`
 * has no `publicToken` field on `tabs`). The only function that maps one to the
 * other is `api.sessionTokens.resolveTabSession`, and it is a **mutation**: it
 * joins the caller to `tabParticipants` as a side effect. There is no read-only
 * `resolveTabSessionRead(token)` query.
 *
 * So: inside Telegram the token is resolved (and the caller joins). Outside
 * Telegram every mutation is disabled (§4.5), so the param is used as a tab id
 * directly — which is what in-app links carry — and the board query decides
 * whether it is real. Either way reads keep working.
 */
export function useResolvedTab(publicToken: string): ResolvedTab {
  const live = useIsLive();
  const { isTelegramWebApp } = useTelegramRuntime();
  const resolveTabSession = useLiveMutation(api.sessionTokens.resolveTabSession);
  const [resolved, setResolved] = useState<ResolvedTab>({ status: "loading" });

  useEffect(() => {
    if (!live) {
      setResolved(
        publicToken === "invalid"
          ? { status: "invalid", message: INVALID_LINK_MESSAGE }
          : FIXTURE_TAB,
      );
      return;
    }

    if (!publicToken || publicToken.length < 8) {
      setResolved({ status: "invalid", message: INVALID_LINK_MESSAGE });
      return;
    }

    // The param is already a tab id, or the token resolve is unavailable.
    const asTabId: ResolvedTab = {
      status: "ready",
      tabId: publicToken,
      tabName: null,
    };

    if (!isTelegramWebApp || !resolveTabSession) {
      setResolved(asTabId);
      return;
    }

    let cancelled = false;
    setResolved({ status: "loading" });

    resolveTabSession({ token: publicToken })
      .then((session) => {
        if (!cancelled) {
          setResolved({ status: "ready", tabId: session.tabId, tabName: session.tabName });
        }
      })
      .catch(() => {
        // TOKEN_* rejections mean this was not a session token. Fall through to
        // the id path rather than declaring the link dead — `getClaimBoard` is
        // the authority on whether the tab exists and the viewer may read it.
        if (!cancelled) {
          setResolved(asTabId);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [live, publicToken, isTelegramWebApp, resolveTabSession]);

  return resolved;
}
