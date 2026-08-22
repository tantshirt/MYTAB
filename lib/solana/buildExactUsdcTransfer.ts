import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { sha256Hex } from "../crypto/convexCrypto";
import {
  FIXTURE_ATA_RENT_LAMPORTS,
  MEMO_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  USDC_MINT,
} from "./constants";
import { resolveFixtureBlockhash } from "./fixture";
import {
  computeObligationCommitmentHash,
  computeTipIntentCommitmentHash,
} from "./memoHash";

export type BuildExactUsdcTransferInput = {
  payerAddress: string;
  recipientAddress: string;
  sponsorAddress: string;
  amountAtomic: bigint;
  /** Tip target — mutually exclusive with obligation fields. */
  tipId?: string;
  /** Obligation target with bill snapshot binding (Story 6.1 AC6). */
  obligationId?: string;
  billSnapshotHash?: string;
  /** When true, include a create-ATA instruction for the recipient. */
  recipientAtaExists: boolean;
  /** DFlow-routed settlements must not include memo instructions (Story 6.2 AC6). */
  skipMemo?: boolean;
  blockhash?: string;
  lastValidBlockHeight?: number;
};

export type BuildExactUsdcTransferResult = {
  serializedBase64: string;
  messageHash: string;
  blockhash: string;
  lastValidBlockHeight: number;
  ataCreates: number;
  sponsorExposureLamports: number;
  computeUnits: number;
  priorityFeeLamports: number;
};

const DEFAULT_COMPUTE_UNITS = 200_000;
const DEFAULT_PRIORITY_FEE_LAMPORTS = 10_000;

function hashSerializedMessage(serializedMessage: Uint8Array): string {
  return sha256Hex(serializedMessage);
}

/**
 * Builds an exact USDC transfer with the sponsor as fee payer (FR-S3, Story 3.3).
 * Uses @solana/kit for address validation and @solana/web3.js for compilation.
 */
export function buildExactUsdcTransfer(
  input: BuildExactUsdcTransferInput,
): BuildExactUsdcTransferResult {
  // Validate addresses via web3.js (kit peer tree stays Privy-compatible).
  new PublicKey(input.payerAddress);
  new PublicKey(input.recipientAddress);
  new PublicKey(input.sponsorAddress);

  const fixture = resolveFixtureBlockhash();
  const blockhash = input.blockhash ?? fixture.blockhash;
  const lastValidBlockHeight =
    input.lastValidBlockHeight ?? fixture.lastValidBlockHeight;

  const payer = new PublicKey(input.payerAddress);
  const recipient = new PublicKey(input.recipientAddress);
  const sponsor = new PublicKey(input.sponsorAddress);
  const mint = new PublicKey(USDC_MINT);

  const payerAta = getAssociatedTokenAddressSync(mint, payer);
  const recipientAta = getAssociatedTokenAddressSync(mint, recipient);

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: DEFAULT_COMPUTE_UNITS }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: Math.floor(
        (DEFAULT_PRIORITY_FEE_LAMPORTS * 1_000_000) / DEFAULT_COMPUTE_UNITS,
      ),
    }),
  ];

  let ataCreates = 0;
  let sponsorExposureLamports = DEFAULT_PRIORITY_FEE_LAMPORTS;

  if (!input.recipientAtaExists) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        sponsor,
        recipientAta,
        recipient,
        mint,
      ),
    );
    ataCreates = 1;
    sponsorExposureLamports += FIXTURE_ATA_RENT_LAMPORTS;
  }

  instructions.push(
    createTransferInstruction(
      payerAta,
      recipientAta,
      payer,
      input.amountAtomic,
      [],
      new PublicKey(TOKEN_PROGRAM_ID),
    ),
  );

  const memoText =
    input.obligationId && input.billSnapshotHash
      ? computeObligationCommitmentHash({
          obligationId: input.obligationId,
          billSnapshotHash: input.billSnapshotHash,
          targetOutputAtomic: input.amountAtomic.toString(),
          outputMint: USDC_MINT,
          outputDecimals: 6,
        })
      : computeTipIntentCommitmentHash({
          tipId: input.tipId ?? input.obligationId ?? "unknown",
          targetOutputAtomic: input.amountAtomic.toString(),
          outputMint: USDC_MINT,
          outputDecimals: 6,
        });

  if (!input.skipMemo) {
    instructions.push({
      programId: new PublicKey(MEMO_PROGRAM_ID),
      keys: [],
      data: Buffer.from(memoText, "utf8"),
    });
  }

  const message = new TransactionMessage({
    payerKey: sponsor,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);
  const serialized = transaction.serialize();
  const serializedBase64 = Buffer.from(serialized).toString("base64");
  const messageHash = hashSerializedMessage(transaction.message.serialize());

  return {
    serializedBase64,
    messageHash,
    blockhash,
    lastValidBlockHeight,
    ataCreates,
    sponsorExposureLamports,
    computeUnits: DEFAULT_COMPUTE_UNITS,
    priorityFeeLamports: DEFAULT_PRIORITY_FEE_LAMPORTS,
  };
}

/** Rebuilds a versioned transaction from base64 for validation tests. */
export function parseVersionedTransactionBase64(serializedBase64: string): VersionedTransaction {
  return VersionedTransaction.deserialize(Buffer.from(serializedBase64, "base64"));
}

/** Mutates a serialized transaction for negative validation fixtures. */
export function mutateTransactionBase64(
  serializedBase64: string,
  mutator: (tx: VersionedTransaction) => void,
): string {
  const tx = parseVersionedTransactionBase64(serializedBase64);
  mutator(tx);
  return Buffer.from(tx.serialize()).toString("base64");
}
