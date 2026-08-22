/**
 * Deep-linked tab fixture — tests and the responsive sweep only.
 *
 * Nothing under `app/`, `features/` or `components/` may import this file.
 */
import type { ResolvedTab } from "../../features/tabs/useTabData";

export const FIXTURE_TAB: ResolvedTab = {
  status: "ready",
  tabId: "tabs:fixture",
  tabName: "Sukhumvit Dinner",
};
