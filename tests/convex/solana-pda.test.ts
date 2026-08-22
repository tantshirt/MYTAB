/**
 * The sponsor gate recomputes the recipient's associated token account itself,
 * using a hand-rolled PDA derivation that must run in the Convex default
 * runtime. If that derivation ever disagreed with the on-chain program, the
 * validator would reject legitimate transfers — or, worse, accept a destination
 * that is not the recipient's account.
 *
 * These tests pin it against @solana/spl-token's reference implementation.
 */

import { describe, expect, it } from "vitest";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  deriveAssociatedTokenAddress,
  findProgramAddress,
  isOnCurve,
} from "../../lib/solana/pda";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  USDC_MINT,
} from "../../lib/solana/constants";
import { getClusterConfig } from "../../lib/solana/cluster";
import { base58ToBytes } from "../../lib/solana/decodeTransaction";

function ours(owner: string, mint: string): string {
  return deriveAssociatedTokenAddress({
    owner,
    mint,
    tokenProgramId: TOKEN_PROGRAM_ID,
    associatedTokenProgramId: ASSOCIATED_TOKEN_PROGRAM_ID,
  });
}

describe("associated token address parity", () => {
  it("matches @solana/spl-token across many random owners", () => {
    for (let i = 0; i < 50; i += 1) {
      const owner = Keypair.generate().publicKey;
      const expected = getAssociatedTokenAddressSync(
        new PublicKey(USDC_MINT),
        owner,
      ).toBase58();
      expect(ours(owner.toBase58(), USDC_MINT)).toBe(expected);
    }
  });

  it("matches for both cluster USDC mints", () => {
    const owner = Keypair.generate().publicKey;
    for (const cluster of ["devnet", "mainnet-beta"] as const) {
      const mint = getClusterConfig(cluster).usdcMint;
      expect(ours(owner.toBase58(), mint)).toBe(
        getAssociatedTokenAddressSync(new PublicKey(mint), owner).toBase58(),
      );
    }
  });

  it("gives different owners different accounts", () => {
    const a = Keypair.generate().publicKey.toBase58();
    const b = Keypair.generate().publicKey.toBase58();
    expect(ours(a, USDC_MINT)).not.toBe(ours(b, USDC_MINT));
  });

  it("gives the same owner different accounts per mint", () => {
    const owner = Keypair.generate().publicKey.toBase58();
    expect(ours(owner, getClusterConfig("devnet").usdcMint)).not.toBe(
      ours(owner, getClusterConfig("mainnet-beta").usdcMint),
    );
  });
});

describe("program address derivation", () => {
  it("produces an off-curve address", () => {
    const owner = Keypair.generate().publicKey.toBase58();
    const { address, bump } = findProgramAddress(
      [
        base58ToBytes(owner),
        base58ToBytes(TOKEN_PROGRAM_ID),
        base58ToBytes(USDC_MINT),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    expect(bump).toBeLessThanOrEqual(255);
    expect(isOnCurve(base58ToBytes(address))).toBe(false);
  });

  it("recognises a real public key as on-curve", () => {
    expect(isOnCurve(Keypair.generate().publicKey.toBytes())).toBe(true);
  });

  it("rejects an oversized seed", () => {
    expect(() =>
      findProgramAddress([new Uint8Array(33)], ASSOCIATED_TOKEN_PROGRAM_ID),
    ).toThrow(/PDA_INVALID_SEED/);
  });
});
