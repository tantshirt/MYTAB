"use client";

import { useEffect, useState } from "react";

/**
 * "Has this surface ever painted with data in this session?"
 *
 * The half of `LoadState` a surface can answer for itself. A skeleton is a
 * first-paint artefact: on a tab switch the three tab-bar surfaces re-mount,
 * and without this every switch would flash `colors/sunk` over data the client
 * already holds (POLISH-SPEC §2.9, EXPERIENCE *State Patterns*).
 *
 * Deliberately `false` on the server and on the first client render of a key:
 * the server has no session, so claiming a warm cache there would render an
 * empty surface and then disagree with the client at hydration.
 */
const PAINTED = new Set<string>();

export function useHasPainted(key: string): boolean {
  const [painted] = useState(() =>
    typeof window === "undefined" ? false : PAINTED.has(key),
  );

  useEffect(() => {
    PAINTED.add(key);
  }, [key]);

  return painted;
}

/** Test seam — a fresh session per test file. */
export function resetPaintedSurfaces(): void {
  PAINTED.clear();
}
