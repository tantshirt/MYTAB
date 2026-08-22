"use client";

/*
 * Sweep stand-in — see `tests/sweep/README.md`.
 *
 * Everything except the hook is re-exported from the real module by a RELATIVE
 * path. `next.config.ts` aliases the request string `@/features/tabs/useTabData`
 * only, so a relative request reaches the real file and the refusal vocabulary
 * below is the shipped one rather than a copy that could drift from it.
 */
export {
  INVALID_LINK_MESSAGE,
  TAB_REFUSAL_ACTION,
  TAB_REFUSAL_ACTION_LABEL,
  refusalFor,
  refusedTab,
} from "../../features/tabs/useTabData";
export type {
  ResolvedTab,
  TabGroupFacts,
  TabRefusal,
  TabRefusalAction,
  TabRefusalCode,
} from "../../features/tabs/useTabData";

import type { ResolvedTab } from "../../features/tabs/useTabData";
import { FIXTURE_TAB } from "@/tests/fixtures/tabs";

export function useResolvedTab(publicToken: string, _retryNonce = 0): ResolvedTab {
  return publicToken ? FIXTURE_TAB : { status: "loading" };
}
