/**
 * First paint vs. everything after it (POLISH-SPEC §2.2, §2.9; EXPERIENCE,
 * *State Patterns*).
 *
 * A skeleton is a first-paint-only artefact. Convex is reactive, so once a
 * surface has data it is replaced in place — a skeleton over already-correct
 * data is a defect, and a skeleton that flashes on a tab switch is the most
 * common webview tell in this category.
 *
 * Surfaces therefore take two booleans, not one: `loading` says the query has
 * not resolved, `hasCachedData` says this surface has been painted before.
 * Per-tab persistence in the miniapp layout sets the second one.
 */
export type LoadState = {
  /** The underlying read has not resolved yet. */
  loading?: boolean;
  /** This surface already has data — from a previous visit or a warm cache. */
  hasCachedData?: boolean;
};

/** True only on a first paint with nothing to show. */
export function showSkeleton({ loading, hasCachedData }: LoadState): boolean {
  return Boolean(loading) && !hasCachedData;
}
