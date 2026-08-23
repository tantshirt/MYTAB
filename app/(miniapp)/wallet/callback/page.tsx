"use client";

import { useEffect } from "react";
import { MYTAB_COLORS } from "@/lib/theme/tokens";
import {
  parseUniversalLinkSearch,
  writeUniversalLinkCallback,
} from "@/lib/wallet/universalLinks";

/**
 * Return URL for Phantom / Solflare / Backpack universal links (U-10).
 * Writes the callback into sessionStorage. If nothing came back, fail closed.
 * Does not invent a successful link.
 */
export default function WalletCallbackPage() {
  useEffect(() => {
    const parsed = parseUniversalLinkSearch(window.location.search);
    writeUniversalLinkCallback(parsed ?? { ok: false, errorCode: "UL_CALLBACK_MISSING" });
  }, []);

  return (
    <main
      style={{
        minHeight: "var(--app-height, 100dvh)",
        padding: "24px 20px",
        background: MYTAB_COLORS.paper,
        fontFamily: "var(--mytab-font-family)",
        color: MYTAB_COLORS.ink,
      }}
    >
      <p style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>
        Returning to your tab…
      </p>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: "14px",
          lineHeight: 1.5,
          color: MYTAB_COLORS.inkMuted,
        }}
      >
        If nothing happens, go back to Telegram. We never assume the wallet signed.
      </p>
    </main>
  );
}
