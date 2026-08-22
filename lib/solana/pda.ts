/**
 * Program-derived address helpers, dependency-free apart from @noble.
 *
 * The sponsor policy must recompute the recipient's associated token account
 * itself. Trusting the destination account that arrives inside a client-supplied
 * transaction is the single largest hole in a sponsored-transfer design: the
 * payer signs blind, the sponsor pays the fee, and the obligation is marked
 * settled while the USDC lands in an attacker-controlled account.
 */

import { sha256Bytes } from "../crypto/convexCrypto";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58ToBytes, bytesToBase58 } from "./decodeTransaction";

export const PDA_FAILURE = {
  NO_VIABLE_BUMP: "PDA_NO_VIABLE_BUMP",
  INVALID_SEED: "PDA_INVALID_SEED",
} as const;

export class PdaError extends Error {
  constructor(public readonly code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "PdaError";
  }
}

const PDA_MARKER = new TextEncoder().encode("ProgramDerivedAddress");
const MAX_SEED_LENGTH = 32;

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) {
    total += part.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** True when the 32 bytes decompress to a valid ed25519 point (i.e. a real key). */
export function isOnCurve(publicKey: Uint8Array): boolean {
  try {
    ed25519.Point.fromBytes(publicKey);
    return true;
  } catch {
    return false;
  }
}

export function createProgramAddress(
  seeds: readonly Uint8Array[],
  programId: string,
): Uint8Array | null {
  for (const seed of seeds) {
    if (seed.length > MAX_SEED_LENGTH) {
      throw new PdaError(PDA_FAILURE.INVALID_SEED, `${seed.length} bytes`);
    }
  }

  const digest = sha256Bytes(
    concatBytes([...seeds, base58ToBytes(programId), PDA_MARKER]),
  );

  return isOnCurve(digest) ? null : digest;
}

/** Canonical (highest-bump) program-derived address. */
export function findProgramAddress(
  seeds: readonly Uint8Array[],
  programId: string,
): { address: string; bump: number } {
  for (let bump = 255; bump >= 0; bump -= 1) {
    const address = createProgramAddress(
      [...seeds, Uint8Array.from([bump])],
      programId,
    );
    if (address) {
      return { address: bytesToBase58(address), bump };
    }
  }
  throw new PdaError(PDA_FAILURE.NO_VIABLE_BUMP);
}

/**
 * Associated token account for `owner`/`mint` under `tokenProgramId`.
 * Seeds are exactly [owner, tokenProgram, mint] per the SPL ATA program.
 */
export function deriveAssociatedTokenAddress(input: {
  owner: string;
  mint: string;
  tokenProgramId: string;
  associatedTokenProgramId: string;
}): string {
  return findProgramAddress(
    [
      base58ToBytes(input.owner),
      base58ToBytes(input.tokenProgramId),
      base58ToBytes(input.mint),
    ],
    input.associatedTokenProgramId,
  ).address;
}
