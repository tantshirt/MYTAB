"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConvex } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { isConvexAuthFixtureMode } from "@/lib/privy/config";

/**
 * The one place the app learns whether there is a live Convex client, and the
 * only place `convex/react` is touched outside a `use*Data` seam.
 *
 * Why not `useQuery` from `convex/react`: it throws "Could not find Convex
 * client!" when no provider is mounted, and this app deliberately runs without
 * one — tests, and any environment missing `NEXT_PUBLIC_CONVEX_URL` or
 * `NEXT_PUBLIC_PRIVY_APP_ID` (`isConvexAuthFixtureMode`). `useConvex()` itself
 * returns `undefined` in that case rather than throwing, so subscribing through
 * `client.watchQuery` gives the same reactivity with a defined "nothing to
 * read" answer and no conditional hook calls.
 */

/** EXPERIENCE, *Concurrency and Revision* — one line, no modal, no reload. */
export const STALE_NOTICE = "That changed a moment ago.";

export type LiveQueryResult<T> = {
  /** `undefined` until the subscription resolves. */
  data: T | undefined;
  error: Error | null;
  /**
   * There is no Convex client (fixture-auth mode, or no provider above).
   *
   * It is **not** a licence to render something instead. No surface in this
   * product carries fixture data any more: with no client there is nothing to
   * read, and the seam resolves to its designed empty state. The flag exists so
   * a caller can tell "nothing to read" apart from "still reading" — the
   * difference between an empty state and a spinner — and so `useViewer` can
   * resolve the fixture *identity* that lets the app boot without Privy.
   */
  fixture: boolean;
  /** First read has not resolved. Pair with `useHasPainted` before showing a skeleton. */
  loading: boolean;
};

function useOptionalConvex(): ConvexReactClient | undefined {
  // `useConvex()` is typed non-nullable but returns the raw context value,
  // which is `undefined` with no provider above.
  return useConvex() as ConvexReactClient | undefined;
}

/** True when reads and writes go to a real deployment. */
export function useIsLive(): boolean {
  const convex = useOptionalConvex();
  return convex !== undefined && !isConvexAuthFixtureMode();
}

/**
 * A reactive Convex query that degrades to `{ fixture: true }` with no client.
 *
 * `nonce` is the retry seam: bumping it re-subscribes, which is what every
 * §4.3 "Try again" does.
 */
export function useLiveQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query> | "skip",
  nonce = 0,
): LiveQueryResult<FunctionReturnType<Query>> {
  const convex = useOptionalConvex();
  const live = convex !== undefined && !isConvexAuthFixtureMode();
  const skip = args === "skip";
  const argsKey = skip ? "skip" : JSON.stringify(args);

  const [state, setState] = useState<{
    data: FunctionReturnType<Query> | undefined;
    error: Error | null;
  }>({ data: undefined, error: null });

  useEffect(() => {
    if (!live || convex === undefined || args === "skip") {
      setState({ data: undefined, error: null });
      return;
    }

    let cancelled = false;
    const watch = convex.watchQuery(query, args as FunctionArgs<Query>);

    const publish = () => {
      if (cancelled) {
        return;
      }
      try {
        setState({ data: watch.localQueryResult(), error: null });
      } catch (cause) {
        setState({
          data: undefined,
          error: cause instanceof Error ? cause : new Error(String(cause)),
        });
      }
    };

    publish();
    const unsubscribe = watch.onUpdate(publish);

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // `query` is a module-level function reference; `argsKey` is its value identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convex, live, argsKey, nonce]);

  return {
    data: state.data,
    error: state.error,
    fixture: !live,
    loading: live && !skip && state.data === undefined && state.error === null,
  };
}

/**
 * A Convex mutation, or `null` when there is no client — the callers use that
 * `null` as "this control cannot write", which is the same shape §4.5 needs
 * outside Telegram.
 */
export function useLiveMutation<Mutation extends FunctionReference<"mutation">>(
  mutation: Mutation,
): ((args: FunctionArgs<Mutation>) => Promise<FunctionReturnType<Mutation>>) | null {
  const convex = useOptionalConvex();
  const live = convex !== undefined && !isConvexAuthFixtureMode();

  return useMemo(() => {
    if (!live || convex === undefined) {
      return null;
    }
    return (args: FunctionArgs<Mutation>) => convex.mutation(mutation, args);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convex, live]);
}

/**
 * A Convex action, or `null` when there is no client.
 *
 * Same contract as `useLiveMutation` — callers read the `null` as "this cannot
 * reach the server", and a control that depends on it renders as absent rather
 * than as a button that does nothing.
 */
export function useLiveAction<Action extends FunctionReference<"action">>(
  actionRef: Action,
): ((args: FunctionArgs<Action>) => Promise<FunctionReturnType<Action>>) | null {
  const convex = useOptionalConvex();
  const live = convex !== undefined && !isConvexAuthFixtureMode();

  return useMemo(() => {
    if (!live || convex === undefined) {
      return null;
    }
    return (args: FunctionArgs<Action>) => convex.action(actionRef, args);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convex, live]);
}

/**
 * The group this surface is scoped to.
 *
 * Every group-scoped Convex read (`activity.listForGroup`,
 * `tabs.listOpenTabsForGroup`, `groups.getGroup`) needs a `groupId`, and the
 * only viewer-level group signal in the client is the `?group=` key the rest of
 * the app already uses (`/tabs/new?group=`).
 *
 * Read from `window.location` rather than `useSearchParams` on purpose: the tab
 * bar surfaces have no Suspense boundary, and `useSearchParams` would opt the
 * whole route out of static rendering.
 */
export function useGroupScope(): string | null {
  const [groupId, setGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const value = new URLSearchParams(window.location.search).get("group");
    setGroupId(value && value.length > 0 ? value : null);
  }, []);

  return groupId;
}

/** The §4.3 retry seam shared by every surface that offers "Try again". */
export function useRetryNonce(): { nonce: number; retry: () => void } {
  const [nonce, setNonce] = useState(0);
  const retry = useCallback(() => setNonce((value) => value + 1), []);
  return { nonce, retry };
}

/**
 * The viewer's Telegram user id, as a string, from launch params.
 *
 * `users.viewer` returns the Privy DID, not a Convex `users` id, so it cannot be
 * compared against the `userId` fields group reads return. Telegram's id is the
 * join key those reads *do* carry (`groupMembers.telegramUserId`).
 */
export function telegramUserIdFrom(
  initDataUnsafe: Record<string, unknown> | null,
): string | null {
  const user = initDataUnsafe?.user as { id?: unknown } | undefined;
  if (typeof user?.id === "number" || typeof user?.id === "string") {
    return String(user.id);
  }
  return null;
}
