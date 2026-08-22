"use client";

import { api } from "@/convex/_generated/api";
import { useLiveQuery } from "@/features/convex/useConvexData";
import { useFixtureAuth } from "./fixture-auth";

/**
 * Subscribes to the authenticated Convex `viewer` query (`api.users.viewer`).
 *
 * Returns the Privy DID (`sub`) — **not** a Convex `users` id. Nothing that has
 * to match a `userId` coming back from a group or tab read can use this; those
 * reads carry `telegramUserId`, which is the join key the client actually has.
 *
 * `undefined` while the subscription is unresolved, `null` when unauthenticated.
 * In fixture mode (no Convex URL or Privy app id) it resolves to the fixture id
 * immediately, so no surface sits in a permanent loading state offline.
 */
export function useViewer(): string | null | undefined {
  const fixtureAuth = useFixtureAuth();
  const viewer = useLiveQuery(api.users.viewer, {});

  if (viewer.fixture) {
    return fixtureAuth?.userId ?? null;
  }

  if (viewer.error) {
    return null;
  }

  return viewer.data;
}
