"use client";

import type { YouSurfaceData } from "@/features/you/types";
import { FIXTURE_YOU_SURFACE } from "@/tests/fixtures/you";

/** Sweep stand-in — see `tests/sweep/README.md`. */
export function useYouSurfaceData(): YouSurfaceData {
  return FIXTURE_YOU_SURFACE;
}
