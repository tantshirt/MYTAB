import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  MEMO_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  USDC_DECIMALS,
  USDC_MINT,
} from "../../lib/solana/constants";
import { computeSettlementMemo } from "../../lib/solana/memoHash";

export const BLOCKHASH = "11111111111111111111111111111111";

export type Actors = {
  payer: Keypair;
  sponsor: Keypair;
  recipient: Keypair;
  attacker: Keypair;
};

/** Deterministic actors so failures are reproducible. */
export function makeActors(seedOffset = 0): Actors {
  const seeded = (n: number) => {
    const seed = new Uint8Array(32);
    seed[0] = n + seedOffset;
    seed[1] = 0x5a;
    return Keypair.fromSeed(seed);
  };
  return {
    payer: seeded(1),
    sponsor: seeded(2),
    recipient: seeded(3),
    attacker: seeded(4),
  };
}

export function ata(owner: PublicKey, mint = new PublicKey(USDC_MINT)): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner);
}

export type BuildOptions = {
  actors: Actors;
  amount?: bigint;
  /** Replace the default instruction list entirely. */
  instructions?: TransactionInstruction[];
  /** Append extra instructions after the standard ones. */
  extraInstructions?: TransactionInstruction[];
  includeAtaCreate?: boolean;
  includeMemo?: boolean;
  memoText?: string;
  computeUnitLimit?: number | null;
  computeUnitPriceMicroLamports?: number | bigint | null;
  /** Put the price instruction before the limit instruction. */
  priceBeforeLimit?: boolean;
  feePayer?: PublicKey;
  blockhash?: string;
  destination?: PublicKey;
  source?: PublicKey;
  authority?: PublicKey;
  useTransferChecked?: boolean;
  extraSigners?: PublicKey[];
};

export function memoFor(tipId: string, amount: bigint): string {
  return computeSettlementMemo({
    tipId,
    targetOutputAtomic: amount.toString(),
    outputMint: USDC_MINT,
    outputDecimals: USDC_DECIMALS,
  });
}

export function buildTx(options: BuildOptions): VersionedTransaction {
  const { actors } = options;
  const amount = options.amount ?? 1_000_000n;
  const mint = new PublicKey(USDC_MINT);
  const payerAta = options.source ?? ata(actors.payer.publicKey);
  const recipientAta = options.destination ?? ata(actors.recipient.publicKey);

  let instructions: TransactionInstruction[];

  if (options.instructions) {
    instructions = options.instructions;
  } else {
    instructions = [];
    const limitIx =
      options.computeUnitLimit === null
        ? null
        : ComputeBudgetProgram.setComputeUnitLimit({
            units: options.computeUnitLimit ?? 200_000,
          });
    const priceIx =
      options.computeUnitPriceMicroLamports === null
        ? null
        : ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: options.computeUnitPriceMicroLamports ?? 50_000,
          });

    if (options.priceBeforeLimit) {
      if (priceIx) instructions.push(priceIx);
      if (limitIx) instructions.push(limitIx);
    } else {
      if (limitIx) instructions.push(limitIx);
      if (priceIx) instructions.push(priceIx);
    }

    if (options.includeAtaCreate) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          actors.sponsor.publicKey,
          recipientAta,
          actors.recipient.publicKey,
          mint,
        ),
      );
    }

    const authority = options.authority ?? actors.payer.publicKey;
    instructions.push(
      options.useTransferChecked
        ? createTransferCheckedInstruction(
            payerAta,
            mint,
            recipientAta,
            authority,
            amount,
            USDC_DECIMALS,
            [],
            new PublicKey(TOKEN_PROGRAM_ID),
          )
        : createTransferInstruction(
            payerAta,
            recipientAta,
            authority,
            amount,
            [],
            new PublicKey(TOKEN_PROGRAM_ID),
          ),
    );

    if (options.includeMemo !== false) {
      instructions.push(
        new TransactionInstruction({
          programId: new PublicKey(MEMO_PROGRAM_ID),
          keys: [],
          data: Buffer.from(
            options.memoText ?? memoFor("tips:test", amount),
            "utf8",
          ),
        }),
      );
    }
  }

  if (options.extraInstructions) {
    instructions.push(...options.extraInstructions);
  }

  const message = new TransactionMessage({
    payerKey: options.feePayer ?? actors.sponsor.publicKey,
    recentBlockhash: options.blockhash ?? BLOCKHASH,
    instructions,
  }).compileToV0Message();

  return new VersionedTransaction(message);
}

export function toBase64(tx: VersionedTransaction): string {
  return Buffer.from(tx.serialize()).toString("base64");
}

/** Signs the message with `signer` and places it in that signer's slot. */
export function signAs(tx: VersionedTransaction, signer: Keypair): VersionedTransaction {
  const messageBytes = tx.message.serialize();
  const signature = ed25519.sign(messageBytes, signer.secretKey.slice(0, 32));
  const index = tx.message.staticAccountKeys.findIndex((key) =>
    key.equals(signer.publicKey),
  );
  if (index < 0 || index >= tx.message.header.numRequiredSignatures) {
    throw new Error("signer is not a required signer of this message");
  }
  tx.signatures[index] = signature;
  return tx;
}

export function systemDrainSponsor(actors: Actors, lamports = 1_000_000_000): TransactionInstruction {
  return SystemProgram.transfer({
    fromPubkey: actors.sponsor.publicKey,
    toPubkey: actors.attacker.publicKey,
    lamports,
  });
}

export { Keypair, PublicKey, TransactionInstruction };
