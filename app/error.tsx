"use client";

import { useEffect } from "react";
import { MYTAB_COLORS, MYTAB_LAYOUT, MYTAB_RADIUS, MYTAB_SPACING } from "@/lib/theme/tokens";

type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Route-level error boundary. Without this, a render failure shows the bare
 * Next.js default inside the Telegram webview.
 *
 * Copy follows §4.3: no "Oops", no "Sorry", no error code, no stack trace —
 * the failure names its next action in the same breath.
 */
export default function AppError({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    // The person never sees the mechanism; the console still gets it.
    console.error(error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: MYTAB_COLORS.paper,
        color: MYTAB_COLORS.ink,
        fontFamily: "var(--mytab-font-family)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: MYTAB_LAYOUT.gutter,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: MYTAB_LAYOUT.maxColumnWidth,
          background: MYTAB_COLORS.surface,
          border: `1px solid ${MYTAB_COLORS.border}`,
          borderRadius: MYTAB_RADIUS.md,
          padding: MYTAB_SPACING["5"],
        }}
      >
        <p style={{ margin: 0, fontSize: "15px", fontWeight: 500 }}>
          Couldn&apos;t load that.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: 44,
            marginTop: "8px",
            padding: 0,
            border: "none",
            background: "transparent",
            color: MYTAB_COLORS.primary,
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </main>
  );
}
