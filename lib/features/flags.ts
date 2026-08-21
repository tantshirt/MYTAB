/** Client feature flags — off by default unless explicitly enabled. */

export function isExternalWalletEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_FEATURE_EXTERNAL_WALLET?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function isReceiptScanEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_FEATURE_RECEIPT_SCAN?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function isDemoModeEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_DEMO_MODE?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
