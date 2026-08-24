/**
 * Token metadata: the server-side cache and the narrow read the app calls.
 *
 * Shape of the thing, and why:
 *
 *  - **`getTokenMetadata` is a query and touches no network.** It reads cache
 *    rows for an explicit list of mints. That makes it reactive, free, and
 *    incapable of pulling a megabyte onto a phone. The Mini App's First Load JS
 *    is the product's weak point; a payer standing at a restaurant till must
 *    not be downloading a token registry to read the word "USDC".
 *  - **`ensureTokenMetadata` is the action that fills the cache**, called only
 *    when the query reports something missing or stale. It fetches Jupiter and
 *    the chain, then writes rows the query picks up reactively.
 *  - **Nothing here is public in the "open API" sense.** Both entry points
 *    require an authenticated caller. That is partly egress control — an
 *    unauthenticated action that triggers outbound fetches is an amplifier —
 *    and partly Jupiter's licence, which forbids re-serving their content as
 *    our own API.
 *
 * The cluster is read from configuration on every call and written into every
 * row. A row from the other cluster is never served, because devnet USDC and
 * mainnet USDC are different mints and serving one for the other is not a
 * staleness bug, it is naming the wrong token.
 */

import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { AuthError, UNAUTHORIZED, requireIdentity } from "./lib/auth";
import { resolveCluster, type SolanaCluster } from "../lib/solana/cluster";
import { createSolanaRpcClient } from "../lib/solana/rpc";
import {
  JUPITER_ATTRIBUTION,
  fetchJupiterTokensChunked,
  jupiterSupportsCluster,
} from "../lib/tokens/jupiter";
import { readMintEvidence } from "../lib/tokens/chain";
import {
  assertSnapshotAgreesWithCanonical,
  reconcileWithCanonical,
} from "../lib/tokens/canonical";
import {
  buildTokenRows,
  metadataFromRow,
  reconcileEntriesWithChain,
  resolveFromCache,
  type TokenCacheRow,
} from "../lib/tokens/resolve";
import {
  TOKEN_METADATA_FAILURE,
  TokenMetadataError,
  isPlausibleMint,
  type RawTokenListEntry,
  type TokenLookupResult,
} from "../lib/tokens/types";
import { TOKEN_METADATA_FRESH_MS } from "../lib/tokens/policy";
import { TOKEN_PROGRAM_ID, USDC_MINT } from "../lib/solana/constants";
import { assertTransactable } from "../lib/tokens/policy";

/**
 * Hard cap on a single request.
 *
 * A payment sheet asks about the tokens one payer holds; a wallet with more
 * than this many distinct mints is a dust-spam wallet, not a use case. The cap
 * bounds both the Convex read and the fan-out to Jupiter and the RPC.
 */
export const MAX_MINTS_PER_QUERY = 60;

/**
 * How long a failed registry fetch suppresses the next attempt.
 *
 * Jupiter's free tier is 60 requests per minute, shared across their whole API.
 * Without a cooldown, a Mini App re-rendering against a cache miss turns every
 * frame into an outbound request and burns the budget in seconds — and the
 * cache would still be empty afterwards.
 */
export const SOURCE_COOLDOWN_MS = 60_000;

type TokensQueryCtx = QueryCtx;
type TokensMutationCtx = MutationCtx;

function activeCluster(): SolanaCluster {
  return resolveCluster();
}

/** Row shape the pure resolver expects, from the stored document. */
function toCacheRow(doc: Doc<"tokenMetadata">): TokenCacheRow {
  return {
    cluster: doc.cluster,
    mint: doc.mint,
    symbol: doc.symbol,
    name: doc.name,
    decimals: doc.decimals,
    logoUri: doc.logoUri,
    verified: doc.verified,
    source: doc.source,
    existsOnChain: doc.existsOnChain,
    fetchedAt: doc.fetchedAt,
    decimalsVerifiedAt: doc.decimalsVerifiedAt,
    tokenProgramId: doc.tokenProgramId,
    updatedAt: doc.updatedAt,
  };
}

/** Normalises and bounds the caller's mint list before anything touches it. */
function normalizeMints(mints: readonly string[]): string[] {
  const unique = [...new Set(mints.map((mint) => mint.trim()))].filter(
    (mint) => mint.length > 0,
  );
  if (unique.length > MAX_MINTS_PER_QUERY) {
    throw new TokenMetadataError(
      TOKEN_METADATA_FAILURE.SOURCE_MALFORMED,
      `requested ${unique.length} mints; the cap is ${MAX_MINTS_PER_QUERY}`,
    );
  }
  return unique;
}

async function loadRows(
  ctx: TokensQueryCtx | TokensMutationCtx,
  cluster: SolanaCluster,
  mints: readonly string[],
): Promise<TokenCacheRow[]> {
  const rows: TokenCacheRow[] = [];
  for (const mint of mints) {
    const doc = await ctx.db
      .query("tokenMetadata")
      .withIndex("by_cluster_and_mint", (q) =>
        q.eq("cluster", cluster).eq("mint", mint),
      )
      .unique();
    if (doc) {
      rows.push(toCacheRow(doc));
    }
  }
  return rows;
}

/**
 * Metadata for a specific set of mints. **This is the query the payment sheet
 * calls.**
 *
 * ```ts
 * const result = useQuery(api.tokens.getTokenMetadata, {
 *   mints: heldMints,        // the mints this payer actually holds
 *   verifiedOnly: true,      // the default posture for a payment surface
 * });
 * ```
 *
 * Every requested mint comes back with an explicit status — `ok`, `unknown`, or
 * `unavailable` with a reason — so the sheet can render "USDC", "unlisted
 * token", and "we could not check this" as the three different things they are.
 * It must never collapse them into a mint address and a Pay button.
 *
 * `needsRefresh` is the signal to call `ensureTokenMetadata` once. It is not an
 * error; the results alongside it are still the best available answer.
 */
export const getTokenMetadata = query({
  args: {
    mints: v.array(v.string()),
    /** Default true. A payment surface should not turn this off casually. */
    verifiedOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const cluster = activeCluster();
    const mints = normalizeMints(args.mints);
    const now = Date.now();

    const cached = await loadRows(ctx, cluster, mints);
    const resolved = resolveFromCache({
      requested: mints,
      cached,
      cluster,
      now,
      verifiedOnly: args.verifiedOnly ?? true,
    });

    const needsRefresh = [
      ...new Set([...resolved.missingMints, ...resolved.staleMints]),
    ];

    return {
      cluster,
      generatedAt: now,
      /** Required by Jupiter's licence wherever this data is shown. */
      attribution: JUPITER_ATTRIBUTION,
      tokens: resolved.results,
      /** Pass straight back into `ensureTokenMetadata` when non-empty. */
      needsRefresh,
      /** Mints whose decimals are not chain-proven: displayable, not payable. */
      unprovenMints: resolved.unprovenMints,
    };
  },
});

/** Named, fresh, legacy-SPL receive assets for the organizer setup picker. */
export const listVerifiedReceiveAssets = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    const cluster = activeCluster();
    const now = Date.now();
    const docs = await ctx.db
      .query("tokenMetadata")
      .withIndex("by_cluster_and_fetched", (q) => q.eq("cluster", cluster))
      .order("desc")
      .take(MAX_MINTS_PER_QUERY);
    const assets = [{ mint: USDC_MINT, symbol: "USDC", name: "USD Coin" }];
    for (const doc of docs) {
      if (doc.mint === USDC_MINT || doc.tokenProgramId !== TOKEN_PROGRAM_ID) {
        continue;
      }
      const metadata = metadataFromRow(toCacheRow(doc));
      try {
        assertTransactable(metadata, { now, cluster });
      } catch {
        continue;
      }
      assets.push({ mint: doc.mint, symbol: metadata!.symbol, name: metadata!.name });
    }
    return assets;
  },
});

/** Internal: the same resolution, for server-side callers with no identity. */
export const readCached = internalQuery({
  args: { mints: v.array(v.string()) },
  handler: async (ctx, args) => {
    const cluster = activeCluster();
    const mints = normalizeMints(args.mints);
    const now = Date.now();
    const cached = await loadRows(ctx, cluster, mints);
    return {
      cluster,
      ...resolveFromCache({ requested: mints, cached, cluster, now }),
    };
  },
});

/** Internal: is the registry in a cooldown after a recent failure? */
export const readSourceStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cluster = activeCluster();
    const status = await ctx.db
      .query("tokenSourceStatus")
      .withIndex("by_cluster_and_source", (q) =>
        q.eq("cluster", cluster).eq("source", "jupiter"),
      )
      .unique();
    return {
      cluster,
      cooldownUntil: status?.cooldownUntil ?? 0,
      consecutiveFailures: status?.consecutiveFailures ?? 0,
      lastSuccessAt: status?.lastSuccessAt ?? null,
    };
  },
});

const rowValidator = v.object({
  mint: v.string(),
  symbol: v.optional(v.string()),
  name: v.optional(v.string()),
  decimals: v.optional(v.number()),
  logoUri: v.optional(v.string()),
  verified: v.boolean(),
  source: v.union(
    v.literal("cluster_pin"),
    v.literal("jupiter"),
    v.literal("chain"),
  ),
  existsOnChain: v.optional(v.boolean()),
  fetchedAt: v.number(),
  decimalsVerifiedAt: v.optional(v.number()),
  tokenProgramId: v.optional(v.string()),
});

/**
 * Writes refreshed rows.
 *
 * Upsert by (cluster, mint). The cluster is taken from configuration rather
 * than from the caller so a bug in an action can never write a mainnet row into
 * devnet's namespace.
 *
 * A refresh never *downgrades* an existing decimals proof: if the row already
 * carries `decimalsVerifiedAt` and the new write does not (because the RPC was
 * unavailable this time), the old proof is kept. Losing it would take a
 * perfectly good token off the payment path for the duration of an RPC blip.
 */
export const commitRows = internalMutation({
  args: { rows: v.array(rowValidator) },
  handler: async (ctx, args) => {
    const cluster = activeCluster();
    const now = Date.now();
    let written = 0;

    for (const row of args.rows) {
      if (!isPlausibleMint(row.mint)) {
        continue;
      }
      const existing = await ctx.db
        .query("tokenMetadata")
        .withIndex("by_cluster_and_mint", (q) =>
          q.eq("cluster", cluster).eq("mint", row.mint),
        )
        .unique();

      const decimalsVerifiedAt =
        row.decimalsVerifiedAt ?? existing?.decimalsVerifiedAt;
      // Keeping an old proof is only sound if the decimals it proved are the
      // ones being stored. If the value changed, the old proof is void.
      const proofStillApplies =
        row.decimalsVerifiedAt !== undefined ||
        (existing !== null && existing.decimals === row.decimals);

      const fields = {
        cluster,
        mint: row.mint,
        symbol: row.symbol,
        name: row.name,
        decimals: row.decimals,
        logoUri: row.logoUri,
        verified: row.verified,
        source: row.source,
        existsOnChain: row.existsOnChain ?? existing?.existsOnChain,
        fetchedAt: row.fetchedAt,
        decimalsVerifiedAt: proofStillApplies ? decimalsVerifiedAt : undefined,
        tokenProgramId:
          row.tokenProgramId ??
          (proofStillApplies ? existing?.tokenProgramId : undefined),
        updatedAt: now,
      };

      if (existing) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert("tokenMetadata", fields);
      }
      written += 1;
    }

    return { written };
  },
});

/** Records the outcome of a registry attempt and sets the cooldown. */
export const recordSourceAttempt = internalMutation({
  args: {
    ok: v.boolean(),
    failureCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const cluster = activeCluster();
    const now = Date.now();
    const existing = await ctx.db
      .query("tokenSourceStatus")
      .withIndex("by_cluster_and_source", (q) =>
        q.eq("cluster", cluster).eq("source", "jupiter"),
      )
      .unique();

    const consecutiveFailures = args.ok
      ? 0
      : (existing?.consecutiveFailures ?? 0) + 1;

    // Exponential, capped. A registry that is down stays out of the way rather
    // than being re-probed on every cache miss.
    const cooldownUntil = args.ok
      ? undefined
      : now + Math.min(SOURCE_COOLDOWN_MS * 2 ** (consecutiveFailures - 1), 15 * 60_000);

    const fields = {
      cluster,
      source: "jupiter" as const,
      lastAttemptAt: now,
      lastSuccessAt: args.ok ? now : existing?.lastSuccessAt,
      lastFailureAt: args.ok ? existing?.lastFailureAt : now,
      lastFailureCode: args.ok ? existing?.lastFailureCode : args.failureCode,
      consecutiveFailures,
      cooldownUntil,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("tokenSourceStatus", fields);
    }
  },
});

export type RefreshOutcome = {
  refreshed: number;
  listed: number;
  proven: number;
  conflicts: number;
  sourceOk: boolean;
  sourceSkipped: boolean;
};

/**
 * The refresh itself. Internal, so the cron can run it without an identity.
 *
 * Fail-soft by design. Every outcome — registry down, RPC down, mint listed
 * nowhere, registry contradicting the chain — resolves to *some* cache state
 * rather than an exception, because the alternative is a payment sheet that
 * renders nothing. What it never does is manufacture a transactable record:
 * an unproven or unlisted mint gets a row that `assertTransactable` refuses.
 *
 * The registry half and the chain half are deliberately independent. Either can
 * fail without taking the other down, and the two failures degrade differently:
 * no registry means no name, no chain means no payment.
 */
export const refreshMints = internalAction({
  args: { mints: v.array(v.string()) },
  handler: async (ctx, args): Promise<RefreshOutcome> => {
    const cluster = resolveCluster();
    const mints = normalizeMints(args.mints).filter(isPlausibleMint);
    if (mints.length === 0) {
      return {
        refreshed: 0,
        listed: 0,
        proven: 0,
        conflicts: 0,
        sourceOk: true,
        sourceSkipped: true,
      };
    }

    const now = Date.now();
    const status = await ctx.runQuery(internal.tokens.readSourceStatus, {});
    const inCooldown = status.cooldownUntil > now;

    // ---- Registry half -------------------------------------------------
    let entries: RawTokenListEntry[] = [];
    let sourceOk = true;
    let sourceSkipped = inCooldown || !jupiterSupportsCluster(cluster);
    let failureCode: string | undefined;

    if (!sourceSkipped) {
      try {
        const raw = await fetchJupiterTokensChunked(mints, {
          cluster,
          apiKey: process.env.JUPITER_API_KEY,
        });
        // Pins outrank the registry. A registry that contradicts a pinned mint's
        // decimals throws here, and the throw is the point: that is a corrupt or
        // wrong-cluster list, and quietly preferring our value would hide it.
        assertSnapshotAgreesWithCanonical({ entries: raw, cluster });
        entries = raw.map((entry) => reconcileWithCanonical({ entry, cluster }));
      } catch (error) {
        sourceOk = false;
        failureCode =
          error instanceof TokenMetadataError
            ? error.code
            : TOKEN_METADATA_FAILURE.SOURCE_UNAVAILABLE;
      }
      await ctx.runMutation(internal.tokens.recordSourceAttempt, {
        ok: sourceOk,
        failureCode,
      });
    }

    // ---- Chain half ----------------------------------------------------
    // Independent of the registry on purpose. If Jupiter is down we can still
    // prove decimals and cache a usable negative row; if the RPC is down we can
    // still cache labels, which display fine and stay off the transact path.
    let chainDecimals = new Map<string, number | null>();
    let chainTokenPrograms = new Map<string, string>();
    try {
      const client = createSolanaRpcClient();
      const evidence = await readMintEvidence(mints, client);
      chainDecimals = new Map(
        [...evidence].map(([mint, row]) => [mint, row?.decimals ?? null]),
      );
      chainTokenPrograms = new Map(
        [...evidence]
          .filter((entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] !== null)
          .map(([mint, row]) => [mint, row.tokenProgramId]),
      );
    } catch {
      // RPC unconfigured or unreachable. No proof this round; rows keep any
      // proof they already had, and unproven mints stay unpayable.
      chainDecimals = new Map();
    }

    const reconciled = reconcileEntriesWithChain({ entries, chainDecimals });

    const rows = buildTokenRows({
      requested: mints,
      entries: reconciled.entries,
      chainDecimals,
      chainTokenPrograms,
      cluster,
      now: Date.now(),
    });

    const { written } = await ctx.runMutation(internal.tokens.commitRows, {
      rows: rows.map(({ cluster: _cluster, updatedAt: _updatedAt, ...rest }) => rest),
    });

    return {
      refreshed: written,
      listed: reconciled.entries.length,
      proven: [...chainDecimals.values()].filter((value) => value !== null).length,
      conflicts: reconciled.conflicts.length,
      sourceOk,
      sourceSkipped,
    };
  },
});

/**
 * Fills the cache for a set of mints. **Call this once when
 * `getTokenMetadata` reports `needsRefresh`**; the query then updates
 * reactively.
 *
 * A thin authenticated wrapper over {@link refreshMints}. The auth check is not
 * about protecting token metadata — symbols are not secret — it is egress
 * control. This is the one entry point a client can use to make the server
 * issue outbound requests, and Jupiter's free tier is 60 per minute shared
 * across their whole API.
 */
export const ensureTokenMetadata = action({
  args: { mints: v.array(v.string()) },
  handler: async (ctx, args): Promise<RefreshOutcome> => {
    // `requireIdentity` is typed for query/mutation contexts; an action reads
    // the same identity directly.
    if (!(await ctx.auth.getUserIdentity())) {
      throw new AuthError(UNAUTHORIZED);
    }
    return await ctx.runAction(internal.tokens.refreshMints, { mints: args.mints });
  },
});

/**
 * Explicit bounded import path for organizer receive assets.
 *
 * This is deliberately mint-scoped: Jupiter does not provide a trustworthy
 * finite "all verified tokens" list, while `/search` can prove an exact mint.
 * Setup tooling can import a reviewed mint here and the named picker then reads
 * it from the cache; discovery never relies on a payer opening an unrelated
 * payment sheet first.
 */
export type ImportVerifiedReceiveAssetsResult = {
  assets: Array<{ mint: string; symbol: string; name: string }>;
  attribution: typeof JUPITER_ATTRIBUTION;
};

export const importVerifiedReceiveAssets = action({
  args: { mints: v.array(v.string()) },
  handler: async (ctx, args): Promise<ImportVerifiedReceiveAssetsResult> => {
    if (!(await ctx.auth.getUserIdentity())) {
      throw new AuthError(UNAUTHORIZED);
    }
    const mints = normalizeMints(args.mints).filter((mint) => mint !== USDC_MINT);
    await ctx.runAction(internal.tokens.refreshMints, { mints });
    const resolved = await ctx.runQuery(internal.tokens.readCached, { mints }) as {
      results: TokenLookupResult[];
    };
    const cluster = activeCluster();
    const now = Date.now();
    const assets: ImportVerifiedReceiveAssetsResult["assets"] = resolved.results.flatMap((result) => {
      if (result.status !== "ok" || result.metadata.mint === USDC_MINT) return [];
      try {
        assertTransactable(result.metadata, { now, cluster });
      } catch {
        return [];
      }
      const row = result.metadata;
      return [{ mint: row.mint, symbol: row.symbol, name: row.name }];
    });
    return { assets, attribution: JUPITER_ATTRIBUTION };
  },
});

/**
 * Internal: the oldest cached mints for the active cluster.
 *
 * Ordered by `fetchedAt` ascending via `by_cluster_and_fetched`, so a sweep
 * always works on the stalest rows first and a large cache converges instead of
 * repeatedly refreshing whichever mints happen to sort first by address.
 */
export const listStaleMints = internalQuery({
  args: { limit: v.number(), staleBefore: v.number() },
  handler: async (ctx, args) => {
    const cluster = activeCluster();
    const docs = await ctx.db
      .query("tokenMetadata")
      .withIndex("by_cluster_and_fetched", (q) =>
        q.eq("cluster", cluster).lt("fetchedAt", args.staleBefore),
      )
      .order("asc")
      .take(Math.min(args.limit, MAX_MINTS_PER_QUERY));
    return docs.map((doc) => doc.mint);
  },
});

/**
 * Cron entry point: keeps already-cached rows inside their freshness window.
 *
 * A safety net, not the primary path — `ensureTokenMetadata` refreshes on
 * demand. Without this, freshness would depend on a client remembering to act
 * on `needsRefresh`, and a mint nobody happened to open for a week would hit
 * the expiry cliff and go unpayable at exactly the wrong moment.
 *
 * Bounded to one batch per run so the sweep can never outrun Jupiter's rate
 * limit no matter how large the cache grows.
 */
export const refreshStaleTokens = internalAction({
  args: {},
  handler: async (ctx): Promise<{ swept: number }> => {
    const mints: string[] = await ctx.runQuery(internal.tokens.listStaleMints, {
      limit: MAX_MINTS_PER_QUERY,
      staleBefore: Date.now() - TOKEN_METADATA_FRESH_MS,
    });
    if (mints.length === 0) {
      return { swept: 0 };
    }
    await ctx.runAction(internal.tokens.refreshMints, { mints });
    return { swept: mints.length };
  },
});
