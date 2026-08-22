/**
 * Client feature flags — off by default unless explicitly enabled.
 *
 * These read `NEXT_PUBLIC_*` variables, which exist only in the Vercel/Next
 * runtime. Nothing under `convex/` may call them: a `NEXT_PUBLIC_*` read inside
 * a Convex function is always `undefined`, which makes the flag answer a
 * question it was never asked.
 */

export function isExternalWalletEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_FEATURE_EXTERNAL_WALLET?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function isReceiptScanEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_FEATURE_RECEIPT_SCAN?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

// `isDemoModeEnabled()` / NEXT_PUBLIC_DEMO_MODE are gone. Their only purpose was
// gating the "Use sample receipt" affordance, and the mutation behind it
// (`api.receipts.useSampleReceipt`) has been deleted — it seeded a hardcoded
// receipt into a real tab.
