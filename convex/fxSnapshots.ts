import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { isFxSnapshotFresh } from "../lib/domain/fx";
import {
  loadFxSnapshotForTabViewer,
  recordBotFxSnapshot,
} from "./lib/fxSnapshotSync";

export {
  FX_SNAPSHOT_NOT_FOR_TAB,
  FX_TAB_NOT_FOUND,
  FxAuthError,
} from "./lib/fxSnapshotSync";

/**
 * Returns the FX snapshot a tab is priced against, for members of that tab's group.
 *
 * Authorization is anchored on the tab, not the snapshot: the caller names the
 * tab they are viewing, group membership is checked against it, and the
 * snapshot id must be the one that tab actually references. A snapshot id alone
 * grants nothing — previously any authenticated caller could read any snapshot.
 */
export const getFxSnapshot = query({
  args: {
    tabId: v.id("tabs"),
    fxSnapshotId: v.id("fxSnapshots"),
  },
  handler: async (ctx, args) => {
    const snapshot = await loadFxSnapshotForTabViewer(
      ctx,
      args.tabId,
      args.fxSnapshotId,
    );
    if (!snapshot) {
      return null;
    }

    return {
      ...snapshot,
      /** Locked tabs keep their snapshot regardless; this is display metadata only. */
      isFresh: isFxSnapshotFresh(snapshot, Date.now()),
    };
  },
});

/** Persists a Bank of Thailand quote fetched by `internal.internal.fx.refreshFxSnapshot`. */
export const recordBotSnapshot = internalMutation({
  args: {
    providerDate: v.string(),
    rateText: v.string(),
  },
  handler: async (ctx, args) => {
    const { fxSnapshotId, created } = await recordBotFxSnapshot(
      ctx,
      { providerDate: args.providerDate, rateText: args.rateText },
      Date.now(),
    );
    return { fxSnapshotId, created };
  },
});
