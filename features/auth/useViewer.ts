"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { isConvexAuthFixtureMode } from "@/lib/privy/config";
import { useFixtureAuth } from "./fixture-auth";

/**
 * Subscribes to the authenticated Convex `viewer` query.
 * In fixture mode (no Convex URL or Privy app id), returns the fixture user id.
 */
export function useViewer(): string | null | undefined {
  const fixtureAuth = useFixtureAuth();
  const isFixture = isConvexAuthFixtureMode();

  const viewer = useQuery(api.users.viewer, isFixture ? "skip" : {});

  if (isFixture) {
    return fixtureAuth?.userId ?? null;
  }

  return viewer;
}
