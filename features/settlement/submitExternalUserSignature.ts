/**
 * Features-layer caller for the external-wallet sign path.
 * `recordUserSigned` reads the payer off the stored intent.walletId.
 */

import { signAndSubmitPreparedIntent, type SignPreparedTransaction } from "@/lib/wallet/signAndSubmit";

export type RecordUserSignedFn = (args: {
  intentId: string;
  partialSignedTxBase64: string;
}) => Promise<{ intentId: string; status: string }>;

export async function submitExternalUserSignature(input: {
  intentId: string;
  preparedTxBase64: string;
  signTransaction: SignPreparedTransaction;
  recordUserSigned: RecordUserSignedFn;
}): Promise<{ intentId: string; status: string }> {
  return signAndSubmitPreparedIntent({
    intentId: input.intentId,
    preparedTxBase64: input.preparedTxBase64,
    signTransaction: input.signTransaction,
    submit: input.recordUserSigned,
  });
}
