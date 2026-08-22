/**
 * Batched decimals proofs.
 *
 * The failure worth guarding is positional: `getMultipleAccounts` answers by
 * index, so a response whose length does not match the request silently pairs
 * each mint with its neighbour's account. That would give one token another's
 * decimals — the exact 10^n error the whole chain-proof exists to prevent.
 */

import { describe, expect, it, vi } from "vitest";
import { MintLayout } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  MAX_ACCOUNTS_PER_REQUEST,
  parseMultipleAccounts,
  readMintDecimals,
} from "../../lib/tokens/chain";
import { MINT_ACCOUNT_SIZE } from "../../lib/tokens/mintAccount";
import { TOKEN_PROGRAM_ID } from "../../lib/solana/constants";
import { getClusterConfig } from "../../lib/solana/cluster";

const USDC = getClusterConfig("mainnet-beta").usdcMint;
const WSOL = getClusterConfig("mainnet-beta").wrappedSolMint;
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

function mintAccount(decimals: number, isInitialized = true) {
  const buffer = Buffer.alloc(MINT_ACCOUNT_SIZE);
  MintLayout.encode(
    {
      mintAuthorityOption: 1,
      mintAuthority: Keypair.generate().publicKey,
      supply: 0n,
      decimals,
      isInitialized,
      freezeAuthorityOption: 0,
      freezeAuthority: PublicKey.default,
    },
    buffer,
  );
  return { data: [buffer.toString("base64"), "base64"], owner: TOKEN_PROGRAM_ID };
}

/** 150 genuinely distinct base58 mint-shaped strings. */
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function distinctMints(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const suffix = `${BASE58[Math.floor(i / BASE58.length)]}${BASE58[i % BASE58.length]}`;
    return `${USDC.slice(0, 42)}${suffix}`;
  });
}

function reader(value: unknown[]) {
  return { read: vi.fn(async () => ({ value })) };
}

describe("parseMultipleAccounts", () => {
  it("returns all nulls when the response length disagrees with the request", () => {
    // Zipping a short response would pair mint[1] with account[0]'s decimals.
    const parsed = parseMultipleAccounts({ value: [mintAccount(6)] }, 2);
    expect(parsed).toEqual([null, null]);
  });

  it("returns all nulls for a non-array value", () => {
    expect(parseMultipleAccounts({ value: null }, 2)).toEqual([null, null]);
    expect(parseMultipleAccounts({}, 1)).toEqual([null]);
    expect(parseMultipleAccounts(undefined, 1)).toEqual([null]);
  });

  it("maps a missing account to null in place, preserving position", () => {
    const parsed = parseMultipleAccounts(
      { value: [mintAccount(6), null, mintAccount(9)] },
      3,
    );
    expect(parsed[1]).toBeNull();
    expect(parsed[0]?.owner).toBe(TOKEN_PROGRAM_ID);
    expect(parsed[2]).not.toBeNull();
  });

  it("rejects an entry with an unexpected data encoding", () => {
    expect(
      parseMultipleAccounts({ value: [{ data: "raw-string", owner: TOKEN_PROGRAM_ID }] }, 1),
    ).toEqual([null]);
    expect(parseMultipleAccounts({ value: [{ data: [], owner: TOKEN_PROGRAM_ID }] }, 1)).toEqual([
      null,
    ]);
    expect(parseMultipleAccounts({ value: [{ data: [""] }] }, 1)).toEqual([null]);
  });
});

describe("readMintDecimals", () => {
  it("proves each mint against its own account", async () => {
    const client = reader([mintAccount(6), mintAccount(9), mintAccount(5)]);
    const proven = await readMintDecimals([USDC, WSOL, BONK], client);
    expect(proven.get(USDC)).toBe(6);
    expect(proven.get(WSOL)).toBe(9);
    expect(proven.get(BONK)).toBe(5);
  });

  it("uses `confirmed` — decimals are immutable, so there is nothing to roll back", async () => {
    const client = reader([mintAccount(6)]);
    await readMintDecimals([USDC], client);
    expect(client.read).toHaveBeenCalledWith("getMultipleAccounts", [
      [USDC],
      { encoding: "base64", commitment: "confirmed" },
    ]);
  });

  it("records null for an address that is not a mint", async () => {
    const client = reader([null]);
    const proven = await readMintDecimals([USDC], client);
    // Present-and-null: we looked, and there is nothing there to transact.
    expect(proven.has(USDC)).toBe(true);
    expect(proven.get(USDC)).toBeNull();
  });

  it("records null for an uninitialised mint", async () => {
    const client = reader([mintAccount(6, false)]);
    const proven = await readMintDecimals([USDC], client);
    expect(proven.get(USDC)).toBeNull();
  });

  it("deduplicates and skips implausible mints before spending a request", async () => {
    const client = reader([mintAccount(6)]);
    const proven = await readMintDecimals([USDC, USDC, "garbage"], client);
    expect(client.read).toHaveBeenCalledTimes(1);
    expect(client.read.mock.calls[0]![1]).toEqual([
      [USDC],
      { encoding: "base64", commitment: "confirmed" },
    ]);
    expect(proven.has("garbage")).toBe(false);
  });

  it("chunks at the RPC's 100-address cap", async () => {
    const mints = distinctMints(150);
    const client = {
      read: vi.fn(async (_method: string, params: unknown[]) => ({
        value: (params[0] as string[]).map(() => mintAccount(6)),
      })),
    };
    const proven = await readMintDecimals(mints, client);
    expect(client.read).toHaveBeenCalledTimes(2);
    expect((client.read.mock.calls[0]![1] as unknown[])[0]).toHaveLength(
      MAX_ACCOUNTS_PER_REQUEST,
    );
    expect(proven.size).toBe(150);
  });

  it("does no work at all for an empty request", async () => {
    const client = reader([]);
    expect((await readMintDecimals([], client)).size).toBe(0);
    expect(client.read).not.toHaveBeenCalled();
  });
});
