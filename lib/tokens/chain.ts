/**
 * Proving decimals against the chain, in batches.
 *
 * `getMultipleAccounts` takes up to 100 addresses — the same cap as Jupiter's
 * `/search`, which conveniently means one chunk size serves both halves of a
 * refresh. Unlike Jupiter, the RPC *does* reject an over-long request rather
 * than truncating it, but the cap is enforced here anyway so the two paths stay
 * symmetrical and a future RPC provider cannot surprise us.
 *
 * The result is deliberately a `Map<string, number | null>` rather than an
 * array: `null` means "we read this account and it is not a mint", and an
 * absent key means "we never read it". The transact gate treats those the same
 * way (both refuse), but the cache stores them differently — a proven
 * non-mint is worth remembering, an unread account is not.
 */

import type { SolanaRpcClient } from "../solana/rpc";
import { decodeMintAccount, type MintAccountInfo } from "./mintAccount";
import { isPlausibleMint } from "./types";

/** `getMultipleAccounts` caps at 100 addresses per request. */
export const MAX_ACCOUNTS_PER_REQUEST = 100;

/**
 * Parses a `getMultipleAccounts` result into one slot per requested address.
 *
 * Positional: element *i* of the response describes address *i* of the request.
 * A response whose length does not match the request is unusable — pairing the
 * wrong account with the wrong mint is how a token inherits another's decimals,
 * so a length mismatch yields all-null rather than a best-effort zip.
 */
export function parseMultipleAccounts(
  result: unknown,
  requestedCount: number,
): MintAccountInfo[] {
  const values = (result as { value?: unknown })?.value;
  if (!Array.isArray(values) || values.length !== requestedCount) {
    return Array.from({ length: requestedCount }, () => null);
  }

  return values.map((value) => {
    if (value === null || value === undefined || typeof value !== "object") {
      return null;
    }
    const account = value as Record<string, unknown>;
    const data = account.data;
    if (!Array.isArray(data) || typeof data[0] !== "string") {
      return null;
    }
    if (typeof account.owner !== "string") {
      return null;
    }
    return { dataBase64: data[0], owner: account.owner };
  });
}

export type ChainDecimalsReader = {
  read: SolanaRpcClient["read"];
};

export type ProvenMintEvidence = {
  decimals: number;
  tokenProgramId: string;
};

/** Reads both decimals and the owning token program from the same account proof. */
export async function readMintEvidence(
  mints: readonly string[],
  client: ChainDecimalsReader,
): Promise<Map<string, ProvenMintEvidence | null>> {
  const proven = new Map<string, ProvenMintEvidence | null>();
  const unique = [...new Set(mints)].filter(isPlausibleMint);

  for (let i = 0; i < unique.length; i += MAX_ACCOUNTS_PER_REQUEST) {
    const chunk = unique.slice(i, i + MAX_ACCOUNTS_PER_REQUEST);
    const result = await client.read("getMultipleAccounts", [
      chunk,
      { encoding: "base64", commitment: "confirmed" },
    ]);
    const accounts = parseMultipleAccounts(result, chunk.length);
    chunk.forEach((mint, index) => {
      const account = accounts[index];
      if (!account) {
        proven.set(mint, null);
        return;
      }
      const decoded = decodeMintAccount(account);
      proven.set(
        mint,
        decoded?.isInitialized
          ? { decimals: decoded.decimals, tokenProgramId: account.owner }
          : null,
      );
    });
  }
  return proven;
}

/**
 * Reads decimals for a set of mints.
 *
 * `confirmed` rather than `finalized`: decimals are immutable after
 * `InitializeMint`, so there is no rollback that could change the answer, and
 * `finalized` would add latency to a path a payer is waiting on. This is the
 * one place in the product where `confirmed` is safe, and it is safe because
 * the value being read cannot change, not because the risk is small.
 */
export async function readMintDecimals(
  mints: readonly string[],
  client: ChainDecimalsReader,
): Promise<Map<string, number | null>> {
  const evidence = await readMintEvidence(mints, client);
  const proven = new Map<string, number | null>();
  for (const [mint, row] of evidence) {
    proven.set(mint, row?.decimals ?? null);
  }
  return proven;
}
