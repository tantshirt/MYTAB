function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

/** Corrective receipt copy keyed to stable backend/local failure codes. */
export function receiptFailureMessage(error: unknown): string {
  const detail = errorDetail(error);
  if (detail.includes("RECEIPT_PAGE_LIMIT_EXCEEDED")) {
    return "Choose no more than 8 photos.";
  }
  if (detail.includes("RECEIPT_IMAGE_TYPE_UNSUPPORTED")) {
    return "Use JPEG, PNG, or WebP photos.";
  }
  if (detail.includes("RECEIPT_IMAGE_TOO_LARGE")) {
    return "Use photos under 8 MB each and 32 MB altogether.";
  }
  if (detail.includes("RECEIPT_SCHEMA_REJECTED") || detail.includes("RECEIPT_GATEWAY_FAILED")) {
    return "We couldn't read that receipt. Try clearer photos or add the items manually.";
  }
  if (detail.includes("RECONCILIATION_BLOCKED")) {
    return "The items and receipt total still don't match. Check the amounts and try again.";
  }
  if (detail.includes("RECEIPT_LOW_CONFIDENCE_UNRESOLVED")) {
    return "Check every highlighted field before confirming.";
  }
  if (detail.includes("RECEIPT_CURRENCY_RELABEL_REFUSED") || detail.includes("RECEIPT_CURRENCY_MISMATCH")) {
    return "This receipt uses a different currency. Keep the detected currency or add the items manually.";
  }
  if (detail.includes("RECEIPT_CURRENCY_FX_UNAVAILABLE")) {
    return "That receipt currency isn't available right now. Add the items manually.";
  }
  if (detail.includes("TICKET_EXPIRED")) {
    return "The upload expired. Choose the photos again.";
  }
  return "Could not read the receipt. Try again or add the items manually.";
}

export function receiptConfirmationFailureMessage(error: unknown): string {
  const detail = errorDetail(error);
  if (
    detail.includes("RECONCILIATION_BLOCKED") ||
    detail.includes("RECEIPT_LOW_CONFIDENCE_UNRESOLVED") ||
    detail.includes("RECEIPT_CURRENCY_")
  ) {
    return receiptFailureMessage(error);
  }
  return "Could not confirm the receipt.";
}
