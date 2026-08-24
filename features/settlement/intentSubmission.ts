export type IntentWriter = (args: {
  obligationId: string;
  inputMint: string;
  idempotencyKey: string;
}) => Promise<unknown>;

/** Shared shipping seam for initial selection, token replacement, and refresh. */
export async function submitPaymentIntent(input: {
  obligationId: string;
  inputMint: string;
  idempotencyKey: string;
  writer: IntentWriter;
}): Promise<{ inputMint: string; obligationId?: string }> {
  const result = await input.writer({
    obligationId: input.obligationId,
    inputMint: input.inputMint,
    idempotencyKey: input.idempotencyKey,
  });
  const obligationId =
    result && typeof result === "object" && "obligationId" in result &&
      typeof result.obligationId === "string"
      ? result.obligationId
      : undefined;
  return { inputMint: input.inputMint, obligationId };
}
