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

/**
 * Retired. Receipt scan is a Convex capability (`api.receipts.isScanEnabled`)
 * when `AI_GATEWAY_API_KEY` is set — never a NEXT_PUBLIC_ flag (D-32).
 */
export function isReceiptScanEnabled(): boolean {
  return false;
}

// `isDemoModeEnabled()` / NEXT_PUBLIC_DEMO_MODE are gone. Their only purpose was
// gating the "Use sample receipt" affordance, and the mutation behind it
// (`api.receipts.useSampleReceipt`) has been deleted — it seeded a hardcoded
// receipt into a real tab.
