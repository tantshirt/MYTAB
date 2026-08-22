"use client";

import type { TipComposerData } from "../../features/tips/useTipComposerData";
import { FIXTURE_TIP_COMPOSER } from "@/tests/fixtures/tips";

export type { TipComposerData };

/** Sweep stand-in — see `tests/sweep/README.md`. */
export function useTipComposerData(_groupId: string | null): TipComposerData {
  return FIXTURE_TIP_COMPOSER;
}
