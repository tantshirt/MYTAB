import type { MutationCtx } from "../_generated/server";
import { TOKEN_PROGRAM_ID, USDC_DECIMALS, USDC_MINT } from "../../lib/solana/constants";
import { resolveCluster } from "../../lib/solana/cluster";
import { metadataFromRow } from "../../lib/tokens/resolve";
import { assertTransactable } from "../../lib/tokens/policy";

/** Resolves a selection back to server-owned, chain-proven token metadata. */
export async function resolveVerifiedReceiveAsset(
  ctx: MutationCtx,
  requestedMint: string | undefined,
  now: number,
): Promise<{ mint: string; symbol: string; decimals: number; tokenProgramId: string }> {
  const mint = requestedMint?.trim() || USDC_MINT;
  if (mint === USDC_MINT) {
    return { mint, symbol: "USDC", decimals: USDC_DECIMALS, tokenProgramId: TOKEN_PROGRAM_ID };
  }
  const cluster = resolveCluster();
  const row = await ctx.db
    .query("tokenMetadata")
    .withIndex("by_cluster_and_mint", (q) => q.eq("cluster", cluster).eq("mint", mint))
    .unique();
  const metadata = row ? metadataFromRow(row) : null;
  const decimals = assertTransactable(metadata, { now, cluster });
  if (row?.tokenProgramId !== TOKEN_PROGRAM_ID) {
    throw new Error("TOKEN_PROGRAM_UNSUPPORTED");
  }
  return { mint, symbol: metadata!.symbol, decimals, tokenProgramId: row.tokenProgramId };
}
