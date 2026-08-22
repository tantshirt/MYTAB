import Link from "next/link";
import { MYTAB_COLORS, MYTAB_LAYOUT, MYTAB_RADIUS, MYTAB_SPACING } from "@/lib/theme/tokens";

/**
 * Route-level 404. Without this, a bad path renders the bare Next.js default
 * inside the Telegram webview. Copy follows §4.3: name the next action, never
 * apologise, never explain the mechanism.
 */
export default function NotFound() {
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
          This link is no longer valid.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 44,
            marginTop: "8px",
            color: MYTAB_COLORS.primary,
            fontSize: "15px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Back to your tabs
        </Link>
      </div>
    </main>
  );
}
